# 🚀 Webhook Notification Implementation

## 📋 Overview

This document describes the complete webhook notification implementation for the Enterprise CA Management System. The implementation includes delivery tracking, retry logic, security features, and comprehensive monitoring.

## 🏗️ Architecture

### Core Components

1. **WebhookService** (`src/lib/webhook-service.ts`)
   - Handles HTTP requests with retry logic
   - Manages timeouts and error handling
   - Generates webhook signatures for security

2. **Enhanced NotificationService** (`src/lib/notifications.ts`)
   - Integrates with WebhookService
   - Manages delivery tracking
   - Handles configuration storage

3. **Database Schema Updates**
   - `WebhookDelivery` model for tracking
   - Enhanced `NotificationSetting` with webhook config
   - Performance indexes for monitoring

4. **API Endpoints**
   - `/api/notifications/test-webhook` - Test webhook endpoints
   - `/api/notifications/webhook-deliveries` - Manage deliveries

## 📊 Database Schema Changes

### New Models

#### WebhookDelivery
```sql
CREATE TABLE webhook_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  webhookId TEXT NOT NULL,
  url TEXT NOT NULL,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,           -- JSON string (SQLite) / JSON object (PostgreSQL)
  status TEXT NOT NULL,            -- pending, sent, failed, retrying
  statusCode INTEGER,
  responseTime INTEGER,            -- milliseconds
  error TEXT,
  retries INTEGER NOT NULL DEFAULT 0,
  maxRetries INTEGER NOT NULL DEFAULT 3,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sentAt DATETIME,
  nextRetryAt DATETIME,
  FOREIGN KEY (webhookId) REFERENCES notification_settings(id)
);
```

#### Enhanced NotificationSetting
```sql
ALTER TABLE notification_settings 
ADD COLUMN webhookConfig TEXT;     -- JSON string (SQLite) / JSON object (PostgreSQL)
```

### Indexes
```sql
CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhookId);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(createdAt);
```

## 🔧 Configuration

### Environment Variables
```bash
# Webhook Configuration
WEBHOOK_DEFAULT_TIMEOUT=10000      # 10 seconds
WEBHOOK_DEFAULT_RETRIES=3
WEBHOOK_DEFAULT_RETRY_DELAY=1000   # 1 second
WEBHOOK_MAX_RETRY_DELAY=30000      # 30 seconds
```

### Webhook Configuration Object
```typescript
interface WebhookConfig {
  url: string;
  timeout?: number;        // milliseconds
  retries?: number;        // max retry attempts
  retryDelay?: number;     // base delay in milliseconds
  headers?: Record<string, string>;
  secret?: string;         // for HMAC signature
}
```

## 🚀 Usage Examples

### 1. Create Webhook Notification
```typescript
await NotificationService.createNotification({
  type: 'WEBHOOK',
  event: 'CERTIFICATE_EXPIRY',
  recipient: 'https://api.example.com/webhook',
  webhookConfig: {
    timeout: 10000,
    retries: 3,
    secret: 'your-webhook-secret'
  }
});
```

### 2. Test Webhook Endpoint
```bash
curl -X POST http://localhost:3000/api/notifications/test-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.example.com/webhook",
    "config": {
      "timeout": 5000,
      "retries": 2,
      "secret": "test-secret"
    }
  }'
```

### 3. Monitor Webhook Deliveries
```bash
curl http://localhost:3000/api/notifications/webhook-deliveries?status=failed
```

### 4. Retry Failed Delivery
```bash
curl -X POST http://localhost:3000/api/notifications/webhook-deliveries \
  -H "Content-Type: application/json" \
  -d '{"deliveryId": "webhook_delivery_id"}'
```

## 🔒 Security Features

### Webhook Signatures
Webhooks include HMAC-SHA256 signatures for verification:

```typescript
// Headers included in webhook requests
{
  'Content-Type': 'application/json',
  'User-Agent': 'Enterprise-CA-Webhook/1.0',
  'X-Webhook-Event': 'CERTIFICATE_EXPIRY',
  'X-Webhook-Timestamp': '1703123456789',
  'X-Webhook-Signature': 'sha256=abc123...'  // HMAC signature
}
```

### Signature Verification
```typescript
// On the receiving end
const signature = request.headers['x-webhook-signature'];
const expectedSignature = crypto
  .createHmac('sha256', secret)
  .update(request.body)
  .digest('hex');

if (signature !== `sha256=${expectedSignature}`) {
  throw new Error('Invalid webhook signature');
}
```

## 📈 Monitoring & Analytics

### Delivery Status Tracking
- **pending**: Initial delivery attempt
- **sent**: Successfully delivered
- **failed**: All retries exhausted
- **retrying**: Currently retrying

### Performance Metrics
- Response times
- Retry counts
- Success/failure rates
- Error categorization

