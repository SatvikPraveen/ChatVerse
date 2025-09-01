#!/bin/bash

# ChatVerse Project Structure Generator
# This script creates the complete folder structure for the ChatVerse real-time chat application

set -e

echo "🚀 Generating ChatVerse project structure..."

# Create project root
mkdir -p chatverse
cd chatverse

# Root level files
touch package.json
touch pnpm-workspace.yaml
touch tsconfig.base.json
touch .editorconfig
touch .gitignore
touch .env.example

# .vscode directory
mkdir -p .vscode
touch .vscode/extensions.json
touch .vscode/settings.json

# .github workflows
mkdir -p .github/workflows
touch .github/workflows/ci.yml
touch .github/workflows/release.yml
touch .github/workflows/security-scan.yml

# Apps directory structure
echo "📱 Creating apps structure..."

# Web app (React + Vite + TS + PWA)
mkdir -p apps/web/public
mkdir -p apps/web/src/app/routes
mkdir -p apps/web/src/app/layouts
mkdir -p apps/web/src/app/providers
mkdir -p apps/web/src/components/chat
mkdir -p apps/web/src/components/common
mkdir -p apps/web/src/components/upload
mkdir -p apps/web/src/hooks
mkdir -p apps/web/src/store
mkdir -p apps/web/src/services
mkdir -p apps/web/src/utils
mkdir -p apps/web/src/assets
mkdir -p apps/web/src/styles

# Web app files
touch apps/web/package.json
touch apps/web/index.html
touch apps/web/tsconfig.json
touch apps/web/vite.config.ts
touch apps/web/.env.example

# Public files
touch apps/web/public/favicon.ico
touch apps/web/public/robots.txt
touch apps/web/public/manifest.json

# Source files
touch apps/web/src/main.tsx
touch apps/web/src/vite-env.d.ts
touch apps/web/src/sw.ts

# Component files
touch apps/web/src/components/chat/MessageList.tsx
touch apps/web/src/components/chat/Composer.tsx
touch apps/web/src/components/chat/TypingIndicator.tsx

# Service files
touch apps/web/src/services/apiClient.ts
touch apps/web/src/services/socket.ts
touch apps/web/src/services/push.ts
touch apps/web/src/services/s3.ts

# API app (Node + Express + Socket.io + TS)
echo "🔧 Creating API structure..."

mkdir -p apps/api/src/config
mkdir -p apps/api/src/db
mkdir -p apps/api/src/models
mkdir -p apps/api/src/routes
mkdir -p apps/api/src/controllers
mkdir -p apps/api/src/services
mkdir -p apps/api/src/realtime
mkdir -p apps/api/src/middlewares
mkdir -p apps/api/src/utils
mkdir -p apps/api/src/telemetry
mkdir -p apps/api/src/health
mkdir -p apps/api/src/tests/integration
mkdir -p apps/api/src/tests/unit
mkdir -p apps/api/src/tests/e2e

# API app files
touch apps/api/package.json
touch apps/api/tsconfig.json
touch apps/api/.env.example

# Source files
touch apps/api/src/index.ts
touch apps/api/src/server.ts

# Config files
touch apps/api/src/config/env.ts
touch apps/api/src/config/constants.ts

# Database files
touch apps/api/src/db/mongo.ts
touch apps/api/src/db/redis.ts

# Model files
touch apps/api/src/models/User.ts
touch apps/api/src/models/Conversation.ts
touch apps/api/src/models/Message.ts

# Route files
touch apps/api/src/routes/auth.routes.ts
touch apps/api/src/routes/users.routes.ts
touch apps/api/src/routes/conversations.routes.ts
touch apps/api/src/routes/messages.routes.ts
touch apps/api/src/routes/uploads.routes.ts
touch apps/api/src/routes/push.routes.ts

# Controller files
touch apps/api/src/controllers/auth.controller.ts
touch apps/api/src/controllers/users.controller.ts
touch apps/api/src/controllers/conversations.controller.ts
touch apps/api/src/controllers/messages.controller.ts
touch apps/api/src/controllers/uploads.controller.ts

# Service files
touch apps/api/src/services/auth.service.ts
touch apps/api/src/services/user.service.ts
touch apps/api/src/services/conversation.service.ts
touch apps/api/src/services/message.service.ts
touch apps/api/src/services/upload.service.ts
touch apps/api/src/services/push.service.ts

# Realtime files
touch apps/api/src/realtime/io.ts
touch apps/api/src/realtime/events.chat.ts
touch apps/api/src/realtime/events.presence.ts
touch apps/api/src/realtime/rateLimiter.socket.ts

# Middleware files
touch apps/api/src/middlewares/auth.ts
touch apps/api/src/middlewares/error.ts
touch apps/api/src/middlewares/rateLimit.ts
touch apps/api/src/middlewares/security.ts

# Utility files
touch apps/api/src/utils/logger.ts
touch apps/api/src/utils/crypto.ts
touch apps/api/src/utils/pagination.ts

# Telemetry files
touch apps/api/src/telemetry/tracing.ts
touch apps/api/src/telemetry/metrics.ts

# Health files
touch apps/api/src/health/liveness.ts
touch apps/api/src/health/readiness.ts

# Packages directory structure
echo "📦 Creating packages structure..."

# Shared types package
mkdir -p packages/types/src
touch packages/types/package.json
touch packages/types/tsconfig.json
touch packages/types/src/api.ts
touch packages/types/src/socket.ts
touch packages/types/src/models.ts

# ESLint config package
mkdir -p packages/eslint-config
touch packages/eslint-config/package.json
touch packages/eslint-config/index.js

# UI components package (optional)
mkdir -p packages/ui/src
touch packages/ui/package.json

# Infrastructure directory
echo "🏗️ Creating infrastructure structure..."

# Docker files
mkdir -p infra/docker
touch infra/docker/docker-compose.dev.yml
touch infra/docker/api.Dockerfile
touch infra/docker/web.Dockerfile

# Kubernetes (optional)
mkdir -p infra/k8s

# Terraform (optional)
mkdir -p infra/terraform

# Scripts directory
echo "📜 Creating scripts..."
mkdir -p scripts
touch scripts/dev.sh
touch scripts/seed.mjs
touch scripts/migrate.mjs

# Documentation directory
echo "📚 Creating documentation structure..."
mkdir -p docs/RUNBOOKS
touch docs/README.md
touch docs/ARCHITECTURE.md
touch docs/API_REFERENCE.md
touch docs/SECURITY.md
touch docs/DEPLOYMENT.md
touch docs/RUNBOOKS/incidents.md
touch docs/RUNBOOKS/scaling.md

echo "✅ ChatVerse project structure generated successfully!"
echo ""
echo "Project structure created with:"
echo "- 🌐 Web app (React + Vite + TypeScript + PWA)"
echo "- 🔧 API server (Node.js + Express + Socket.io + TypeScript)"
echo "- 📦 Shared packages (types, eslint-config, ui)"
echo "- 🏗️ Infrastructure (Docker, K8s, Terraform)"
echo "- 📜 Development scripts"
echo "- 📚 Comprehensive documentation"
echo ""
echo "Next steps:"
echo "1. cd chatverse"
echo "2. Initialize package.json files"
echo "3. Set up development environment"
echo "4. Start building your features!"
echo ""
echo "Happy coding! 🚀"