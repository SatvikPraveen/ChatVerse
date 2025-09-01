# Security Guide

**File: docs/SECURITY.md**

## 🔐 Security Overview

ChatVerse implements comprehensive security measures following industry best practices and OWASP guidelines. This document outlines our security architecture, threat mitigation strategies, and secure development practices.

## 🎯 Security Principles

### 1. **Defense in Depth**
- Multiple layers of security controls
- No single point of failure
- Redundant protection mechanisms

### 2. **Zero Trust Architecture**
- Verify every request regardless of source
- Assume breach mentality
- Continuous authentication and authorization

### 3. **Privacy by Design**
- Data minimization principles
- User consent and control
- Transparent data handling

### 4. **Secure by Default**
- Fail-safe defaults
- Secure configuration out of the box
- Regular security updates

## 🔒 Authentication & Authorization

### JWT Token Security

#### Token Structure
```typescript
// Access Token (15 minutes)
{
  "userId": "64f1a2b3c4d5e6f7g8h9i0j1",
  "email": "user@example.com",
  "type": "access",
  "iat": 1642262400,
  "exp": 1642263300
}

// Refresh Token (7 days)
{
  "userId": "64f1a2b3c4d5e6f7g8h9i0j1",
  "type": "refresh",
  "jti": "unique-token-id",
  "iat": 1642262400,
  "exp": 1642867200
}
```

#### Token Security Features
- **RS256 Algorithm**: Asymmetric signing with RSA keys
- **Short Expiration**: 15-minute access tokens minimize exposure
- **Refresh Rotation**: New refresh token issued on each use
- **JTI Claims**: Unique identifiers for token revocation
- **Secure Storage**: HttpOnly cookies for refresh tokens

#### Implementation
```typescript
// JWT signing with RSA private key
const signToken = (payload: TokenPayload, type: 'access' | 'refresh') => {
  const secret = type === 'access' ? ACCESS_TOKEN_PRIVATE_KEY : REFRESH_TOKEN_PRIVATE_KEY;
  const expiresIn = type === 'access' ? '15m' : '7d';

  return jwt.sign(payload, secret, {
    algorithm: 'RS256',
    expiresIn,
    issuer: 'chatverse.com',
    audience: 'chatverse-client'
  });
};

// Token verification with RSA public key
const verifyToken = (token: string, type: 'access' | 'refresh') => {
  const secret = type === 'access' ? ACCESS_TOKEN_PUBLIC_KEY : REFRESH_TOKEN_PUBLIC_KEY;

  return jwt.verify(token, secret, {
    algorithm: 'RS256',
    issuer: 'chatverse.com',
    audience: 'chatverse-client'
  });
};
```

### Password Security

#### Password Requirements
- **Minimum length**: 8 characters
- **Complexity**: At least 3 of 4 character types (uppercase, lowercase, numbers, symbols)
- **No common passwords**: Dictionary check against 100k most common passwords
- **No personal info**: Username, email, or name derivatives forbidden

#### Password Hashing
```typescript
import bcrypt from 'bcrypt';

// Hash password with 12 rounds (recommended for 2024)
const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Verify password with timing-safe comparison
const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};
```

### Multi-Factor Authentication (Future)
- **TOTP**: Time-based one-time passwords
- **SMS**: Backup verification method
- **Recovery Codes**: Single-use backup codes

## 🛡️ Input Validation & Sanitization

### Request Validation
```typescript
import Joi from 'joi';
import DOMPurify from 'isomorphic-dompurify';

// Joi validation schemas
const messageSchema = Joi.object({
  conversationId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  type: Joi.string().valid('text', 'image', 'file', 'video', 'audio').required(),
  content: Joi.string().max(10000).required(),
  replyTo: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
});

// Input sanitization middleware
const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitize string fields recursively
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return DOMPurify.sanitize(obj, { ALLOWED_TAGS: [] });
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  next();
};
```

### SQL/NoSQL Injection Prevention
```typescript
// MongoDB injection prevention
const sanitizeMongoQuery = (query: any): any => {
  if (query && typeof query === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(query)) {
      // Prevent operator injection
      if (key.startsWith('$')) continue;
      sanitized[key] = typeof value === 'object' ? JSON.stringify(value) : value;
    }
    return sanitized;
  }
  return query;
};
```

## 🚫 Rate Limiting & DDoS Protection

### Rate Limiting Strategy
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

