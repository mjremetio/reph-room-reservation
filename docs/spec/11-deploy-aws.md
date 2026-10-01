# 11 · Deploy on AWS (ECS Fargate or EC2)

The app ships as one container image. Run it on **ECS Fargate behind an Application Load Balancer** (§1–§6, recommended for the company account), on a single **EC2** instance with the image from ECR (§7), or on **one EC2 server used like a VPS**, with Docker Compose and Caddy for HTTPS and no other AWS services (§8, the quickest way to a working URL). The ECS steps are written so an agent can run them end to end with the AWS CLI, without clicking in the console. Every step is safe to re-run.

Tested: the image builds and runs locally (health check healthy, pages and API answer, runs as a non-root user, no `.env` files inside). The §8 bundle was run end to end on a fresh Ubuntu 24.04 machine (29 Sep 2026; see §8). The AWS commands follow the AWS CLI v2 reference but have not yet been run against a real account: run them in a sandbox account first. Confirm the region, VPC, subnets and who may reach the app with IT before production.

## 1. What runs

| Part | Choice |
|---|---|
| Image | `Dockerfile` below: Node 22 Alpine, Next.js standalone server (`node server.js`) on port 3000, user `app`, health check `GET /api/health` |
| Registry | Amazon ECR repository `reph-rooms` |
| Compute | ECS cluster `reph-rooms`, Fargate, **exactly one task** (0.5 vCPU, 1 GB) |
| Traffic | ALB → target group (IP targets, port 3000, health `/api/health`); ALB idle timeout **120 s** so the assistant's streamed replies (up to 90 s) are not cut |
| Secrets | `OPENAI_API_KEY` and `SESSION_SECRET` (signs the sign-in cookie; required in production) in AWS Secrets Manager (`reph-rooms/openai-api-key`, `reph-rooms/session-secret`), injected at start; never in the image or the task definition's plain env |
| Logs | CloudWatch Logs group `/ecs/reph-rooms` (the assistant route logs one JSON line per run) |

**Why exactly one task:** the demo gateway, proposals, rate limits and the demo clock live in the server's memory (09 Reliability). Two tasks would each have their own bookings. Keep `desiredCount` 1 and no auto scaling until the real gateway (08) replaces the mock, or give the tasks a shared Redis (Upstash REST: `KV_REST_API_URL` and `KV_REST_API_TOKEN` as secrets; 09, Shared state): then every task loads and saves one state, and only rate limits and the demo clock stay per task. Deployments stop the old task before the new one starts (`minimumHealthyPercent 0`, `maximumPercent 100`), so there is about a minute of downtime per deploy and the demo week restarts.

**Who can reach it:** only the three demo accounts get past the sign-in screen (09 Security), but the demo sign-in is not company sign-in. Still use an **internal** ALB reached over the company network or VPN, or restrict the ALB security group to the office IP ranges. Set a monthly usage limit on the OpenAI account.

## 2. Files in the repo

