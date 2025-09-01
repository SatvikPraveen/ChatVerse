# Scaling Runbook

**File: docs/RUNBOOKS/scaling.md**

## 📈 Scaling Strategy Overview

ChatVerse is designed for horizontal scaling with auto-scaling capabilities. This runbook covers scaling procedures for different traffic patterns and growth scenarios.

## 🎯 Scaling Targets & Thresholds

### Performance Targets
- **Response Time**: 95th percentile < 200ms
- **Availability**: 99.9% uptime
- **Throughput**: 10,000 concurrent users per API instance
- **WebSocket Connections**: 5,000 per API instance
- **Message Processing**: 1,000 messages/second per instance

### Auto-Scaling Thresholds
```yaml
# Horizontal Pod Autoscaler settings
metrics:
  cpu:
    target: 70%
    scale_up_threshold: 80%
    scale_down_threshold: 50%
  memory:
    target: 80%
    scale_up_threshold: 85%
    scale_down_threshold: 60%
  custom_metrics:
    active_connections:
      target: 4000
      max: 5000
    message_rate:
      target: 800
      max: 1000
```

## 🚀 Horizontal Scaling Procedures

### Auto-Scaling Configuration

#### API Servers (Kubernetes HPA)
```yaml
# File: infra/k8s/api-hpa.yaml
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
  maxReplicas: 20
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
  - type: Object
    object:
      metric:
        name: active_websocket_connections
      target:
        type: AverageValue
        averageValue: "4000"
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Pods
        value: 2
        periodSeconds: 60
      - type: Percent
        value: 50
        periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 180
```

#### Manual Scaling Commands
```bash
# Scale API servers
kubectl scale deployment chatverse-api --replicas=10 -n chatverse

# Scale web servers
kubectl scale deployment chatverse-web --replicas=5 -n chatverse

# Check current replicas
kubectl get deployment -n chatverse

# View HPA status
kubectl get hpa -n chatverse
kubectl describe hpa chatverse-api-hpa -n chatverse
```

### Load Testing & Capacity Planning

#### Load Testing Setup
```bash
# Install k6 for load testing
npm install -g k6

# Run load test
k6 run --vus 1000 --duration 10m scripts/load-test.js

# Monitor during load test
watch kubectl get pods -n chatverse
watch kubectl top pods -n chatverse
```

#### Load Test Script Example
```javascript
// File: scripts/load-test.js
import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 1000 }, // Stay at 1000 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests under 200ms
    http_req_failed: ['rate<0.01'],   // Error rate under 1%
  },
};

#### Load Test Script Example
```javascript
// File: scripts/load-test.js
import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 1000 }, // Stay at 1000 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'], // 95% of requests under 200ms
    http_req_failed: ['rate<0.01'],   // Error rate under 1%
  },
};

export default function () {
  // Test API endpoints
  const loginRes = http.post('https://api.chatverse.com/auth/login', {
    email: 'test@example.com',
    password: 'password123'
  });

  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
  });

  const token = loginRes.json('data.accessToken');

  // Test WebSocket connection
  const wsUrl = 'wss://api.chatverse.com/socket.io/';
  const response = ws.connect(wsUrl, {
    headers: { Authorization: `Bearer ${token}` }
  }, function (socket) {
    socket.on('open', () => {
      socket.send('{"type":"authenticate","token":"' + token + '"}');
    });

    socket.on('message', (data) => {
      check(data, {
        'received message': (d) => d !== null,
      });
    });
  });
}
```

## 📊 Database Scaling

### MongoDB Scaling Strategy

#### Read Replicas Configuration
```javascript
// Connection string with read preference
const mongoUri = 'mongodb://primary:27017,secondary1:27017,secondary2:27017/chatverse?replicaSet=rs0&readPreference=secondaryPreferred';

// Read operations optimization
const readOptions = {
  readPreference: 'secondaryPreferred',
  readConcern: { level: 'local' }
};

// Write operations
const writeOptions = {
  writeConcern: { w: 'majority', j: true }
};
```

#### Sharding Setup (Future Growth)
```bash
# Enable sharding for database
mongosh --eval "sh.enableSharding('chatverse')"

# Shard messages collection by conversationId
mongosh --eval "sh.shardCollection('chatverse.messages', { conversationId: 1, createdAt: 1 })"

# Check shard status
mongosh --eval "sh.status()"
```

### Redis Scaling

#### Redis Cluster Setup
```bash
# Check cluster status
redis-cli cluster info
redis-cli cluster nodes

# Add new node to cluster
redis-cli --cluster add-node NEW_NODE_IP:6379 EXISTING_NODE_IP:6379

