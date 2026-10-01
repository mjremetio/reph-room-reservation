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
