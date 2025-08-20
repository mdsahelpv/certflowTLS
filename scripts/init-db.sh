#!/bin/bash

# Database Initialization Script for Docker
# This script initializes the PostgreSQL database and runs Prisma migrations

set -e

echo "🚀 Starting database initialization..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -U $POSTGRES_USER -d $POSTGRES_DB; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done

echo "✅ PostgreSQL is ready!"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Push the database schema
echo "📊 Pushing database schema..."
npx prisma db push

# Run any pending migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

echo "✅ Database initialization complete!"

# Keep the script running to maintain the container
echo "🔄 Database service is running..."
tail -f /dev/null