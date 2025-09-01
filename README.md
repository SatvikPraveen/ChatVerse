# ChatVerse 💬

<div align="center">

![ChatVerse Logo](https://img.shields.io/badge/ChatVerse-Real--time%20Messaging-blue?style=for-the-badge&logo=chat&logoColor=white)

**A modern, scalable real-time messaging platform built for the next generation of communication**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18+-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

[Live Demo](https://ChatVerse-demo.com) • [Documentation](./docs/) • [API Reference](./docs/API_REFERENCE.md) • [Report Bug](https://github.com/SatvikPraveen/ChatVerse/issues)

</div>

---

## 🌟 Overview

ChatVerse is a production-ready, real-time messaging platform designed for modern communication needs. Built with scalability, performance, and user experience in mind, it provides a WhatsApp-like experience with enterprise-grade features.

### ✨ Key Highlights

- **🚀 Real-time Everything**: Instant messaging, typing indicators, presence status
- **🔒 Enterprise Security**: JWT authentication, rate limiting, input validation
- **📱 Cross-Platform**: PWA support for mobile and desktop installations
- **☁️ Cloud-Ready**: Docker containerization with Kubernetes deployment configs
- **🎨 Modern UI/UX**: Responsive design with dark/light theme support
- **📈 Scalable Architecture**: Microservices-ready with monitoring and observability

---

## 🚀 Features

<table>
<tr>
<td>

### 🔐 **Authentication & Security**
- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting protection
- CORS security headers
- Input validation & sanitization

</td>
<td>

### 💬 **Messaging Experience**
- Real-time message delivery
- File sharing (images, videos, docs)
- Message reactions with emojis
- Typing indicators
- Message history & search

</td>
</tr>
<tr>
<td>

### 👥 **Social Features**
- Group conversations
- User presence (online/offline)
- Profile management
- Push notifications
- Contact management

</td>
<td>

### 🛠 **Developer Experience**
- TypeScript throughout
- Comprehensive testing suite
- Hot reload development
- Docker development environment
- Automated CI/CD pipeline

</td>
</tr>
</table>

---

## 🏗 Architecture & Tech Stack

### **Frontend Stack**
```mermaid
graph TD
    A[React 18 + TypeScript] --> B[Vite Build Tool]
    B --> C[Tailwind CSS]
    C --> D[Zustand State Management]
    D --> E[React Query Data Fetching]
    E --> F[Socket.io Client]
    F --> G[PWA Service Worker]
```

### **Backend Stack**
```mermaid
graph TD
    A[Node.js + Express] --> B[TypeScript]
    B --> C[Socket.io Server]
    C --> D[MongoDB + Mongoose]
    D --> E[Redis Caching]
    E --> F[AWS S3 Storage]
    F --> G[JWT Authentication]
```

### **Infrastructure & DevOps**
- **Containerization**: Docker & Docker Compose
- **Orchestration**: Kubernetes manifests
- **Monitoring**: OpenTelemetry, Prometheus metrics
- **CI/CD**: GitHub Actions workflows
- **Cloud**: AWS (S3, CloudFront, ECS ready)

---

## 📁 Project Structure

```
ChatVerse/
├── 📱 apps/
│   ├── 🌐 web/                 # React frontend application
│   │   ├── src/
│   │   │   ├── components/     # Reusable UI components
│   │   │   ├── hooks/         # Custom React hooks
│   │   │   ├── services/      # API clients & utilities
│   │   │   ├── store/         # Zustand state management
│   │   │   └── utils/         # Helper functions
│   │   └── public/            # Static assets
│   └── 🔧 api/                 # Node.js backend API
│       ├── src/
│       │   ├── controllers/   # Route handlers
│       │   ├── middlewares/   # Express middlewares
│       │   ├── models/        # MongoDB schemas
│       │   ├── services/      # Business logic
│       │   ├── realtime/      # Socket.io handlers
│       │   └── tests/         # Test suites
│       └── dist/              # Compiled JavaScript
├── 📦 packages/
│   ├── types/                 # Shared TypeScript definitions
│   ├── ui/                    # Reusable UI components
│   └── eslint-config/         # Shared linting rules
├── 🐳 infra/
│   ├── docker/                # Docker configurations
│   ├── k8s/                   # Kubernetes manifests
│   └── terraform/             # Infrastructure as Code
├── 📚 docs/                   # Comprehensive documentation
└── 🔨 scripts/                # Build & deployment scripts
```

---

## 🚀 Quick Start

### Prerequisites

Ensure you have the following installed:
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **PNPM** 8+ ([Install Guide](https://pnpm.io/installation))
- **Docker & Docker Compose** ([Install Guide](https://docs.docker.com/get-docker/))
- **Git** ([Download](https://git-scm.com/downloads))

### 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/SatvikPraveen/ChatVerse.git
   cd ChatVerse
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**
   ```bash
   # Backend configuration
   cp apps/api/.env.example apps/api/.env

   # Frontend configuration
   cp apps/web/.env.example apps/web/.env
   ```

4. **Start development services**
   ```bash
   # Start MongoDB & Redis containers
   pnpm docker:dev

   # Start development servers (separate terminal)
   pnpm dev
   ```

5. **Access the application**
   - 🌐 **Frontend**: http://localhost:3000
   - 🔧 **API**: http://localhost:3001
   - 📊 **API Docs**: http://localhost:3001/docs
   - 🗄️ **MongoDB**: localhost:27017
   - 🔴 **Redis**: localhost:6379

---

## ⚙️ Configuration

### Backend Environment Variables

Create `apps/api/.env` from the example file:

```env
# Application
NODE_ENV=development
PORT=3001

# Database
MONGODB_URI=mongodb://admin:password@localhost:27017/ChatVerse?authSource=admin
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long
JWT_EXPIRES_IN=7d

# Security
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com

# File Storage (AWS S3)
AWS_REGION=us-east-1
AWS_S3_BUCKET=ChatVerse-uploads
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Push Notifications (Optional)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_EMAIL=your-email@domain.com

# Monitoring (Optional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

### Frontend Environment Variables

Create `apps/web/.env`:

```env
# API Configuration
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001

# Features
VITE_ENABLE_PWA=true
VITE_ENABLE_NOTIFICATIONS=true

# Analytics (Optional)
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

---

## 🛠 Development

### Available Scripts

```bash
# 🚀 Development
pnpm dev              # Start both frontend and backend in watch mode
pnpm dev:web          # Start only React development server
pnpm dev:api          # Start only Node.js API server

# 🏗 Building
pnpm build            # Build all packages for production
pnpm build:web        # Build React app only
pnpm build:api        # Build Node.js API only

# 🧪 Testing & Quality
pnpm test             # Run all test suites
pnpm test:unit        # Run unit tests only
pnpm test:integration # Run integration tests
pnpm test:e2e         # Run end-to-end tests
pnpm test:watch       # Run tests in watch mode

pnpm lint             # Lint all packages
pnpm lint:fix         # Fix linting issues
pnpm type-check       # TypeScript type checking

# 🐳 Docker Operations
pnpm docker:dev       # Start development database services
pnpm docker:down      # Stop all development services
pnpm docker:logs      # View service logs
pnpm docker:clean     # Clean up containers and volumes

# 📊 Database Operations
pnpm db:migrate       # Run database migrations
pnpm db:seed          # Seed database with sample data
pnpm db:reset         # Reset database to clean state
```

### 🧪 Testing Strategy

```bash
# Unit Tests - Business logic & utilities
pnpm test:unit

# Integration Tests - API endpoints & database operations
pnpm test:integration

# End-to-End Tests - Complete user workflows
pnpm test:e2e

# Coverage Report
pnpm test:coverage
```

### 🔄 Development Workflow

1. **Feature Development**
   ```bash
   git checkout -b feature/awesome-feature
   pnpm dev  # Start development environment
   # Make your changes...
   pnpm test  # Ensure tests pass
   pnpm lint  # Check code quality
   ```

2. **Code Quality Checks**
   ```bash
   pnpm type-check    # TypeScript validation
   pnpm lint:fix      # Auto-fix linting issues
   pnpm test:coverage # Ensure adequate test coverage
   ```

3. **Commit & Push**
   ```bash
   git add .
   git commit -m "feat: add awesome feature"
   git push origin feature/awesome-feature
   ```

---

## 📡 API Reference

### Authentication Endpoints

```http
POST   /api/auth/register     # User registration
POST   /api/auth/login        # User authentication
POST   /api/auth/refresh      # Refresh JWT token
POST   /api/auth/logout       # User logout
```

### Messaging Endpoints

```http
GET    /api/conversations          # List user conversations
POST   /api/conversations          # Create new conversation
GET    /api/conversations/:id      # Get conversation details
POST   /api/conversations/:id/join # Join group conversation

GET    /api/messages/:conversationId    # Get conversation messages
POST   /api/messages                    # Send new message
PUT    /api/messages/:id               # Edit message
DELETE /api/messages/:id               # Delete message
```

### File Upload Endpoints

```http
POST   /api/uploads/presign      # Get S3 pre-signed URL
POST   /api/uploads/complete     # Complete file upload
```

### Real-time Socket Events

```javascript
// Client to Server
socket.emit('conversation:join', { conversationId })
socket.emit('message:send', { conversationId, content, type })
socket.emit('typing:start', { conversationId })
socket.emit('typing:stop', { conversationId })

// Server to Client
socket.on('message:received', (message) => {})
socket.on('typing:update', ({ userId, isTyping }) => {})
socket.on('presence:update', ({ userId, status }) => {})
```

For detailed API documentation, see [API_REFERENCE.md](./docs/API_REFERENCE.md).

---

## 🚀 Deployment

### 🐳 Docker Production Deployment

1. **Build production images**
   ```bash
   # Build all services
   docker-compose -f infra/docker/docker-compose.prod.yml build
   ```

2. **Deploy with Docker Compose**
   ```bash
   # Start production stack
   docker-compose -f infra/docker/docker-compose.prod.yml up -d

   # View logs
   docker-compose -f infra/docker/docker-compose.prod.yml logs -f
   ```

### ☸️ Kubernetes Deployment

1. **Apply Kubernetes manifests**
   ```bash
   # Create namespace and secrets
   kubectl apply -f infra/k8s/namespace.yaml
   kubectl apply -f infra/k8s/secrets.yaml

   # Deploy applications
   kubectl apply -f infra/k8s/
   ```

2. **Monitor deployment**
   ```bash
   kubectl get pods -n ChatVerse
   kubectl logs -f deployment/ChatVerse-api -n ChatVerse
   ```

### ☁️ AWS Deployment with Terraform

```bash
cd infra/terraform/aws
terraform init
terraform plan
terraform apply
```

### 🔧 Production Environment Variables

Ensure these are properly configured for production:

```env
NODE_ENV=production
JWT_SECRET=<strong-production-secret>
MONGODB_URI=<production-mongodb-uri>
REDIS_URL=<production-redis-uri>
AWS_S3_BUCKET=<production-s3-bucket>
CORS_ORIGINS=https://yourdomain.com
```

---

## 📊 Monitoring & Observability

### 📈 Metrics & Monitoring

- **Application Metrics**: Custom Prometheus metrics
- **Health Checks**: Liveness and readiness probes
- **Error Tracking**: Comprehensive error logging
- **Performance**: Response time and throughput monitoring

### 📋 Health Endpoints

```http
GET /health/liveness     # Application liveness check
GET /health/readiness    # Application readiness check
GET /metrics            # Prometheus metrics endpoint
```

### 🔍 Logging

Structured JSON logging with different levels:
- **Error**: Application errors and exceptions
- **Warn**: Performance issues and warnings
- **Info**: General application flow
- **Debug**: Detailed debugging information

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### 🌟 Ways to Contribute

- 🐛 **Bug Reports**: [Open an issue](https://github.com/SatvikPraveen/ChatVerse/issues/new?template=bug_report.md)
- ✨ **Feature Requests**: [Request a feature](https://github.com/SatvikPraveen/ChatVerse/issues/new?template=feature_request.md)
- 📖 **Documentation**: Improve docs and guides
- 💻 **Code**: Submit pull requests

### 📋 Development Guidelines

1. **Fork the repository** and create a feature branch
2. **Follow coding standards**: ESLint + Prettier configuration
3. **Write tests**: Maintain >80% code coverage
4. **Update documentation**: Keep README and docs current
5. **Submit a pull request**: Clear description of changes

### 🔄 Pull Request Process

```bash
# 1. Fork and clone
git clone https://github.com/yourusername/ChatVerse.git

# 2. Create feature branch
git checkout -b feature/your-feature-name

# 3. Make changes and test
pnpm test
pnpm lint

# 4. Commit with conventional commits
git commit -m "feat: add your feature description"

# 5. Push and create PR
git push origin feature/your-feature-name
```

### 📝 Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Prettier with 2-space indentation
- **Linting**: ESLint with custom rules
- **Commits**: [Conventional Commits](https://conventionalcommits.org/)

---

## 📚 Documentation

Comprehensive documentation is available in the `/docs` directory:

| Document | Description |
|----------|-------------|
| [📖 API Reference](./docs/API_REFERENCE.md) | Complete API endpoint documentation |
| [🏗 Architecture Guide](./docs/ARCHITECTURE.md) | System design and architecture decisions |
| [🚀 Deployment Guide](./docs/DEPLOYMENT.md) | Production deployment instructions |
| [🔒 Security Guide](./docs/SECURITY.md) | Security best practices and policies |
| [📋 Runbooks](./docs/RUNBOOKS/) | Operational guides and troubleshooting |

---

## 🗺 Roadmap

### 📅 Current Sprint (v1.1)
- [ ] Voice messages support
- [ ] Message search functionality
- [ ] Dark/light theme toggle
- [ ] Improved mobile experience

### 🔮 Upcoming Features (v1.2)
- [ ] Video calling integration
- [ ] Message threading
- [ ] Custom emoji reactions
- [ ] Message scheduling

### 🚀 Future Vision (v2.0)
- [ ] AI-powered features
- [ ] Advanced admin dashboard
- [ ] Message encryption
- [ ] Plugin architecture

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 Satvik Praveen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

---

## 🙏 Acknowledgments

Special thanks to the amazing open-source community and these fantastic projects:

- **[Socket.io](https://socket.io/)** - Real-time bidirectional event-based communication
- **[React](https://reactjs.org/)** - A JavaScript library for building user interfaces
- **[Node.js](https://nodejs.org/)** - JavaScript runtime built on Chrome's V8 engine
- **[MongoDB](https://www.mongodb.com/)** - The most popular NoSQL database
- **[Tailwind CSS](https://tailwindcss.com/)** - A utility-first CSS framework
- **[TypeScript](https://www.typescriptlang.org/)** - JavaScript with syntax for types

---

## 💬 Support & Community

- **🐛 Issues**: [GitHub Issues](https://github.com/SatvikPraveen/ChatVerse/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/SatvikPraveen/ChatVerse/discussions)

---

<div align="center">

**⭐ Star this repo if you find it helpful!**

Built with ❤️ by [Satvik Praveen](https://github.com/SatvikPraveen) and the ChatVerse community

*Empowering real-time communication for the modern world*

</div>
