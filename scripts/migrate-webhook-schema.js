#!/usr/bin/env node

/**
 * Migration script to add webhook delivery tracking to existing databases
 * Run this after updating the Prisma schema
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateWebhookSchema() {
  console.log('🔄 Starting webhook schema migration...');

  try {
    // Check if webhook_deliveries table exists
    const tableExists = await prisma.$queryRaw`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='webhook_deliveries'
    `.catch(() => null);

    if (tableExists && tableExists.length > 0) {
      console.log('✅ Webhook deliveries table already exists');
      return;
    }

    // Create webhook_deliveries table
    console.log('📦 Creating webhook_deliveries table...');
    await prisma.$executeRaw`
      CREATE TABLE webhook_deliveries (
        id TEXT PRIMARY KEY NOT NULL,
        webhookId TEXT NOT NULL,
        url TEXT NOT NULL,
        event TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        statusCode INTEGER,
        responseTime INTEGER,
        error TEXT,
        retries INTEGER NOT NULL DEFAULT 0,
        maxRetries INTEGER NOT NULL DEFAULT 3,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sentAt DATETIME,
        nextRetryAt DATETIME,
        FOREIGN KEY (webhookId) REFERENCES notification_settings(id)
      )
    `;

    // Add webhookConfig column to notification_settings if it doesn't exist
    console.log('🔧 Adding webhookConfig column to notification_settings...');
    try {
      await prisma.$executeRaw`
        ALTER TABLE notification_settings 
        ADD COLUMN webhookConfig TEXT
      `;
      console.log('✅ Added webhookConfig column');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('✅ webhookConfig column already exists');
      } else {
        throw error;
      }
    }

    // Create index for better performance
    console.log('📊 Creating indexes...');
    await prisma.$executeRaw`
      CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhookId)
    `;
    await prisma.$executeRaw`
      CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status)
    `;
    await prisma.$executeRaw`
      CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(createdAt)
    `;

    console.log('✅ Webhook schema migration completed successfully!');
    console.log('');
    console.log('📋 Migration Summary:');
    console.log('  - Created webhook_deliveries table');
    console.log('  - Added webhookConfig column to notification_settings');
    console.log('  - Created performance indexes');
    console.log('');
    console.log('🚀 Webhook delivery tracking is now ready to use!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateWebhookSchema();
}

module.exports = { migrateWebhookSchema };