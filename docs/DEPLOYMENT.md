# Deployment Guide

**File: docs/DEPLOYMENT.md**

## 🚀 Production Deployment

This guide covers deploying ChatVerse to production environments using Docker, Kubernetes, and cloud services.

## 🏗️ Infrastructure Requirements

### Minimum Production Requirements
- **CPU**: 2 vCPUs (API), 1 vCPU (Web)
- **Memory**: 2GB (API), 512MB (Web)
- **Storage**: 20GB SSD (API), 10GB (Web)
- **Database**: MongoDB 7.0+ (3-node replica set)
- **Cache**: Redis 7.2+ (3-node cluster)
- **Load Balancer**: nginx, AWS ALB, or similar

### Recommended Production Setup
- **API Servers**: 3+ instances for high availability
- **Web Servers**: 2+ instances behind CDN
- **Database**: MongoDB Atlas or self-hosted replica set
- **Cache**: Redis Cloud or ElastiCache
- **Object Storage**: AWS S3, Google Cloud Storage, or MinIO
- **CDN**: CloudFlare, AWS CloudFront, or similar

## 🐳 Docker Production Deployment

### Production Docker Compose
```yaml
# File: docker-compose.prod.yml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
    depends_on:
      - api
      - web
    restart: unless-stopped

  api:
    build:
      context: .
      dockerfile: infra/docker/api.Dockerfile
      target: production
    deploy:
      replicas: 3
    environment:
      NODE_ENV: production
      PORT: 3001
      MONGODB_URI: ${MONGODB_URI}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_BUCKET: ${S3_BUCKET}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    build:
      context: .
      dockerfile: infra/docker/web.Dockerfile
      target: production
    deploy:
      replicas: 2
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/"]
      interval: 30s
      timeout: 10s
      retries: 3

networks:
  default:
    name: chatverse-prod
```

### nginx Configuration
```nginx
# File: infra/docker/nginx.conf
upstream api_backend {
    least_conn;
    server api:3001 max_fails=3 fail_timeout=30s;
}

upstream web_backend {
    least_conn;
    server web:8080 max_fails=3 fail_timeout=30s;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=5r/m;

server {
    listen 80;
    listen [::]:80;
    server_name chatverse.com www.chatverse.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name chatverse.com www.chatverse.com;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";

    # API Routes
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://api_backend/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Auth endpoints with stricter rate limiting
    location /api/auth/ {
        limit_req zone=auth_limit burst=10 nodelay;

        proxy_pass http://api_backend/auth/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket Support
    location /socket.io/ {
        proxy_pass http://api_backend/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static Files with Caching
    location /static/ {
        proxy_pass http://web_backend/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
    }

    # Web App (SPA)
    location / {
        proxy_pass http://web_backend/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SPA fallback
        try_files $uri $uri/ /index.html;
    }
}
```

### Deployment Commands
```bash
# Production deployment
docker-compose -f docker-compose.prod.yml up -d

# Scale services
docker-compose -f docker-compose.prod.yml up -d --scale api=5 --scale web=3

# Update services
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d --force-recreate

# View logs
docker-compose -f docker-compose.prod.yml logs -f api
```

## ☸️ Kubernetes Deployment

### Namespace and ConfigMap
```yaml
# File: infra/k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: chatverse
  labels:
    name: chatverse

---
apiVersion: v1
kind: ConfigMap
metadata:
  name: chatverse-config
  namespace: chatverse
data:
  NODE_ENV: "production"
  CORS_ORIGIN: "https://chatverse.com"
  RATE_LIMIT_WINDOW_MS: "900000"
  RATE_LIMIT_MAX: "1000"
  LOG_LEVEL: "info"
```

### Secrets Management
```yaml
# File: infra/k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: chatverse-secrets
  namespace: chatverse
type: Opaque
data:
  # Base64 encoded values
  mongodb-uri: <base64-encoded-mongodb-uri>
  redis-url: <base64-encoded-redis-url>
  jwt-secret: <base64-encoded-jwt-secret>
  jwt-refresh-secret: <base64-encoded-jwt-refresh-secret>
  s3-access-key: <base64-encoded-s3-access-key>
  s3-secret-key: <base64-encoded-s3-secret-key>
  vapid-public-key: <base64-encoded-vapid-public-key>
  vapid-private-key: <base64-encoded-vapid-private-key>
```

