# API Reference

**File: docs/API_REFERENCE.md**

## 🔗 Base URL
```
Development: http://localhost:3001
Production: https://api.chatverse.com
```

## 🔐 Authentication

All protected endpoints require a Bearer token in the Authorization header:
```http
Authorization: Bearer <access_token>
```

### Token Expiration
- **Access Token**: 15 minutes
- **Refresh Token**: 7 days

## 📋 Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "issue": "Invalid email format"
    }
  }
}
```

## 🔒 Authentication Endpoints

### Register User
```http
POST /auth/register
```

**Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePass123!",
  "displayName": "John Doe"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
      "username": "john_doe",
      "email": "john@example.com",
      "displayName": "John Doe",
      "status": "offline",
      "isVerified": false,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
  }
}
```

### Login User
```http
POST /auth/login
```

**Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123!"
}
```

### Refresh Token
```http
POST /auth/refresh
```

**Body:**
```json
{
  "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

### Logout
```http
POST /auth/logout
```
*Requires: Bearer token*

## 👤 User Endpoints

### Get Current User
```http
GET /users/me
```
*Requires: Bearer token*

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
    "username": "john_doe",
    "email": "john@example.com",
    "displayName": "John Doe",
    "avatar": "https://storage.chatverse.com/avatars/john.jpg",
    "status": "online",
    "lastSeen": "2024-01-15T14:30:00Z",
    "preferences": {
      "theme": "dark",
      "notifications": {
        "desktop": true,
        "sound": true
      }
    }
  }
}
```

### Update User Profile
```http
PUT /users/me
```
*Requires: Bearer token*

**Body:**
```json
{
  "displayName": "John Smith",
  "avatar": "https://storage.chatverse.com/avatars/new-john.jpg",
  "status": "away"
}
```

### Update User Preferences
```http
PUT /users/me/preferences
```
*Requires: Bearer token*

**Body:**
```json
{
  "theme": "light",
  "notifications": {
    "desktop": false,
    "sound": true,
    "mentions": true,
    "directMessages": true
  },
  "privacy": {
    "showOnlineStatus": false,
    "showLastSeen": true
  }
}
```

### Search Users
```http
GET /users/search?query=john&limit=10
```
*Requires: Bearer token*

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
        "username": "john_doe",
        "displayName": "John Doe",
        "avatar": "https://storage.chatverse.com/avatars/john.jpg",
        "status": "online"
      }
    ]
  }
}
```

## 💬 Conversation Endpoints

### Get User Conversations
```http
GET /conversations?page=1&limit=20&archived=false
```
*Requires: Bearer token*

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j2",
      "type": "direct",
      "participants": [
        {
          "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
          "displayName": "John Doe",
          "avatar": "https://storage.chatverse.com/avatars/john.jpg",
          "status": "online"
        }
      ],
      "lastMessage": {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
        "content": "Hey, how are you?",
        "senderId": "64f1a2b3c4d5e6f7g8h9i0j1",
        "createdAt": "2024-01-15T14:25:00Z"
      },
      "unreadCount": 2,
      "isPinned": true,
      "updatedAt": "2024-01-15T14:25:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 15,
    "totalPages": 1
  }
}
```

### Create Conversation
```http
POST /conversations
```
*Requires: Bearer token*

**Body:**
```json
{
  "type": "group",
  "name": "Development Team",
  "description": "Main development discussion",
  "participants": [
    "64f1a2b3c4d5e6f7g8h9i0j1",
    "64f1a2b3c4d5e6f7g8h9i0j4"
  ]
}
```

### Get Conversation Details
```http
GET /conversations/:conversationId
```
*Requires: Bearer token*

### Update Conversation
```http
PUT /conversations/:conversationId
```
*Requires: Bearer token*

**Body:**
```json
{
  "name": "Updated Team Name",
  "description": "Updated description"
}
```

### Add Participants
```http
POST /conversations/:conversationId/participants
```
*Requires: Bearer token*

**Body:**
```json
{
  "userIds": [
    "64f1a2b3c4d5e6f7g8h9i0j5",
    "64f1a2b3c4d5e6f7g8h9i0j6"
  ]
}
```

### Remove Participant
```http
DELETE /conversations/:conversationId/participants/:userId
```
*Requires: Bearer token*

### Leave Conversation
```http
POST /conversations/:conversationId/leave
```
*Requires: Bearer token*

## 📝 Message Endpoints

### Get Messages
```http
GET /conversations/:conversationId/messages?page=1&limit=50&before=messageId
```
*Requires: Bearer token*

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64f1a2b3c4d5e6f7g8h9i0j3",
      "conversationId": "64f1a2b3c4d5e6f7g8h9i0j2",
      "sender": {
        "_id": "64f1a2b3c4d5e6f7g8h9i0j1",
        "displayName": "John Doe",
        "avatar": "https://storage.chatverse.com/avatars/john.jpg"
      },
      "type": "text",
      "content": "Hey, how are you?",
      "reactions": [
        {
          "emoji": "👍",
          "userId": "64f1a2b3c4d5e6f7g8h9i0j4",
          "createdAt": "2024-01-15T14:26:00Z"
        }
      ],
      "readBy": [
        {
          "userId": "64f1a2b3c4d5e6f7g8h9i0j1",
          "readAt": "2024-01-15T14:25:00Z"
        }
      ],
      "isEdited": false,
      "createdAt": "2024-01-15T14:25:00Z"
    }
  ]
}
```

