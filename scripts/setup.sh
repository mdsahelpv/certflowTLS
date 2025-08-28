#!/bin/bash

# Certificate Authority Management System Setup Script
# This script helps you set up the CA Management System on your local machine

set -e

echo "🚀 Setting up Certificate Authority Management System..."
echo "=================================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18.0 or higher."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'.' -f1 | cut -d'v' -f2)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18.0 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi

echo "✅ npm $(npm -v) detected"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create database directory
echo "🗄️ Setting up database..."
mkdir -p db

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "⚙️ Creating environment configuration..."
    cp env.example .env
    echo "✅ Environment file created at .env"
    echo "⚠️  Please edit .env file with your configuration before running the application"
    echo ""
    echo "Required changes:"
    echo "- Generate a strong NEXTAUTH_SECRET"
    echo "- Set a 32-character ENCRYPTION_KEY"
    echo "- Update CA configuration details"
    echo ""
    read -p "Press Enter to continue after editing .env file..."
else
    echo "✅ Environment file already exists"
fi

# Push database schema
echo "🏗️ Setting up database..."
npm run db:push

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration (if not done already)"
echo "2. Run 'npm run dev' to start the development server"
echo "3. Open http://localhost:3000 in your browser"
echo "4. Create an admin account and configure your CA"
echo ""
echo "Available commands:"
echo "- npm run dev          - Start development server"
echo "- npm run build        - Build for production"
echo "- npm run start        - Start production server"
echo "- npm run db:studio    - Open Prisma Studio"
echo "- npm run lint         - Run code linting"
echo ""
echo "Happy certificate managing! 🔐"