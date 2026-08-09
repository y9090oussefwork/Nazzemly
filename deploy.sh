#!/bin/bash
# Automatic Deployment Script for Next.js SaaS Platform on VPS

echo "🚀 Starting Deployment Process..."

# 1. Pull latest changes from GitHub
echo "📥 Pulling latest code from GitHub..."
git pull origin master

# 2. Install dependencies
echo "📦 Installing npm dependencies..."
npm install

# 3. Apply Prisma database schema updates
echo "🗄️ Pushing database schema..."
npx prisma db push

# 4. Seed database with initial accounts (superadmin / demo)
echo "🌱 Seeding database..."
npx tsx prisma/seed.ts

# 5. Build production bundle of Next.js
echo "🏗️ Building production Next.js application..."
npm run build

# 6. Restart/Start the application in background using PM2
echo "🔄 Starting application with PM2..."
pm2 restart saas-subscription-manager || pm2 start npm --name "saas-subscription-manager" -- run start

echo "🎉 Deployment completed successfully and application is live!"
