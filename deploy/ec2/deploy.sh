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
