# ChatVerse

**File: docs/README.md**

A modern, real-time chat application built with React, Node.js, Socket.io, and MongoDB. ChatVerse provides secure messaging, file sharing, and real-time communication features in a scalable architecture.

## 🚀 Features

### Core Messaging
- **Real-time messaging** with Socket.io
- **Direct messages** and **group conversations**
- **Message reactions** and **replies**
- **Typing indicators** and **read receipts**
- **Message editing** and **deletion**

### Media & Files
- **File uploads** with S3-compatible storage
- **Image, video, and document sharing**
- **Drag-and-drop** file uploads
- **File preview** and **thumbnails**

### User Experience
- **Progressive Web App (PWA)** support
- **Push notifications**
- **Online/offline status**
- **Dark/light theme**
- **Responsive design**

### Security & Privacy
- **JWT authentication** with refresh tokens
- **End-to-end encryption** option
- **Rate limiting** and **DDoS protection**
- **Input validation** and **sanitization**
- **CORS and security headers**

### Performance & Scale
- **Redis caching** for sessions and real-time data
- **MongoDB** with optimized indexing
- **Horizontal scaling** with Socket.io Redis adapter
- **CDN-ready** static assets
- **Docker containerization**

## 🏗️ Architecture

### Technology Stack
- **Frontend**: React 18, TypeScript, Vite, PWA
- **Backend**: Node.js, Express, Socket.io, TypeScript
- **Database**: MongoDB with Redis cache
- **Storage**: S3-compatible (MinIO/AWS S3)
- **Authentication**: JWT with refresh tokens
- **Real-time**: Socket.io with Redis adapter

### Project Structure
```
chatverse/
├── apps/
│   ├── web/          # React frontend
│   └── api/          # Node.js backend
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── eslint-config/# Shared linting rules
│   └── ui/           # Shared UI components
├── infra/
│   ├── docker/       # Docker configurations
│   ├── k8s/          # Kubernetes manifests
│   └── terraform/    # Infrastructure as code
└── scripts/          # Development scripts
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ and **pnpm**
- **Docker** and **Docker Compose**
- **Git**

### Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd chatverse
   ```

2. **Start development environment**
   ```bash
   chmod +x scripts/dev.sh
   ./scripts/dev.sh
   ```

3. **Access the application**
   - **Web App**: http://localhost:3000
   - **API**: http://localhost:3001
   - **MinIO Console**: http://localhost:9001

### Demo Accounts
```
alice@example.com / password123
bob@example.com / password123
charlie@example.com / password123
```

## 📚 Documentation

- [**Architecture Guide**](./ARCHITECTURE.md) - System design and data flow
- [**API Reference**](./API_REFERENCE.md) - REST and WebSocket APIs
- [**Security Guide**](./SECURITY.md) - Security measures and best practices
- [**Deployment Guide**](./DEPLOYMENT.md) - Production deployment
- [**Runbooks**](./RUNBOOKS/) - Operational procedures

## 🛠️ Development

### Environment Setup
```bash
# Install dependencies
pnpm install

# Build shared packages
pnpm build:packages

# Start development servers
pnpm dev
```

### Available Scripts
```bash
# Development
pnpm dev              # Start all services
pnpm dev:web          # Frontend only
pnpm dev:api          # Backend only

# Build
pnpm build            # Build all apps
pnpm build:packages   # Build shared packages

# Testing
pnpm test             # Run all tests
pnpm test:unit        # Unit tests only
pnpm test:e2e         # End-to-end tests

# Linting
pnpm lint             # Lint all code
pnpm lint:fix         # Fix linting issues

# Database
pnpm db:migrate       # Run migrations
pnpm db:seed          # Seed demo data
```

### Code Quality
- **TypeScript** for type safety
- **ESLint + Prettier** for code formatting
- **Husky** for git hooks
- **Jest** for unit testing
- **Playwright** for E2E testing

## 🚀 Deployment

### Docker Production
```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy with scaling
docker-compose -f docker-compose.prod.yml up -d --scale api=3
```

### Kubernetes
```bash
# Deploy to Kubernetes
kubectl apply -k infra/k8s/

# Scale API pods
kubectl scale deployment api --replicas=5
```

### Environment Variables
See `.env.example` files for required configuration:
- **Database URLs** (MongoDB, Redis)
- **JWT secrets**
- **S3 credentials**
- **VAPID keys** for push notifications

## 🔐 Security

### Authentication Flow
1. User registers/logs in with email/password
2. Server returns JWT access token (15min) + refresh token (7d)
3. Client includes access token in API requests
4. Refresh tokens automatically when access token expires

### Data Protection
- Passwords hashed with **bcrypt** (12 rounds)
- JWTs signed with **RS256** algorithm
- **Rate limiting** on all endpoints
- **Input validation** with Joi/Zod
- **XSS protection** with sanitization

## 📊 Monitoring

### Health Checks
- **Liveness**: `/health/live`
- **Readiness**: `/health/ready`
- **Metrics**: `/metrics` (Prometheus)

### Logging
- **Structured logging** with Pino
- **Request tracing** with correlation IDs
- **Error tracking** with stack traces
- **Performance metrics**

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Add** tests for new features
5. **Run** linting and tests
6. **Submit** a pull request

### Code Standards
- Use **TypeScript** for type safety
- Follow **ESLint** rules
- Write **unit tests** for business logic
- Update **documentation** for API changes

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](../LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the `docs/` directory
- **Issues**: Create GitHub issues for bugs
- **Discussions**: Use GitHub Discussions for questions
- **Security**: Email security@chatverse.com for vulnerabilities

## 🗺️ Roadmap

- [ ] **Voice messages** and **video calls**
- [ ] **Message threads** and **forums**
- [ ] **Bot integrations** and **webhooks**
- [ ] **Advanced search** with filters
- [ ] **Message scheduling** and **reminders**
- [ ] **Multi-language support**
- [ ] **Mobile apps** (React Native)

---

**Built with ❤️ by the ChatVerse team**