### Send Message
```http
POST /messages
```
*Requires: Bearer token*

**Body:**
```json
{
  "conversationId": "64f1a2b3c4d5e6f7g8h9i0j2",
  "type": "text",
  "content": "Hello everyone!",
  "replyTo": "64f1a2b3c4d5e6f7g8h9i0j3"
}
```

### Edit Message
```http
PUT /messages/:messageId
```
*Requires: Bearer token*

**Body:**
```json
{
  "content": "Updated message content"
}
```

### Delete Message
```http
DELETE /messages/:messageId
```
*Requires: Bearer token*

**Body:**
```json
{
  "deleteForEveryone": true
}
```

### Add Reaction
```http
POST /messages/:messageId/reactions
```
*Requires: Bearer token*

**Body:**
```json
{
  "emoji": "👍"
}
```

### Remove Reaction
```http
DELETE /messages/:messageId/reactions/:emoji
```
*Requires: Bearer token*

### Mark as Read
```http
POST /conversations/:conversationId/read
```
*Requires: Bearer token*

**Body:**
```json
{
  "messageId": "64f1a2b3c4d5e6f7g8h9i0j3"
}
```

## 📎 File Upload Endpoints

### Request Presigned Upload URL
```http
POST /uploads/presign
```
*Requires: Bearer token*

**Body:**
```json
{
  "fileName": "document.pdf",
  "fileSize": 1048576,
  "mimeType": "application/pdf"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://storage.chatverse.com/uploads/presigned-url",
    "fileUrl": "https://storage.chatverse.com/uploads/64f1a2b3c4d5e6f7g8h9i0j1/document.pdf",
    "fileId": "64f1a2b3c4d5e6f7g8h9i0j7",
    "fields": {
      "key": "uploads/64f1a2b3c4d5e6f7g8h9i0j1/document.pdf",
      "policy": "...",
      "signature": "..."
    }
  }
}
```

### Complete Upload
```http
POST /uploads/:fileId/complete
```
*Requires: Bearer token*

**Body:**
```json
{
  "etag": "\"9bb58f26192e4ba00f01e2e7b136bbd8\""
}
```

## 🔔 Push Notification Endpoints

### Save Push Subscription
```http
POST /push/subscribe
```
*Requires: Bearer token*

**Body:**
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/abc123",
    "keys": {
      "p256dh": "BNbQ...",
      "auth": "abc123..."
    }
  },
  "userAgent": "Mozilla/5.0..."
}
```

### Remove Push Subscription
```http
DELETE /push/unsubscribe
```
*Requires: Bearer token*

## 🏥 Health Check Endpoints

### Liveness Check
```http
GET /health/live
```

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2024-01-15T14:30:00Z"
}
```