// Different limits for different endpoints
const createRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args),
    }),
    windowMs,
    max,
    message: { error: { code: 'RATE_LIMIT_EXCEEDED', message } },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Apply different limits
app.use('/auth/login', createRateLimit(15 * 60 * 1000, 5, 'Too many login attempts'));
app.use('/auth/register', createRateLimit(15 * 60 * 1000, 3, 'Too many registration attempts'));
app.use('/messages', createRateLimit(60 * 1000, 100, 'Too many messages'));
app.use('/', createRateLimit(15 * 60 * 1000, 1000, 'Too many requests'));
```

### Socket.io Rate Limiting
```typescript
import { RateLimiterRedis } from 'rate-limiter-flexible';

const messageLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'socket_message',
  points: 30, // 30 messages
  duration: 60, // per minute
});

socket.on('send_message', async (data, callback) => {
  try {
    await messageLimiter.consume(socket.userId);
    // Process message
  } catch (rejRes) {
    socket.emit('rate_limit_exceeded', {
      limit: 30,
      windowMs: 60000,
      remaining: rejRes.remainingPoints,
      resetTime: new Date(Date.now() + rejRes.msBeforeNext)
    });
  }
});
```

## 🔐 Data Encryption

### End-to-End Encryption (Optional)
```typescript
import crypto from 'crypto';

// Generate key pair for user
const generateKeyPair = () => {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
};

// Encrypt message with recipient's public key
const encryptMessage = (message: string, publicKey: string): string => {
  const buffer = Buffer.from(message, 'utf8');
  const encrypted = crypto.publicEncrypt(publicKey, buffer);
  return encrypted.toString('base64');
};

// Decrypt message with private key
const decryptMessage = (encryptedMessage: string, privateKey: string): string => {
  const buffer = Buffer.from(encryptedMessage, 'base64');
  const decrypted = crypto.privateDecrypt(privateKey, buffer);
  return decrypted.toString('utf8');
};
```

### Data at Rest Encryption
- **MongoDB**: Encryption at rest enabled
- **Redis**: TLS encryption for data in transit
- **S3**: Server-side encryption (SSE-S3/SSE-KMS)
- **Secrets**: Environment variables encrypted

## 🛡️ Security Headers

### HTTP Security Headers
```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Additional custom headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
```

### CORS Configuration
```typescript
import cors from 'cors';

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://chatverse.com', 'https://app.chatverse.com']
    : ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
};

app.use(cors(corsOptions));
```

## 🔍 Vulnerability Assessment

### OWASP Top 10 Mitigation

#### A01: Broken Access Control
- **JWT validation** on all protected routes
- **Role-based access control** for admin functions
- **Resource ownership validation** for user data
- **Principle of least privilege**

#### A02: Cryptographic Failures
- **Strong encryption** for passwords (bcrypt)
- **TLS 1.3** for data in transit
- **Secure key management** with environment variables
- **No hardcoded secrets** in code

#### A03: Injection
- **Parameterized queries** with Mongoose
- **Input validation** with Joi schemas
- **Output encoding** with DOMPurify
- **NoSQL injection prevention**

#### A04: Insecure Design
- **Threat modeling** during development
- **Security requirements** in user stories
- **Secure architecture reviews**
- **Defense in depth** strategy

#### A05: Security Misconfiguration
- **Secure defaults** in all configurations
- **Regular security updates**
- **Minimal attack surface**
- **Error handling** without information disclosure

#### A06: Vulnerable Components
- **Dependency scanning** with npm audit
- **Automated updates** for security patches
- **Software composition analysis**
- **Regular vulnerability assessments**

#### A07: Authentication Failures
- **Strong password requirements**
- **Account lockout** after failed attempts
- **Session management** with secure tokens
- **Multi-factor authentication** (planned)

#### A08: Software Integrity Failures
- **Code signing** for deployments
- **Dependency verification**
- **CI/CD security** with signed commits
- **Software bill of materials**

#### A09: Logging Failures
- **Comprehensive audit logging**
- **Security event monitoring**
- **Log integrity protection**
- **Incident response procedures**

#### A10: Server-Side Request Forgery
- **URL validation** for external requests
- **Network segmentation**
- **Allowlist approach** for external services
- **Request sanitization**

## 📊 Security Monitoring

### Audit Logging
```typescript
import winston from 'winston';

const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'security.log' }),
    new winston.transports.Console()
  ]
});