`next.config.ts` switches on the standalone build and sends security headers on every path (no framing, so the MCP consent screen can't be clickjacked; nosniff; referrer policy):

<!-- verbatim: next.config.ts -->
```ts
import type { NextConfig } from 'next';

/** No page may be shown inside another site's frame (clickjacking, e.g. on the MCP consent screen), and no sniffing. */
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

/** `standalone` builds a self-contained server (`.next/standalone/server.js`) for the container image (docs/spec/11-deploy-aws.md). */
const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
```

`Dockerfile`:

<!-- verbatim: Dockerfile -->
```dockerfile
# Container image for AWS ECS (Fargate) or EC2 (docs/spec/11-deploy-aws.md).
#   docker build -t reph-rooms .
#   docker run -p 3000:3000 --env-file .env.local reph-rooms
# Secrets (OPENAI_API_KEY) are passed at run time, never baked into the image.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
```

`.dockerignore` (`scripts/` stays in the context: `next build` type-checks the tests, and one imports `scripts/spec-verbatim.ts`):

<!-- verbatim: .dockerignore -->
```
# Keep the build context small and never send local secrets into an image (docs/spec/11-deploy-aws.md).
.git
.next
node_modules
.env
.env*.local
.claude
docs
evals/last-run.md
*.log
dist
```

Local check before any deploy (the image runs in production mode, so `.env.local` needs `SESSION_SECRET` for sign-in):

```bash
docker build -t reph-rooms .
docker run --rm -p 3000:3000 --env-file .env.local reph-rooms
curl -s http://localhost:3000/api/health   # {"ok":true,"gateway":"mock","scenario":"demo","openai":"configured",...}
```

## 3. Prerequisites

- AWS CLI v2 with credentials that may manage ECR, ECS, IAM roles, Secrets Manager, CloudWatch Logs, EC2 security groups and ELB (`aws sts get-caller-identity` works).
- Docker, and the repo checked out with `.env.local` holding `OPENAI_API_KEY` (10 §3.3).
- A VPC with two subnets in different Availability Zones. Private subnets need a NAT gateway (the task calls OpenAI); in public subnets set `ASSIGN_IP=ENABLED` below.
- For HTTPS: an ACM certificate for the host name (optional; without it the listener is HTTP).

## 4. Deploy (first time)

Set the variables once per shell. Region: Singapore is closest to Manila; confirm with IT.

```bash
set -euo pipefail
export AWS_REGION=ap-southeast-1
export APP=reph-rooms
export VPC_ID=vpc-xxxxxxxx
export SUBNETS=subnet-aaaaaaaa,subnet-bbbbbbbb   # two AZs
export ALLOWED_CIDR=10.0.0.0/8                   # who may open the app (office or VPN range)
export ALB_SCHEME=internal                       # or internet-facing
export ASSIGN_IP=DISABLED                        # ENABLED in public subnets without NAT
export CERT_ARN=                                 # ACM certificate ARN for HTTPS, or empty for HTTP
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_URI=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$APP
export TAG=$(git rev-parse --short HEAD)
```

**4.1 Image to ECR**

```bash
aws ecr describe-repositories --repository-names $APP >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name $APP --image-scanning-configuration scanOnPush=true
aws ecr get-login-password | docker login --username AWS --password-stdin ${ECR_URI%/*}
docker build --platform linux/amd64 -t $ECR_URI:$TAG .
docker push $ECR_URI:$TAG
```

**4.2 Secrets** (the key is read from `.env.local`; the session secret is made once and kept; neither is printed)

```bash
KEY=$(grep -E '^OPENAI_API_KEY=' .env.local | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')
SECRET_ARN=$(aws secretsmanager describe-secret --secret-id $APP/openai-api-key --query ARN --output text 2>/dev/null \
  || aws secretsmanager create-secret --name $APP/openai-api-key --secret-string "$KEY" --query ARN --output text)
aws secretsmanager put-secret-value --secret-id $APP/openai-api-key --secret-string "$KEY" >/dev/null
unset KEY
# Session secret: created once; replacing it signs everyone out.
SESSION_ARN=$(aws secretsmanager describe-secret --secret-id $APP/session-secret --query ARN --output text 2>/dev/null \
  || aws secretsmanager create-secret --name $APP/session-secret \
       --secret-string "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")" --query ARN --output text)
```

**4.3 Roles, logs, cluster**

```bash
cat > /tmp/ecs-trust.json <<'JSON'
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}
JSON
aws iam get-role --role-name $APP-exec >/dev/null 2>&1 \
  || aws iam create-role --role-name $APP-exec --assume-role-policy-document file:///tmp/ecs-trust.json >/dev/null
aws iam attach-role-policy --role-name $APP-exec --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam put-role-policy --role-name $APP-exec --policy-name read-openai-secret \
  --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"secretsmanager:GetSecretValue\",\"Resource\":[\"$SECRET_ARN\",\"$SESSION_ARN\"]}]}"
EXEC_ROLE_ARN=$(aws iam get-role --role-name $APP-exec --query Role.Arn --output text)
aws logs create-log-group --log-group-name /ecs/$APP 2>/dev/null || true
aws ecs create-cluster --cluster-name $APP >/dev/null
```

**4.4 Task definition** (the environment matches `.env.example`: `DEMO_NOW` empty = the real time in Asia/Manila; set it to `2026-09-28T09:00:00+08:00` to replay the scripted demo week)

```bash
cat > /tmp/taskdef.json <<JSON
{
  "family": "$APP",
  "requiresCompatibilities": ["FARGATE"],
  "networkMode": "awsvpc",
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "$EXEC_ROLE_ARN",
  "runtimePlatform": { "cpuArchitecture": "X86_64", "operatingSystemFamily": "LINUX" },
  "containerDefinitions": [{
    "name": "$APP",
    "image": "$ECR_URI:$TAG",
    "essential": true,
    "portMappings": [{ "containerPort": 3000, "protocol": "tcp" }],
    "environment": [
      { "name": "OPENAI_MODEL", "value": "gpt-5.6-luna" },
      { "name": "RESERVATION_GATEWAY", "value": "mock" },
      { "name": "MOCK_SCENARIO", "value": "demo" },
      { "name": "DEMO_NOW", "value": "" },
      { "name": "OPENAI_TRACING", "value": "false" }
    ],
    "secrets": [
      { "name": "OPENAI_API_KEY", "valueFrom": "$SECRET_ARN" },
      { "name": "SESSION_SECRET", "valueFrom": "$SESSION_ARN" }
    ],
    "healthCheck": {
      "command": ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1"],
      "interval": 30, "timeout": 5, "retries": 3, "startPeriod": 20
    },
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": { "awslogs-group": "/ecs/$APP", "awslogs-region": "$AWS_REGION", "awslogs-stream-prefix": "app" }
    }
  }]
}
JSON
TASKDEF_ARN=$(aws ecs register-task-definition --cli-input-json file:///tmp/taskdef.json --query taskDefinition.taskDefinitionArn --output text)
```

**4.5 Load balancer and security groups**

```bash
ALB_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$APP-alb Name=vpc-id,Values=$VPC_ID --query 'SecurityGroups[0].GroupId' --output text)
[ "$ALB_SG" = "None" ] && ALB_SG=$(aws ec2 create-security-group --group-name $APP-alb --description "$APP load balancer" --vpc-id $VPC_ID --query GroupId --output text)
TASK_SG=$(aws ec2 describe-security-groups --filters Name=group-name,Values=$APP-task Name=vpc-id,Values=$VPC_ID --query 'SecurityGroups[0].GroupId' --output text)
[ "$TASK_SG" = "None" ] && TASK_SG=$(aws ec2 create-security-group --group-name $APP-task --description "$APP task" --vpc-id $VPC_ID --query GroupId --output text)
PORT=$([ -n "$CERT_ARN" ] && echo 443 || echo 80)
aws ec2 authorize-security-group-ingress --group-id $ALB_SG --protocol tcp --port $PORT --cidr $ALLOWED_CIDR 2>/dev/null || true
aws ec2 authorize-security-group-ingress --group-id $TASK_SG --protocol tcp --port 3000 --source-group $ALB_SG 2>/dev/null || true

ALB_ARN=$(aws elbv2 describe-load-balancers --names $APP --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null \
  || aws elbv2 create-load-balancer --name $APP --scheme $ALB_SCHEME --type application \
       --subnets ${SUBNETS//,/ } --security-groups $ALB_SG --query 'LoadBalancers[0].LoadBalancerArn' --output text)
aws elbv2 modify-load-balancer-attributes --load-balancer-arn $ALB_ARN --attributes Key=idle_timeout.timeout_seconds,Value=120 >/dev/null
TG_ARN=$(aws elbv2 describe-target-groups --names $APP --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null \
  || aws elbv2 create-target-group --name $APP --protocol HTTP --port 3000 --vpc-id $VPC_ID --target-type ip \
       --health-check-path /api/health --matcher HttpCode=200 --query 'TargetGroups[0].TargetGroupArn' --output text)
if [ -z "$(aws elbv2 describe-listeners --load-balancer-arn $ALB_ARN --query 'Listeners[0].ListenerArn' --output text | grep -v None)" ]; then
  if [ -n "$CERT_ARN" ]; then
    aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTPS --port 443 --certificates CertificateArn=$CERT_ARN \
      --default-actions Type=forward,TargetGroupArn=$TG_ARN >/dev/null
  else
    aws elbv2 create-listener --load-balancer-arn $ALB_ARN --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn=$TG_ARN >/dev/null
  fi
fi
```

**4.6 Service**

```bash
if [ "$(aws ecs describe-services --cluster $APP --services $APP --query 'services[0].status' --output text 2>/dev/null)" = "ACTIVE" ]; then
  aws ecs update-service --cluster $APP --service $APP --task-definition $TASKDEF_ARN >/dev/null
else
  aws ecs create-service --cluster $APP --service-name $APP --task-definition $TASKDEF_ARN --desired-count 1 --launch-type FARGATE \
    --deployment-configuration minimumHealthyPercent=0,maximumPercent=100 \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$TASK_SG],assignPublicIp=$ASSIGN_IP}" \
    --load-balancers targetGroupArn=$TG_ARN,containerName=$APP,containerPort=3000 --health-check-grace-period-seconds 30 >/dev/null
fi
aws ecs wait services-stable --cluster $APP --services $APP
URL=$([ -n "$CERT_ARN" ] && echo https || echo http)://$(aws elbv2 describe-load-balancers --load-balancer-arns $ALB_ARN --query 'LoadBalancers[0].DNSName' --output text)
echo "$URL"
```

## 5. Smoke test (run after every deploy)

From a machine that can reach the app (`URL` = the ALB address, or the `https://…` address from §8). It signs in with a demo account (set `REPH_USER` and `REPH_PASS`; the owner has the passwords), books and then cancels Cape Town for an hour starting two hours from the app's own clock (so it works with the real clock and with `DEMO_NOW`), so nothing is left behind, and signs out.

```bash
curl -fsS "$URL/api/health"                                   # "ok":true, "openai":"configured"
test "$(curl -s -o /dev/null -w '%{http_code}' "$URL/")" = 200
read -r START END < <(curl -fsS "$URL/api/health" | python3 -c 'import sys,json,datetime as d
n=d.datetime.fromisoformat(json.load(sys.stdin)["now"].replace("Z","+00:00")).astimezone(d.timezone(d.timedelta(hours=8)))
s=(n+d.timedelta(hours=2)).replace(minute=0,second=0,microsecond=0);print(s.isoformat(),(s+d.timedelta(hours=1)).isoformat())')
JAR=$(mktemp); H=(-H "content-type: application/json" -H "origin: $URL" -b "$JAR" -c "$JAR")
test "$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/rooms")" = 401   # nothing without signing in
curl -fsS "${H[@]}" -X POST "$URL/api/session" -d "{\"username\":\"$REPH_USER\",\"password\":\"$REPH_PASS\"}" >/dev/null
P=$(curl -fsS "${H[@]}" -X POST "$URL/api/proposals" \
  -d "{\"roomId\":\"capetown\",\"agendaType\":\"Meeting\",\"agenda\":\"Deploy smoke test\",\"start\":\"$START\",\"end\":\"$END\",\"participants\":4}")
T=$(curl -fsS "${H[@]}" -X POST "$URL/api/proposals/$(echo "$P" | python3 -c 'import sys,json;print(json.load(sys.stdin)["proposal"]["id"])')" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["booking"]["ticketNo"])')
C=$(curl -fsS "${H[@]}" -X POST "$URL/api/proposals" -d "{\"action\":\"cancel\",\"ticketNo\":\"$T\"}")
curl -fsS "${H[@]}" -X POST "$URL/api/proposals/$(echo "$C" | python3 -c 'import sys,json;print(json.load(sys.stdin)["cancel"]["proposalId"])')" >/dev/null
curl -fsS "${H[@]}" -X DELETE "$URL/api/session" >/dev/null; rm -f "$JAR"
# MCP for AI apps (05, MCP): metadata names this server, and /api/mcp wants a token
curl -fsS "$URL/.well-known/oauth-protected-resource/api/mcp" | grep -q "\"resource\":\"$URL/api/mcp\""
curl -s -D - -o /dev/null -X POST "$URL/api/mcp" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"ping"}' | grep -qi '^www-authenticate: Bearer resource_metadata='
echo "smoke test passed ($T booked and cancelled; MCP sign-in advertised)"
```

`START` is the next full hour two hours from the app's clock, in `+08:00`. The proposal fails (409) only if Cape Town or the signed-in account already has a booking then (one room per person at a time); run it again an hour later or pick another room.

## 6. Update and roll back

- **Update:** set `TAG` to the new commit, then run 4.1 (build and push), 4.4 (register a new revision) and 4.6 (update the service), then §5. Nothing else changes.
- **Roll back:** `aws ecs update-service --cluster $APP --service $APP --task-definition $APP:<previous revision>` and `aws ecs wait services-stable …`. List revisions with `aws ecs list-task-definitions --family-prefix $APP --sort DESC`.
- **Logs:** `aws logs tail /ecs/$APP --follow`.
- **Reset the demo week:** `aws ecs update-service --cluster $APP --service $APP --force-new-deployment`.

## 7. EC2 instead of ECS (image from ECR)

For one small server that runs the image pushed in 4.1 (e.g. `t3.small`, Amazon Linux 2023, instance role with `AmazonEC2ContainerRegistryReadOnly` and `secretsmanager:GetSecretValue` on both secrets). Without ECR and Secrets Manager, use §8 instead.

```bash
sudo dnf install -y docker && sudo systemctl enable --now docker
aws ecr get-login-password --region $AWS_REGION | sudo docker login --username AWS --password-stdin ${ECR_URI%/*}
KEY=$(aws secretsmanager get-secret-value --secret-id reph-rooms/openai-api-key --query SecretString --output text)
SESSION=$(aws secretsmanager get-secret-value --secret-id reph-rooms/session-secret --query SecretString --output text)
sudo docker run -d --name reph-rooms --restart unless-stopped -p 3000:3000 \
  -e OPENAI_API_KEY="$KEY" -e SESSION_SECRET="$SESSION" -e OPENAI_MODEL=gpt-5.6-luna -e RESERVATION_GATEWAY=mock -e MOCK_SCENARIO=demo \
  -e DEMO_NOW= -e OPENAI_TRACING=false $ECR_URI:$TAG
unset KEY SESSION
```

Put it behind the ALB from 4.5 (target type `instance`, port 3000) for HTTPS and the 120 s idle timeout, or open port 3000 only to the office range. Update: pull the new tag, `docker rm -f reph-rooms`, run again.

## 8. One EC2 server (VPS style): Docker Compose and Caddy

The quickest way to a working HTTPS address: one EC2 instance used like a VPS. No ECR, ALB or Secrets Manager. The server builds the image from a source bundle, runs it with Docker Compose, and **Caddy** in front gets and renews a Let's Encrypt certificate on its own. Everything lives in `deploy/ec2/`:

| File | Job |
|---|---|
| `compose.yaml` | Project `reph-rooms`: `app` (built from the repo's `Dockerfile`, image `reph-rooms:latest`, settings from `${REPH_ENV_FILE:-.env}`, port 3000 only on the internal network) and `caddy` (`caddy:2-alpine`, ports `${HTTP_PORT:-80}` and `${HTTPS_PORT:-443}`, starts once the app's health check passes, volumes `caddy_data` and `caddy_config` keep the certificates); `json-file` logs capped at 10 MB × 3 |
| `Caddyfile` | `{$SITE_ADDRESS}` → `reverse_proxy app:3000`, zstd/gzip, `Strict-Transport-Security: max-age=31536000` (P1-36), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, no `Server` header. A host name gets HTTPS automatically; `:80` serves plain HTTP. The assistant's `text/event-stream` replies pass straight through, with no time limit |
| `env.example` | The settings template: `SITE_ADDRESS`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `SESSION_SECRET`, `RESERVATION_GATEWAY`, `MOCK_SCENARIO`, `DEMO_NOW` (empty = the real Asia/Manila time), `OPENAI_TRACING` |
| `deploy.sh` | Runs on the server (re-runs itself with `sudo`). First run: installs Docker with the Compose and Buildx plugins (Ubuntu 22.04/24.04 through `get.docker.com`; Amazon Linux 2023 through `dnf install docker` plus the two plugins from their GitHub releases), adds a 2 GB swap file when the server has under 3.5 GB of memory (the image build needs about 2 GB), and writes the settings to **`/etc/reph-rooms/.env`** (root only, mode 600, outside the code so each new bundle can be unpacked fresh): a generated `SESSION_SECRET`, `SITE_ADDRESS` = `<public-ip-with-dashes>.sslip.io` when empty (public IP from the EC2 metadata service, IMDSv2, else `checkip.amazonaws.com`), and it asks for `OPENAI_API_KEY` (hidden input, Enter skips) when run in a terminal. Every run: tags the running image `reph-rooms:previous`, builds `app`, `docker compose up -d` (fails with the app's last 80 log lines if it never gets healthy), prunes dangling images and checks `/api/health` (through `https://SITE_ADDRESS`, or `http://127.0.0.1:<HTTP_PORT>` for a `:port` address). `deploy.sh rollback` tags `previous` as `latest` again and restarts without building |
| `package.sh` | `npm run package:ec2` on your computer: refuses uncommitted changes, `git archive`s the last commit to `dist/reph-rooms-<commit>.tar.gz` (no secrets, no `node_modules`; `dist/` is git- and docker-ignored) and prints the upload commands |

**8.1 Launch the server** (console or CLI): Ubuntu Server 24.04 LTS (Amazon Linux 2023 works too), `t3.small` or larger (`t3.medium` builds faster), 20 GB gp3, region `ap-southeast-1`. Attach an **Elastic IP** so the address (and the `sslip.io` name) stays the same across stop and start. Security group: SSH (22) from your own IP only; **HTTP (80) and HTTPS (443) from anywhere**, because Let's Encrypt must reach the server to issue the certificate. For a real DNS name (e.g. `rooms.example.com`), point an A record at the Elastic IP first and put it in `SITE_ADDRESS`.

**8.2 Upload and deploy** (from the repo on your computer; `KEY` = the key pair's `.pem`, `HOST` = `ubuntu@<Elastic IP>`, or `ec2-user@…` on Amazon Linux):

```bash
npm run package:ec2                                   # dist/reph-rooms-<commit>.tar.gz
scp -i KEY dist/reph-rooms-<commit>.tar.gz HOST:
ssh -t -i KEY HOST 'tar xzf reph-rooms-<commit>.tar.gz && sudo ./reph-rooms-<commit>/deploy/ec2/deploy.sh'
```

The first run takes a few minutes (Docker, then the image build), asks for the OpenAI key and ends with `Up: https://<ip-with-dashes>.sslip.io`. To use your own name later: `sudo nano /etc/reph-rooms/.env`, set `SITE_ADDRESS=rooms.example.com`, run `deploy.sh` again. Then run the smoke test (§5) with `URL` set to that address.

**8.2a Connect an AI app** (MCP, 05): the MCP URL is `https://<SITE_ADDRESS>/api/mcp` (also under **AI apps** in the app's user menu). In Claude: Settings → Connectors → Add custom connector, paste the URL, Connect; in ChatGPT: Settings → Apps & Connectors → Developer mode → Create, the URL, OAuth; in Claude Code: `claude mcp add --transport http reph-rooms https://<SITE_ADDRESS>/api/mcp`, then `/mcp`. Sign in on the consent screen and press **Allow**; then ask "Who booked Central Park today?" and book something: the app returns a confirm link, which opens the card in REPH Rooms. Needs a real HTTPS address (a DNS name or the `sslip.io` one), because Claude and ChatGPT connect from the internet. MCP relies on one server's memory for used codes, refresh-token rotation and confirm links, which is why this one-server setup is the hackathon's target (09, MCP and OAuth threat model).

**8.3 Update, roll back, look after it**

- **Update:** commit, `npm run package:ec2`, upload the new bundle and run its `deploy.sh` as in 8.2 (the settings in `/etc/reph-rooms/.env` stay). About a minute of downtime; the in-memory demo data starts over.
- **Roll back:** `sudo ./reph-rooms-<commit>/deploy/ec2/deploy.sh rollback` (any unpacked bundle works: it switches to the image that ran before the last deploy).
- **Logs:** `sudo docker compose -p reph-rooms logs -f app` (Caddy and certificates: `… logs caddy`).
- **Reset the demo week:** `sudo docker restart reph-rooms-app-1`.
- **Change a setting** (key, model, `DEMO_NOW`): edit `/etc/reph-rooms/.env`, run `deploy.sh` again.
- The containers restart on their own after a crash or a reboot (`restart: unless-stopped`; Docker starts at boot).

**Caveats**

- `sslip.io` is a third-party DNS service that turns `1-2-3-4.sslip.io` into `1.2.3.4`: fine for a demo, but use your own DNS name for anything beyond that.
- Restricting 80/443 to the office ranges stops Let's Encrypt from issuing the certificate. If IT wants the app office-only, set `SITE_ADDRESS=:80` and put the server behind the company's proxy or the ALB from 4.5 (which does HTTPS), or reach it over the VPN.
- Like ECS, keep **one** server while the gateway is the mock (§1).
- Tested on 29 Sep 2026: first deploy, update and rollback on a fresh Ubuntu 24.04 machine (OrbStack, arm64) with `SITE_ADDRESS=:80`, `HTTP_PORT=8080`: Docker installed, image built, Caddy started after the health check, sign-in and the API worked through the proxy (gzip and headers on, settings file root-only with a generated secret), `rollback` switched back to the previous image. The Amazon Linux 2023 install path was checked in an `amazonlinux:2023` container (`dnf install docker`, Compose v5.5.1, Buildx v0.37.1). Not yet run on a real EC2 instance, and the Let's Encrypt step needs a public address to test.

Files (`deploy/ec2/`):

<!-- verbatim: deploy/ec2/compose.yaml -->
```yaml
# One EC2 server (docs/spec/11-deploy-aws.md §8): the app container from the repo's Dockerfile, Caddy in front
# for HTTPS (a Let's Encrypt certificate for SITE_ADDRESS, renewed on its own), and Redis on this server, so the
# state (bookings, accounts, messages) survives restarts and deploys. Settings and secrets live outside the code, in
# /etc/reph-rooms/.env on the server (REPH_ENV_FILE; from env.example). Run it with deploy.sh.
name: reph-rooms

x-logs: &logs
  logging:
    driver: json-file
    options: { max-size: 10m, max-file: '3' }

services:
  app:
    build:
      context: ../..
      dockerfile: Dockerfile
    image: reph-rooms:latest
    env_file: ${REPH_ENV_FILE:-.env}
    restart: unless-stopped
    depends_on:
      redis-http: { condition: service_started }
    # Only Caddy reaches the app; port 3000 is never published.
    expose: ['3000']
    <<: *logs

  # The shared state, saved on this server's disk (append-only file in the redis_data volume). Never published.
  redis:
    image: redis:7-alpine
    command: ['redis-server', '--appendonly', 'yes']
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 3s
      retries: 5
    volumes:
      - redis_data:/data
    <<: *logs

  # The app speaks the Upstash REST API (src/lib/kv.ts); this proxy speaks it for the Redis above. deploy.sh writes
  # KV_REST_API_URL=http://redis-http and the token to the settings. Only the app reaches it.
  redis-http:
    image: hiett/serverless-redis-http:0.0.10
    restart: unless-stopped
    depends_on:
      redis: { condition: service_healthy }
    environment:
      SRH_MODE: env
      SRH_TOKEN: ${KV_REST_API_TOKEN:?run deploy.sh, which sets KV_REST_API_TOKEN in /etc/reph-rooms/.env}
      SRH_CONNECTION_STRING: redis://redis:6379
    expose: ['80']
    <<: *logs

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    depends_on:
      app: { condition: service_healthy }
    ports:
      - '${HTTP_PORT:-80}:80'
      - '${HTTPS_PORT:-443}:443'
    environment:
      SITE_ADDRESS: ${SITE_ADDRESS:?set SITE_ADDRESS in /etc/reph-rooms/.env}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    <<: *logs

volumes:
  caddy_data:
  caddy_config:
  redis_data:
```

<!-- verbatim: deploy/ec2/Caddyfile -->
```
# Caddy in front of the app (docs/spec/11-deploy-aws.md §8). A host name as SITE_ADDRESS gets HTTPS on its own
# (Let's Encrypt; ports 80 and 443 must be open); ":80" serves plain HTTP. The assistant's streamed replies
# (text/event-stream) are passed through as they come, with no time limit.
{$SITE_ADDRESS} {
	encode zstd gzip
	reverse_proxy app:3000
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
}
```

<!-- verbatim: deploy/ec2/env.example -->
```bash
# Settings for the EC2 server (docs/spec/11-deploy-aws.md §8). deploy.sh copies this to /etc/reph-rooms/.env the
# first time (root only), fills in SESSION_SECRET, SITE_ADDRESS and KV_REST_API_TOKEN, and asks for OPENAI_API_KEY.
# Edit it there.

# Where people open the app. A DNS name that points at this server's (Elastic) IP gets HTTPS automatically,
# e.g. rooms.example.com. Left empty, deploy.sh uses <public-ip>.sslip.io (HTTPS without your own domain).
# ":80" serves plain HTTP (only behind a load balancer or proxy that does HTTPS).
SITE_ADDRESS=

# OpenAI powers the assistant (server-side only). Without it the map, table and forms still work.
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna

# Signs the sign-in cookie: 32+ random characters. deploy.sh makes one; changing it signs everyone out.
SESSION_SECRET=

# Reservation data: the mock of the tool until IT connects the real one (docs/spec/08-integration.md).
RESERVATION_GATEWAY=mock
# "empty" = no bookings, only the sign-in accounts as people; "demo" = the scripted demo week (data/scenarios/demo.json).
MOCK_SCENARIO=empty
# Empty = the real time in Asia/Manila (with MOCK_SCENARIO=demo, the demo bookings move into the current week).
# 2026-09-28T09:00:00+08:00 replays the scripted demo week instead (the clock restarts there on every start).
DEMO_NOW=

# The state (bookings, accounts, messages) lives in Redis on this server (compose.yaml: redis, redis-http), so it
# survives restarts and deploys. deploy.sh fills in the token; an Upstash database's URL and token work here too.
KV_REST_API_URL=http://redis-http
KV_REST_API_TOKEN=

# true lets the test Admin (admin.test@email.com, a short known password) sign in on this server. Anyone who guesses
# it gets Admin; empty switches it off.
ENABLE_TEST_ADMIN=true

OPENAI_TRACING=false
```

<!-- verbatim: deploy/ec2/deploy.sh -->
```bash
#!/usr/bin/env bash
# Deploys the REPH Room Assistant on one EC2 server (docs/spec/11-deploy-aws.md §8). Run it on the server from an
# unpacked bundle (deploy/ec2/package.sh makes one):
#
#   sudo ./reph-rooms-<commit>/deploy/ec2/deploy.sh             build this version and switch to it
#   sudo ./reph-rooms-<commit>/deploy/ec2/deploy.sh rollback    go back to the image that ran before
#
# Safe to re-run. The first run installs Docker (Ubuntu 22.04/24.04; Amazon Linux 2023), adds swap on small
# instances and writes the settings to /etc/reph-rooms/.env (it asks for the OpenAI key). Every run rebuilds the
# image and restarts the app: about a minute of downtime. The state (bookings, accounts, messages) stays in Redis on
# this server.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || exec sudo -E bash "$0" "$@"
cd "$(dirname "$0")"

SETTINGS=/etc/reph-rooms/.env
export REPH_ENV_FILE=$SETTINGS
compose() { docker compose --env-file "$SETTINGS" "$@"; }
say() { printf '\033[1m==> %s\033[0m\n' "$*"; }
setting() { grep -E "^$1=" "$SETTINGS" | tail -1 | cut -d= -f2- || true; }
set_setting() {
  if grep -qE "^$1=" "$SETTINGS"; then sed -i "s|^$1=.*|$1=$2|" "$SETTINGS"; else echo "$1=$2" >>"$SETTINGS"; fi
}
random_secret() { head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-48; }

install_docker() {
  if docker compose version >/dev/null 2>&1 && docker buildx version >/dev/null 2>&1; then return; fi
  say "Installing Docker"
  . /etc/os-release
  case "$ID" in
    ubuntu | debian) curl -fsSL https://get.docker.com | sh ;;
    amzn)
      dnf install -y docker
      local plugins=/usr/local/lib/docker/cli-plugins arch buildx
      arch=$(uname -m) # x86_64 or aarch64
      mkdir -p "$plugins"
      curl -fsSL -o "$plugins/docker-compose" "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$arch"
      buildx=$(basename "$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/docker/buildx/releases/latest)")
      curl -fsSL -o "$plugins/docker-buildx" \
        "https://github.com/docker/buildx/releases/download/$buildx/buildx-$buildx.linux-$([ "$arch" = aarch64 ] && echo arm64 || echo amd64)"
      chmod +x "$plugins/docker-compose" "$plugins/docker-buildx"
      ;;
    *) echo "Unsupported system ($ID). Use Ubuntu 24.04 or Amazon Linux 2023, or install Docker with Compose yourself." >&2; exit 1 ;;
  esac
  systemctl enable --now docker
}

# The image build (npm ci, next build) needs about 2 GB of memory; t3.small and smaller get a swap file.
ensure_swap() {
  local mem_mb
  mem_mb=$(awk '/MemTotal/ { print int($2 / 1024) }' /proc/meminfo)
  if [ "$mem_mb" -ge 3500 ] || [ -n "$(swapon --show --noheadings 2>/dev/null)" ]; then return; fi
  say "Adding a 2 GB swap file"
  if { [ -f /swapfile ] || fallocate -l 2G /swapfile; } && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile; then
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
  else
    echo "Could not add swap; the build may run out of memory on a small instance." >&2
  fi
}

public_ip() {
  local token
  token=$(curl -fsS -m 2 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null || true)
  if [ -n "$token" ]; then
    curl -fsS -m 2 -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null && return
  fi
  curl -fsS -m 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]'
}

ensure_settings() {
  if [ ! -f "$SETTINGS" ]; then
    say "Writing $SETTINGS"
    install -d -m 700 "$(dirname "$SETTINGS")"
    install -m 600 env.example "$SETTINGS"
  fi
  if [ -z "$(setting SESSION_SECRET)" ]; then
    set_setting SESSION_SECRET "$(random_secret)"
  fi
  # Redis on this server (compose.yaml); settings from before it get it too.
  [ -n "$(setting KV_REST_API_URL)" ] || set_setting KV_REST_API_URL http://redis-http
  [ -n "$(setting KV_REST_API_TOKEN)" ] || set_setting KV_REST_API_TOKEN "$(random_secret)"
  # The test Admin, as the owner asked for this server; an explicit "ENABLE_TEST_ADMIN=" (off) is kept.
  grep -qE '^ENABLE_TEST_ADMIN=' "$SETTINGS" || set_setting ENABLE_TEST_ADMIN true
  if [ -z "$(setting SITE_ADDRESS)" ]; then
    local ip
    ip=$(public_ip)
    if [ -z "$ip" ]; then echo "No public IP found. Set SITE_ADDRESS in $SETTINGS (a DNS name, or :80)." >&2; exit 1; fi
    set_setting SITE_ADDRESS "${ip//./-}.sslip.io"
  fi
  if [ -z "$(setting OPENAI_API_KEY)" ] && [ -t 0 ]; then
    local key
    read -r -s -p "OpenAI API key for the assistant (Enter to skip): " key
    echo
    [ -z "$key" ] || set_setting OPENAI_API_KEY "$key"
  fi
  [ -n "$(setting OPENAI_API_KEY)" ] || echo "No OPENAI_API_KEY in $SETTINGS: the assistant stays off (the map and forms work). Add it and run this again." >&2
}

# Where people open it; with "local", where this server checks it (plain HTTP answers on the local port).
site_url() {
  local site port
  site=$(setting SITE_ADDRESS)
  port=$(setting HTTP_PORT)
  case "$site" in
    :*) if [ "${1:-}" = local ]; then echo "http://127.0.0.1:${port:-80}"; else echo "http://$(public_ip):${port:-80}"; fi ;;
    http://* | https://*) echo "$site" ;;
    *) echo "https://$site" ;;
  esac
}

if [ "${1:-}" = rollback ]; then
  docker image inspect reph-rooms:previous >/dev/null 2>&1 || { echo "No earlier image to go back to." >&2; exit 1; }
  say "Rolling back to the previous image"
  docker tag reph-rooms:previous reph-rooms:latest
  compose up -d --no-build
  say "Back on the previous version: $(site_url)"
  exit 0
fi

install_docker
ensure_swap
ensure_settings

say "Building the image (the first build takes a few minutes)"
docker image inspect reph-rooms:latest >/dev/null 2>&1 && docker tag reph-rooms:latest reph-rooms:previous
compose build app

say "Starting (Caddy waits until the app is healthy)"
if ! compose up -d --remove-orphans; then
  compose logs --tail 80 app >&2
  echo "The app did not start. The logs are above; 'deploy.sh rollback' goes back to the previous image." >&2
  exit 1
fi
docker image prune -f >/dev/null

url=$(site_url)
check=$(site_url local)
say "Checking $check/api/health"
for _ in $(seq 1 30); do
  if curl -fsS -m 5 "$check/api/health" >/dev/null 2>&1; then
    # /api/session reads the state from Redis: a 503 means the app can't reach it.
    if ! curl -fsS -m 10 "$check/api/session" >/dev/null 2>&1; then
      echo "The app is up but can't reach Redis. Logs: sudo docker compose -p reph-rooms logs redis redis-http app" >&2
      exit 1
    fi
    say "Up: $url (sign in with a demo account)"
    echo "Logs: sudo docker compose -p reph-rooms logs -f app · settings: $SETTINGS"
    echo "Start the demo week over: sudo docker stop reph-rooms-app-1 && sudo docker exec reph-rooms-redis-1 redis-cli FLUSHALL && sudo docker start reph-rooms-app-1"
    exit 0
  fi
  sleep 3
done
echo "The app is running, but $check does not answer yet. Check that the security group allows ports 80 and 443 and, for" >&2
echo "a DNS name, that it points at this server. HTTPS certificates: sudo docker compose -p reph-rooms logs caddy" >&2
exit 1
```

<!-- verbatim: deploy/ec2/package.sh -->
```bash
#!/usr/bin/env bash
# Packs the last commit into dist/reph-rooms-<commit>.tar.gz for one EC2 server (docs/spec/11-deploy-aws.md §8).
# No secrets and no node_modules: the server builds the image itself (deploy.sh). Run: npm run package:ec2
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit your changes first: the bundle is made from the last commit." >&2
  exit 1
fi
name=reph-rooms-$(git rev-parse --short HEAD)
mkdir -p dist
git archive --format=tar.gz --prefix="$name/" -o "dist/$name.tar.gz" HEAD
echo "dist/$name.tar.gz ($(du -h "dist/$name.tar.gz" | cut -f1))"
cat <<EOF

Upload and deploy (KEY = your .pem key, HOST = ubuntu@<server address>):
  scp -i KEY dist/$name.tar.gz HOST:
  ssh -t -i KEY HOST 'tar xzf $name.tar.gz && sudo ./$name/deploy/ec2/deploy.sh'
EOF
```

## 9. Done when

- ECS: `aws ecs describe-services` shows 1 running task and the target group reports it healthy.
- EC2 VPS (§8): `deploy.sh` ends with `Up: https://…`, and `sudo docker compose -p reph-rooms ps` shows `app` healthy and `caddy` up.
- §5 passes against the deployed URL (including the MCP metadata and 401 checks).
- An MCP app (Claude, ChatGPT or Claude Code) connects to `https://<site>/api/mcp`, lists the 9 tools, and a booking made through it opens as a card from its confirm link (8.2a).
- The browser demo script (PLAN) works through the ALB or Caddy, including a streamed assistant reply (it would be cut if the idle timeout were below 90 s).