### Webhook Payload Structure
```json
{
  "event": "CERTIFICATE_EXPIRY",
  "subject": "Certificate Expiring Soon - example.com",
  "message": "Certificate will expire in 30 days",
  "metadata": {
    "certificateId": "cert_123",
    "serialNumber": "ABC123",
    "subjectDN": "CN=example.com",
    "validTo": "2024-01-15T00:00:00Z",
    "daysUntilExpiry": 30
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "id": "webhook_1703123456789_abc123"
}
```

## 🔄 Retry Logic

### Exponential Backoff
```typescript
const delay = Math.min(
  retryDelay * Math.pow(2, attempt), 
  MAX_RETRY_DELAY
);
```

### Retry Conditions
- **Retry**: Network errors, timeouts, 5xx responses, 429 (rate limit)
- **No Retry**: 4xx client errors (except 429), permanent errors

### Retry Limits
- Default: 3 retries
- Configurable per webhook
- Maximum delay: 30 seconds

## 🛠️ Migration Guide

### 1. Update Schema Files
All schema files have been updated:
- `prisma/schema.prisma` (main)
- `prisma/schema.sqlite` (SQLite)
- `prisma/schema.prisma.psql` (PostgreSQL)

### 2. Run Database Migration

#### For SQLite:
```bash
npm run migrate:webhook:sqlite
```

#### For PostgreSQL:
```bash
npm run migrate:webhook:postgresql
```

#### For Development:
```bash
npm run migrate:webhook
```

### 3. Verify Migration
```bash
# Check if tables exist
npm run db:studio

# Or use Prisma CLI
npx prisma db pull
```

## 🧪 Testing

### Unit Tests
```bash
npm test -- --testNamePattern="webhook"
```

### Integration Tests
```bash
# Test webhook endpoint
curl -X POST http://localhost:3000/api/notifications/test-webhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://httpbin.org/post"}'
```

### Manual Testing
1. Create webhook notification setting
2. Trigger certificate expiry event
3. Monitor delivery in database
4. Check webhook delivery API

## 📊 Performance Considerations

### Database Indexes
- `webhookId` for quick lookups
- `status` for filtering
- `createdAt` for time-based queries

### Caching
- Webhook configurations cached in memory
- Delivery status cached for quick access

### Rate Limiting
- Built-in exponential backoff
- Configurable retry delays
- Maximum retry limits

## 🔍 Troubleshooting

### Common Issues

1. **Webhook Timeout**
   - Increase timeout in configuration
   - Check network connectivity
   - Verify endpoint responsiveness

2. **Signature Mismatch**
   - Verify secret configuration
   - Check payload format
   - Ensure consistent encoding

3. **Delivery Failures**
   - Check webhook delivery logs
   - Verify endpoint URL
   - Review error messages

### Debug Commands
```bash
# Check webhook deliveries
curl http://localhost:3000/api/notifications/webhook-deliveries

# Test specific webhook
curl -X POST http://localhost:3000/api/notifications/test-webhook \
  -d '{"url": "your-webhook-url"}'

# View database directly
npm run db:studio
```

## 🚀 Production Deployment

### 1. Environment Setup
```bash
# Copy appropriate environment file
cp env.postgresql .env  # for PostgreSQL
# or
cp env.sqlite .env     # for SQLite

# Update webhook configuration
WEBHOOK_DEFAULT_TIMEOUT=15000
WEBHOOK_DEFAULT_RETRIES=5
WEBHOOK_DEFAULT_RETRY_DELAY=2000
```

### 2. Database Migration
```bash
# Run migration
npm run migrate:webhook:postgresql  # or sqlite

# Verify schema
npx prisma db pull
```

### 3. Monitoring Setup
- Monitor webhook delivery success rates
- Set up alerts for failed deliveries
- Track response times and performance

### 4. Security Configuration
- Use HTTPS endpoints only
- Configure webhook secrets
- Implement signature verification
- Set up proper authentication

## 📚 API Reference

### POST /api/notifications/test-webhook
Test webhook endpoint configuration.

**Request:**
```json
{
  "url": "https://api.example.com/webhook",
  "config": {
    "timeout": 10000,
    "retries": 3,
    "secret": "your-secret"
  }
}
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "responseTime": 150,
  "message": "Webhook test successful"
}
```

### GET /api/notifications/webhook-deliveries
Get webhook delivery history.

**Query Parameters:**
- `status`: Filter by status (pending, sent, failed, retrying)
- `limit`: Number of records (default: 50)
- `offset`: Pagination offset (default: 0)

### POST /api/notifications/webhook-deliveries
Retry failed webhook delivery.

**Request:**
```json
{
  "deliveryId": "webhook_delivery_id"
}
```

## 🎯 Best Practices

1. **URL Validation**: Always validate webhook URLs
2. **Timeout Configuration**: Set appropriate timeouts
3. **Retry Strategy**: Use exponential backoff
4. **Security**: Implement signature verification
5. **Monitoring**: Track delivery success rates
6. **Error Handling**: Log and categorize errors
7. **Performance**: Use database indexes
8. **Testing**: Test webhooks before production

---

**Ready for Production**: This implementation provides enterprise-grade webhook delivery with comprehensive monitoring, security, and reliability features.