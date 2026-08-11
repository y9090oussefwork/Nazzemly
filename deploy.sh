#!/usr/bin/env bash
set -euo pipefail

echo "Starting safe production deployment..."
git pull --ff-only
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart nazzemly --update-env || \
    pm2 start npm --name nazzemly -- run start -- -p 3010
else
  echo "PM2 is not installed. Build completed; start the app with: npm run start"
fi

echo "Deployment completed. No demo data or passwords were created."