# Rebalance cluster
redis-cli --cluster rebalance CLUSTER_IP:6379 --cluster-use-empty-masters
```

#### Redis Memory Optimization
```redis
# Configuration for high-traffic scenarios
maxmemory 8gb
maxmemory-policy allkeys-lru
save ""
appendonly yes
appendfsync everysec
```

## ☁️ Infrastructure Scaling

### AWS Auto Scaling Groups
```yaml
# File: infra/terraform/aws/autoscaling.tf
resource "aws_autoscaling_group" "chatverse_api" {
  name                = "chatverse-api-asg"
  vpc_zone_identifier = var.private_subnet_ids
  target_group_arns   = [aws_lb_target_group.api.arn]
  health_check_type   = "ELB"
  health_check_grace_period = 300

  min_size         = 3
  max_size         = 20
  desired_capacity = 5

  launch_template {
    id      = aws_launch_template.api.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "chatverse-api"
    propagate_at_launch = true
  }
}

resource "aws_autoscaling_policy" "scale_up" {
  name                   = "chatverse-api-scale-up"
  scaling_adjustment     = 2
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.chatverse_api.name
}

resource "aws_autoscaling_policy" "scale_down" {
  name                   = "chatverse-api-scale-down"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.chatverse_api.name
}
```

### CloudWatch Alarms
```yaml
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "chatverse-api-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "60"
  statistic           = "Average"
  threshold           = "75"
  alarm_description   = "This metric monitors ec2 cpu utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_up.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.chatverse_api.name
  }
}
```

## 🔄 CDN and Caching Scaling

### CloudFlare Configuration
```javascript
// Cache rules for different content types
const cacheRules = [
  {
    pattern: '*/static/*',
    cache: 'Cache Everything',
    edge_ttl: '1y',
    browser_ttl: '1y'
  },
  {
    pattern: '*/api/users/me',
    cache: 'Cache by Device Type',
    edge_ttl: '5m',
    browser_ttl: '0'
  },
  {
    pattern: '*/api/*',
    cache: 'Bypass Cache'
  }
];
```

### Application-Level Caching
```typescript
// Redis caching strategy
const CACHE_STRATEGIES = {
  USER_PROFILE: { ttl: 300, key: (id: string) => `user:${id}` },
  CONVERSATION_LIST: { ttl: 60, key: (userId: string) => `conv:${userId}` },
  MESSAGE_HISTORY: { ttl: 120, key: (convId: string, page: number) => `msg:${convId}:${page}` },
  ONLINE_USERS: { ttl: 30, key: () => 'users:online' }
};

// Cache wrapper function
const withCache = async <T>(
  key: string,
  ttl: number,
  fetchFn: () => Promise<T>
): Promise<T> => {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const result = await fetchFn();
  await redis.setex(key, ttl, JSON.stringify(result));
  return result;
};
```

## 🚨 Traffic Surge Response

### Emergency Scaling Procedures

#### High Traffic Alert Response (>10x normal)
```bash
#!/bin/bash
# File: scripts/emergency-scale.sh

echo "🚨 Emergency scaling activated"

# Immediately scale up API servers
kubectl scale deployment chatverse-api --replicas=15 -n chatverse

# Scale up web servers
kubectl scale deployment chatverse-web --replicas=8 -n chatverse

# Enable aggressive caching
kubectl patch configmap chatverse-config -n chatverse -p '{"data":{"CACHE_TTL":"300"}}'

# Restart API to pick up config changes
kubectl rollout restart deployment/chatverse-api -n chatverse

# Monitor scaling progress
kubectl get pods -n chatverse -w
```

#### Rate Limiting Adjustment
```typescript
// Emergency rate limiting
const EMERGENCY_LIMITS = {
  MESSAGE: { max: 50, window: '1m' },      // Reduced from 100
  API_GENERAL: { max: 500, window: '15m' }, // Reduced from 1000
  FILE_UPLOAD: { max: 5, window: '1m' },   // Reduced from 10
  LOGIN: { max: 3, window: '15m' }         // Reduced from 5
};

// Apply emergency limits
const applyEmergencyLimits = () => {
  Object.entries(EMERGENCY_LIMITS).forEach(([key, limit]) => {
    redis.setex(`ratelimit:emergency:${key}`, 3600, JSON.stringify(limit));
  });
};
```

### Circuit Breaker Patterns
```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailTime > 30000) { // 30s timeout
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= 5) { // Threshold
      this.state = 'OPEN';
    }
  }
}
```

## 📈 Capacity Planning

### Growth Projections
```typescript
// User growth model
const capacityModel = {
  currentUsers: 50000,
  monthlyGrowthRate: 0.15, // 15% monthly growth
  peakConcurrencyRatio: 0.1, // 10% of users online at peak

  calculateCapacity(months: number) {
    const futureUsers = this.currentUsers * Math.pow(1 + this.monthlyGrowthRate, months);
    const peakConcurrent = futureUsers * this.peakConcurrencyRatio;

    return {
      totalUsers: Math.ceil(futureUsers),
      peakConcurrent: Math.ceil(peakConcurrent),
      apiInstances: Math.ceil(peakConcurrent / 5000), // 5k users per instance
      dbConnections: Math.ceil(peakConcurrent / 100), // 100 users per connection
      redisMemory: Math.ceil(peakConcurrent * 0.001), // 1MB per concurrent user
    };
  }
};