// Log security events
const logSecurityEvent = (event: string, userId: string, details: any) => {
  securityLogger.info({
    event,
    userId,
    timestamp: new Date().toISOString(),
    ip: details.ip,
    userAgent: details.userAgent,
    details
  });
};

// Examples
logSecurityEvent('LOGIN_SUCCESS', userId, { ip, userAgent });
logSecurityEvent('LOGIN_FAILURE', null, { email, ip, userAgent });
logSecurityEvent('RATE_LIMIT_EXCEEDED', userId, { endpoint, ip });
```

### Intrusion Detection
```typescript
// Suspicious activity detection
const detectSuspiciousActivity = async (userId: string, activity: string) => {
  const key = `suspicious:${userId}:${activity}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour window
  }

  // Alert on threshold
  if (count > SUSPICIOUS_THRESHOLD) {
    await alertSecurityTeam({
      type: 'SUSPICIOUS_ACTIVITY',
      userId,
      activity,
      count,
      timestamp: new Date()
    });
  }
};
```

## 🔐 File Upload Security

### File Validation
```typescript
import fileType from 'file-type';
import sharp from 'sharp';

const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const validateFile = async (buffer: Buffer, originalName: string) => {
  // Check file size
  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error('File too large');
  }

  // Detect actual file type
  const detectedType = await fileType.fromBuffer(buffer);
  if (!detectedType || !ALLOWED_MIME_TYPES.includes(detectedType.mime)) {
    throw new Error('Invalid file type');
  }

  // Validate file extension matches content
  const extension = path.extname(originalName).toLowerCase();
  if (detectedType.ext !== extension.slice(1)) {
    throw new Error('File extension mismatch');
  }

  return detectedType;
};

// Image processing and sanitization
const sanitizeImage = async (buffer: Buffer) => {
  return await sharp(buffer)
    .jpeg({ quality: 85 }) // Convert to JPEG and compress
    .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true }) // Resize
    .removeAlpha() // Remove potential hidden channels
    .toBuffer();
};
```

## 🚨 Incident Response

### Security Incident Classification
- **P0 - Critical**: Data breach, system compromise
- **P1 - High**: Authentication bypass, privilege escalation
- **P2 - Medium**: Information disclosure, DoS
- **P3 - Low**: Configuration issues, minor vulnerabilities

### Response Procedures
1. **Detection**: Automated alerts, user reports, security scans
2. **Analysis**: Threat assessment, impact evaluation
3. **Containment**: Isolate affected systems, revoke compromised tokens
4. **Eradication**: Remove malicious code, patch vulnerabilities
5. **Recovery**: Restore services, validate integrity
6. **Lessons Learned**: Post-incident review, improve defenses

### Contact Information
```bash
# Emergency Security Contacts
Security Team: security@chatverse.com
On-Call: +1-555-SECURITY
Incident Response: incidents@chatverse.com
```

## 🔐 Secure Development

### Code Review Checklist
- [ ] Authentication checks on all protected endpoints
- [ ] Input validation and sanitization
- [ ] SQL/NoSQL injection prevention
- [ ] XSS prevention measures
- [ ] CSRF protection where needed
- [ ] Proper error handling (no info disclosure)
- [ ] Rate limiting on user-facing endpoints
- [ ] Secure configuration (no hardcoded secrets)
- [ ] Logging of security events
- [ ] Authorization checks for data access

### Static Analysis Tools
```bash
# Security linting
npm run lint:security

# Dependency vulnerability scanning
npm audit
snyk test

# SAST scanning
semgrep --config=auto .
```

### Penetration Testing
- **Quarterly external penetration tests**
- **Annual red team exercises**
- **Continuous automated security testing**
- **Bug bounty program** (planned)

## 🎯 Security Roadmap

### Current Security Level: ★★★★☆

### Completed ✅
- JWT authentication with refresh tokens
- Input validation and sanitization
- Rate limiting and DDoS protection
- Security headers and CORS
- Password hashing with bcrypt
- File upload security
- Audit logging

### In Progress 🚧
- End-to-end encryption implementation
- Advanced threat detection
- Security monitoring dashboard

### Planned 📋
- Multi-factor authentication
- Hardware security keys support
- Advanced persistent threat detection
- Zero-trust network architecture
- Compliance certifications (SOC 2, ISO 27001)

---

**For security reports or questions, contact: security@chatverse.com**

*Last updated: July 2025*
