#!/bin/bash
# File: scripts/dev.sh

set -e

echo "🚀 Starting ChatVerse Development Environment"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Please install pnpm first."
    echo "Run: npm install -g pnpm"
    exit 1
fi

# Create .env files if they don't exist
echo "📝 Setting up environment files..."

if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created root .env file"
fi

if [ ! -f apps/api/.env ]; then
    cp apps/api/.env.example apps/api/.env
    echo "✅ Created API .env file"
fi

if [ ! -f apps/web/.env ]; then
    cp apps/web/.env.example apps/web/.env
    echo "✅ Created Web .env file"
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build shared packages
echo "🔨 Building shared packages..."
pnpm build:packages

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose -f infra/docker/docker-compose.dev.yml up -d mongo redis minio minio-setup

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if MongoDB is ready
echo "🔍 Checking MongoDB connection..."
until docker-compose -f infra/docker/docker-compose.dev.yml exec mongo mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
    echo "Waiting for MongoDB..."
    sleep 2
done
echo "✅ MongoDB is ready"

# Check if Redis is ready
echo "🔍 Checking Redis connection..."
until docker-compose -f infra/docker/docker-compose.dev.yml exec redis redis-cli -a chatverse123 ping > /dev/null 2>&1; do
    echo "Waiting for Redis..."
    sleep 2
done
echo "✅ Redis is ready"

# Check if MinIO is ready
echo "🔍 Checking MinIO connection..."
until curl -f http://localhost:9000/minio/health/live > /dev/null 2>&1; do
    echo "Waiting for MinIO..."
    sleep 2
done
echo "✅ MinIO is ready"

# Run database migrations and seed data
echo "📊 Running database setup..."
node scripts/migrate.mjs
node scripts/seed.mjs

# Start the development servers
echo "🚀 Starting development servers..."
echo ""
echo "🌐 Services will be available at:"
echo "  - Web App: http://localhost:3000"
echo "  - API: http://localhost:3001"
echo "  - MinIO Console: http://localhost:9001 (chatverse/chatverse123)"
echo "  - MongoDB: mongodb://localhost:27017"
echo "  - Redis: redis://localhost:6379"
echo ""
echo "📝 Logs will be shown below..."
echo ""

# Start API and Web in development mode
docker-compose -f infra/docker/docker-compose.dev.yml up api web

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down development environment..."
    docker-compose -f infra/docker/docker-compose.dev.yml down
    echo "✅ Development environment stopped"
}

# Set trap to cleanup on exit
trap cleanup EXIT