// 6-month capacity planning
console.log('6-month capacity:', capacityModel.calculateCapacity(6));
```

### Resource Planning Matrix
```yaml
# Resource requirements by user count
capacity_tiers:
  small:    # 0-10k users
    api_instances: 3
    web_instances: 2
    db_cpu: 2
    db_memory: 4GB
    redis_memory: 1GB

  medium:   # 10k-100k users
    api_instances: 8
    web_instances: 4
    db_cpu: 8
    db_memory: 16GB
    redis_memory: 4GB

  large:    # 100k-1M users
    api_instances: 20
    web_instances: 10
    db_cpu: 16
    db_memory: 64GB
    redis_memory: 16GB

  xlarge:   # 1M+ users
    api_instances: 50
    web_instances: 20
    db_cpu: 32
    db_memory: 128GB
    redis_memory: 32GB
```

## 🔍 Monitoring & Alerting for Scaling

### Key Scaling Metrics
```typescript
// Prometheus metrics for scaling decisions
const scalingMetrics = {
  // API metrics
  'http_requests_per_second': 'rate(http_requests_total[1m])',
  'api_response_time_p95': 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
  'active_websocket_connections': 'socket_io_connected_clients',

  // Resource metrics
  'cpu_utilization': 'rate(container_cpu_usage_seconds_total[1m]) * 100',
  'memory_utilization': 'container_memory_usage_bytes / container_spec_memory_limit_bytes * 100',

  // Database metrics
  'db_connections_active': 'mongodb_connections{state="current"}',
  'db_operations_per_second': 'rate(mongodb_op_counters_total[1m])',

  // Business metrics
  'messages_per_second': 'rate(chatverse_messages_sent_total[1m])',
  'concurrent_users': 'chatverse_active_users',
};
```

### Scaling Alerts
```yaml
# File: monitoring/scaling-alerts.yml
groups:
- name: scaling-alerts
  rules:
  - alert: HighCPUUtilization
    expr: avg(rate(container_cpu_usage_seconds_total[5m])) > 0.8
    for: 2m
    labels:
      severity: warning
      action: scale_up
    annotations:
      summary: "High CPU utilization detected"

  - alert: HighMemoryUtilization
    expr: avg(container_memory_usage_bytes / container_spec_memory_limit_bytes) > 0.85
    for: 2m
    labels:
      severity: warning
      action: scale_up

  - alert: HighWebSocketConnections
    expr: socket_io_connected_clients > 4000
    for: 1m
    labels:
      severity: warning
      action: scale_up

  - alert: LowResourceUtilization
    expr: avg(rate(container_cpu_usage_seconds_total[10m])) < 0.3 AND avg(container_memory_usage_bytes / container_spec_memory_limit_bytes) < 0.5
    for: 10m
    labels:
      severity: info
      action: scale_down
```

## 🎯 Scaling Best Practices

### Pre-scaling Checklist
- [ ] Load test at target capacity
- [ ] Database connection limits verified
- [ ] Redis memory limits configured
- [ ] CDN caching optimized
- [ ] Auto-scaling policies tested
- [ ] Circuit breakers configured
- [ ] Monitoring dashboards updated

### Scaling Safety Guidelines
1. **Gradual Scaling**: Never scale more than 2x at once
2. **Health Checks**: Always wait for health checks before adding traffic
3. **Rollback Plan**: Have immediate rollback procedures ready
4. **Resource Limits**: Set reasonable upper limits to prevent cost explosion
5. **Monitoring**: Watch key metrics during scaling operations

### Cost Optimization
```typescript
// Cost-aware scaling decisions
const costOptimization = {
  // Use spot instances for non-critical workloads
  useSpotInstances: true,
  spotInstanceTypes: ['t3.medium', 't3.large'],

  // Scale down during low traffic hours
  nightTimeReduction: 0.7, // 30% reduction
  weekendReduction: 0.5,   // 50% reduction

  // Resource efficiency targets
  targetCPUUtilization: 70,
  targetMemoryUtilization: 80,

  // Auto-shutdown unused resources
  idleTimeoutMinutes: 60,
};
```

---

**For scaling support: scaling@chatverse.com | Emergency: +1-555-SCALING**

*Last updated: July 2025*