### API Deployment
```yaml
# File: infra/k8s/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chatverse-api
  namespace: chatverse
  labels:
    app: chatverse-api
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: chatverse-api
  template:
    metadata:
      labels:
        app: chatverse-api
    spec:
      containers:
      - name: api
        image: chatverse/api:latest
        ports:
        - containerPort: 3001
        env:
        - name: PORT
          value: "3001"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: chatverse-secrets
              key: mongodb-uri
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: chatverse-secrets
              key: redis-url
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: chatverse-secrets
              key: jwt-secret
        - name: JWT_REFRESH_SECRET
          valueFrom:
            secretKeyRef:
              name: chatverse-secrets
              key: jwt-refresh-secret
        envFrom:
        - configMapRef:
            name: chatverse-config
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 10
        imagePullPolicy: Always

---
apiVersion: v1
kind: Service
metadata:
  name: chatverse-api-service
  namespace: chatverse
spec:
  selector:
    app: chatverse-api
  ports:
  - protocol: TCP
    port: 3001
    targetPort: 3001
  type: ClusterIP
```

### Web Deployment
```yaml
# File: infra/k8s/web-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chatverse-web
  namespace: chatverse
  labels:
    app: chatverse-web
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: chatverse-web
  template:
    metadata:
      labels:
        app: chatverse-web
    spec:
      containers:
      - name: web
        image: chatverse/web:latest
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "250m"
        livenessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        imagePullPolicy: Always

---
apiVersion: v1
kind: Service
metadata:
  name: chatverse-web-service
  namespace: chatverse
spec:
  selector:
    app: chatverse-web
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8080
  type: ClusterIP
```

### Ingress Configuration
```yaml
# File: infra/k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: chatverse-ingress
  namespace: chatverse
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
spec:
  tls:
  - hosts:
    - chatverse.com
    - api.chatverse.com
    secretName: chatverse-tls
  rules:
  - host: chatverse.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: chatverse-web-service
            port:
              number: 80
  - host: api.chatverse.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: chatverse-api-service
            port:
              number: 3001
```

### Horizontal Pod Autoscaler
```yaml
# File: infra/k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: chatverse-api-hpa
  namespace: chatverse
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: chatverse-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: chatverse-web-hpa
  namespace: chatverse
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: chatverse-web
  minReplicas: 2
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Deployment Commands
```bash
# Create namespace and apply configurations
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/secrets.yaml
kubectl apply -f infra/k8s/

# Check deployment status
kubectl get pods -n chatverse
kubectl get services -n chatverse
kubectl get ingress -n chatverse

# Scale deployment
kubectl scale deployment chatverse-api --replicas=5 -n chatverse

# Rolling update
kubectl set image deployment/chatverse-api api=chatverse/api:v1.1.0 -n chatverse

# View logs
kubectl logs -f deployment/chatverse-api -n chatverse
```

## ☁️ Cloud Provider Specific Deployments

### AWS Deployment
```yaml
# File: infra/terraform/aws/main.tf
provider "aws" {
  region = var.aws_region
}

# EKS Cluster
resource "aws_eks_cluster" "chatverse" {
  name     = "chatverse-cluster"
  role_arn = aws_iam_role.eks_cluster.arn
  version  = "1.28"

  vpc_config {
    subnet_ids = [aws_subnet.private[*].id, aws_subnet.public[*].id]
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
  ]
}

# RDS for MongoDB (DocumentDB)
resource "aws_docdb_cluster" "chatverse" {
  cluster_identifier      = "chatverse-docdb"
  engine                  = "docdb"
  master_username         = var.docdb_username
  master_password         = var.docdb_password
  backup_retention_period = 7
  preferred_backup_window = "07:00-09:00"
  skip_final_snapshot     = false
  storage_encrypted       = true
}