### Readiness Check
```http
GET /health/ready
```

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2024-01-15T14:30:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "storage": "healthy"
  },
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Metrics (Prometheus)
```http
GET /metrics
```

## 🌐 WebSocket Events

### Connection
```typescript
// Connect to WebSocket
const socket = io('ws://localhost:3001', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Authentication successful
socket.on('authenticated', (userData) => {
  console.log('Connected as:', userData.displayName);
});
```

### Message Events
```typescript
// Send message
socket.emit('send_message', {
  conversationId: '64f1a2b3c4d5e6f7g8h9i0j2',
  type: 'text',
  content: 'Hello!',
  tempId: 'temp_12345'
}, (response) => {
  if (response.success) {
    console.log('Message sent:', response.message);
  }
});

// Receive new message
socket.on('new_message', (data) => {
  console.log('New message:', data.message);
});

// Message updated
socket.on('message_updated', (data) => {
  console.log('Message edited:', data);
});

// Message deleted
socket.on('message_deleted', (data) => {
  console.log('Message deleted:', data.messageId);
});
```

### Reaction Events
```typescript
// Add reaction
socket.emit('add_reaction', {
  messageId: '64f1a2b3c4d5e6f7g8h9i0j3',
  emoji: '👍',
  conversationId: '64f1a2b3c4d5e6f7g8h9i0j2'
});

// Reaction added
socket.on('reaction_added', (data) => {
  console.log('Reaction added:', data);
});
```

### Typing Events
```typescript
// Start typing
socket.emit('start_typing', 'conversationId');

// Stop typing
socket.emit('stop_typing', 'conversationId');

// User typing
socket.on('user_typing', (data) => {
  console.log(`${data.displayName} is typing...`);
});

// User stopped typing
socket.on('user_stopped_typing', (data) => {
  console.log(`${data.displayName} stopped typing`);
});
```

### Presence Events
```typescript
// Update status
socket.emit('update_status', 'away');

// User status changed
socket.on('user_status_changed', (data) => {
  console.log(`${data.userId} is now ${data.status}`);
});

// User online
socket.on('user_online', (data) => {
  console.log(`${data.userId} came online`);
});

// User offline
socket.on('user_offline', (data) => {
  console.log(`${data.userId} went offline`);
});
```

### Read Receipt Events
```typescript
// Mark as read
socket.emit('mark_as_read', {
  conversationId: '64f1a2b3c4d5e6f7g8h9i0j2',
  messageId: '64f1a2b3c4d5e6f7g8h9i0j3'
});

// Message read
socket.on('message_read', (data) => {
  console.log('Message read by:', data.userId);
});
```

### Conversation Events
```typescript
// Join conversation room
socket.emit('join_conversation', 'conversationId');

// Leave conversation room
socket.emit('leave_conversation', 'conversationId');

// User joined conversation
socket.on('user_joined_conversation', (data) => {
  console.log('User joined:', data.user.displayName);
});

// User left conversation
socket.on('user_left_conversation', (data) => {
  console.log('User left:', data.userId);
});
```

## ⚠️ Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Invalid or missing authentication token |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Invalid input data |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `CONVERSATION_NOT_FOUND` | Conversation does not exist |
| `MESSAGE_NOT_FOUND` | Message does not exist |
| `USER_NOT_FOUND` | User does not exist |
| `DUPLICATE_EMAIL` | Email already exists |
| `DUPLICATE_USERNAME` | Username already exists |
| `INVALID_CREDENTIALS` | Wrong email or password |
| `TOKEN_EXPIRED` | JWT token has expired |
| `FILE_TOO_LARGE` | File exceeds size limit |
| `INVALID_FILE_TYPE` | File type not allowed |
| `UPLOAD_FAILED` | File upload failed |

## 📊 Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /auth/login` | 5 requests | 15 minutes |
| `POST /auth/register` | 3 requests | 15 minutes |
| `POST /messages` | 100 requests | 1 minute |
| `POST /uploads/presign` | 10 requests | 1 minute |
| All other endpoints | 1000 requests | 15 minutes |

Rate limits are per IP address and include headers:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642262400
```