# ElastiCache for Redis
resource "aws_elasticache_replication_group" "chatverse" {
  replication_group_id    = "chatverse-redis"
  description            = "Redis cluster for ChatVerse"
  port                   = 6379
  parameter_group_name   = "default.redis7"
  node_type             = "cache.t3.micro"
  num_cache_clusters    = 3
  subnet_group_name     = aws_elasticache_subnet_group.chatverse.name
  security_group_ids    = [aws_security_group.redis.id]
}

# S3 Bucket for file uploads
resource "aws_s3_bucket" "chatverse_uploads" {
  bucket = "chatverse-uploads-${random_string.bucket_suffix.result}"
}

resource "aws_s3_bucket_versioning" "chatverse_uploads" {
  bucket = aws_s3_bucket.chatverse_uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "chatverse_uploads" {
  bucket = aws_s3_bucket.chatverse_uploads.id
  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}
```

### Google Cloud Deployment
```yaml
# File: infra/terraform/gcp/main.tf
provider "google" {
  project = var.project_id
  region  = var.region
}

# GKE Cluster
resource "google_container_cluster" "chatverse" {
  name     = "chatverse-cluster"
  location = var.region

  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.vpc.name
  subnetwork = google_compute_subnetwork.subnet.name
}

# Cloud SQL for PostgreSQL (with MongoDB compatibility)
resource "google_sql_database_instance" "chatverse" {
  name             = "chatverse-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = "db-g1-small"

    backup_configuration {
      enabled    = true
      start_time = "07:00"
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
  }
}

# Memorystore for Redis
resource "google_redis_instance" "chatverse" {
  name           = "chatverse-redis"
  memory_size_gb = 1
  region         = var.region

  authorized_network = google_compute_network.vpc.id
  connect_mode      = "PRIVATE_SERVICE_ACCESS"
}

# Cloud Storage bucket
resource "google_storage_bucket" "chatverse_uploads" {
  name     = "chatverse-uploads-${random_string.bucket_suffix.result}"
  location = var.region

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.bucket_key.id
  }
}
```

## 📊 Monitoring and Observability

### Prometheus Configuration
```yaml
# File: infra/docker/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'chatverse-api'
    static_configs:
      - targets: ['api:3001']
    metrics_path: '/metrics'
    scrape_interval: 30s

  - job_name: 'mongodb'
    static_configs:
      - targets: ['mongodb-exporter:9216']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx-exporter:9113']
```

### Alert Rules
```yaml
# File: infra/docker/alert_rules.yml
groups:
- name: chatverse-alerts
  rules:
  - alert: APIHighErrorRate
    expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "High error rate on API"

  - alert: APIHighLatency
    expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High latency on API requests"

  - alert: DatabaseConnectionFailure
    expr: up{job="mongodb"} == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "MongoDB connection failure"
```

## 🔐 Environment Variables

### Production Environment Template
```bash
# File: .env.production
NODE_ENV=production
PORT=3001

# Database
MONGODB_URI=mongodb://username:password@mongo-cluster/chatverse?replicaSet=rs0&ssl=true
REDIS_URL=rediss://username:password@redis-cluster:6380

# JWT Secrets (Generate with: openssl rand -base64 64)
JWT_SECRET=your-super-secure-jwt-secret-change-this-in-production
JWT_REFRESH_SECRET=your-super-secure-refresh-secret-change-this-in-production

# File Storage
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=chatverse-uploads
S3_ACCESS_KEY=your-s3-access-key
S3_SECRET_KEY=your-s3-secret-key

# CORS
CORS_ORIGIN=https://chatverse.com,https://www.chatverse.com

# Push Notifications (Generate at: https://web-push-codelab.glitch.me/)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=1000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Security
HELMET_ENABLED=true
TRUST_PROXY=true
```

## 🚀 CI/CD Pipeline

### GitHub Actions Workflow
```yaml
# File: .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
    tags: ['v*']

env:
  REGISTRY: ghcr.io
  API_IMAGE_NAME: ${{ github.repository }}/api
  WEB_IMAGE_NAME: ${{ github.repository }}/web

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'
    - run: pnpm install --frozen-lockfile
    - run: pnpm lint
    - run: pnpm test
    - run: pnpm build

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - run: npm audit --audit-level moderate
    - uses: securecodewarrior/github-action-add-sarif@v1
      with:
        sarif-file: security-scan.sarif

  build:
    needs: [test, security]
    runs-on: ubuntu-latest
    outputs:
      api-image: ${{ steps.api-image.outputs.image }}
      web-image: ${{ steps.web-image.outputs.image }}
    steps:
    - uses: actions/checkout@v4

    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}

    - name: Build and push API image
      id: api-image
      uses: docker/build-push-action@v5
      with:
        context: .
        file: infra/docker/api.Dockerfile
        target: production
        push: true
        tags: |
          ${{ env.REGISTRY }}/${{ env.API_IMAGE_NAME }}:latest
          ${{ env.REGISTRY }}/${{ env.API_IMAGE_NAME }}:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

    - name: Build and push Web image
      id: web-image
      uses: docker/build-push-action@v5
      with:
        context: .
        file: infra/docker/web.Dockerfile
        target: production
        push: true
        tags: |
          ${{ env.REGISTRY }}/${{ env.WEB_IMAGE_NAME }}:latest
          ${{ env.REGISTRY }}/${{ env.WEB_IMAGE_NAME }}:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
    - uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1

    - name: Deploy to EKS
      run: |
        aws eks update-kubeconfig --region us-east-1 --name chatverse-cluster

        # Update image tags
        kubectl set image deployment/chatverse-api api=${{ needs.build.outputs.api-image }} -n chatverse
        kubectl set image deployment/chatverse-web web=${{ needs.build.outputs.web-image }} -n chatverse

        # Wait for rollout
        kubectl rollout status deployment/chatverse-api -n chatverse --timeout=300s
        kubectl rollout status deployment/chatverse-web -n chatverse --timeout=300s

  notify:
    needs: deploy
    runs-on: ubuntu-latest
    if: always()
    steps:
    - name: Slack Notification
      uses: 8398a7/action-slack@v3
      with:
        status: ${{ job.status }}
        channel: '#deployments'
        webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## 📈 Performance Optimization

### Database Optimization
```javascript
// MongoDB connection with production settings
const mongoOptions = {
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferMaxEntries: 0,
  readPreference: 'secondaryPreferred',
  writeConcern: { w: 'majority', j: true },
  retryWrites: true,
  compressors: ['zstd', 'zlib']
};
```

### Redis Configuration
```redis
# Production Redis configuration
maxmemory 1gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
tcp-keepalive 300
timeout 0
tcp-backlog 511
```

### CDN Configuration
```javascript
// CloudFlare page rules
const cacheRules = [
  { pattern: '*.chatverse.com/static/*', cache: 'Cache Everything', edge: '1y' },
  { pattern: '*.chatverse.com/api/*', cache: 'Bypass Cache' },
  { pattern: '*.chatverse.com/', cache: 'Cache Everything', edge: '2h' }
];
```

## 🔄 Backup and Disaster Recovery

### Database Backup
```bash
#!/bin/bash
# File: scripts/backup-db.sh

# MongoDB backup
mongodump --uri="$MONGODB_URI" --gzip --archive="/backups/chatverse-$(date +%Y%m%d_%H%M%S).gz"

# Upload to S3
aws s3 cp "/backups/chatverse-$(date +%Y%m%d_%H%M%S).gz" s3://chatverse-backups/mongodb/

# Cleanup old local backups (keep 7 days)
find /backups -name "chatverse-*.gz" -mtime +7 -delete
```

### Recovery Procedures
```bash
#!/bin/bash
# File: scripts/restore-db.sh

# Download backup from S3
aws s3 cp s3://chatverse-backups/mongodb/$BACKUP_FILE /tmp/

# Restore MongoDB
mongorestore --uri="$MONGODB_URI" --gzip --archive="/tmp/$BACKUP_FILE" --drop

echo "Database restored from $BACKUP_FILE"
```

---

**For deployment support, contact: devops@chatverse.com**

*Last updated: July 2025*
