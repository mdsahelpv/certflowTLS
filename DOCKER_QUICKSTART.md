# 🐳 Docker Quick Start Guide

This guide shows you how to run the Certificate Authority Management System with both SQLite (development) and PostgreSQL (production) databases.

## 🚀 Quick Start Options

### **Option 1: Development with SQLite (Local)**
```bash
# Setup SQLite environment
npm run setup:sqlite

# Install dependencies
npm install

# Start development server
npm run dev
```
- **Database**: SQLite (file-based)
- **Port**: 4000
- **Use Case**: Local development, testing

### **Option 2: Production with PostgreSQL (Docker)**
```bash
# Start with Docker Compose
docker-compose up --build
```
- **Database**: PostgreSQL
- **Port**: 3000
- **Use Case**: Production deployment, team development

## 📋 Prerequisites

- **Node.js**: 18.0 or higher
- **Docker**: 20.0 or higher
- **Docker Compose**: 2.0 or higher

## 🔧 Development Setup (SQLite)

### 1. Clone and Setup
```bash
git clone <repository-url>
cd certificate-authority-management

# Setup SQLite environment
npm run setup:sqlite

# Install dependencies
npm install
```

### 2. Configure Environment
Edit `.env` file with your settings:
```env
# Database Configuration
DATABASE_URL="file:./db/custom.db"

# Application Configuration
NODE_ENV="development"
NEXTAUTH_SECRET="your-secret-key"
ENCRYPTION_KEY="your-32-char-key"
```

### 3. Initialize Database
```bash
# Create database and push schema
npm run db:push:sqlite

# (Optional) Open Prisma Studio
npm run db:studio:sqlite
```

### 4. Start Development Server
```bash
npm run dev
```

The application will be available at: **http://localhost:4000**

## 🐳 Production Setup (PostgreSQL + Docker)

### 1. Environment Configuration
```bash
# Copy Docker environment file
cp env.docker .env

# Edit .env with your production values
nano .env
```

**Important**: Change these values in production:
- `NEXTAUTH_SECRET`
- `ENCRYPTION_KEY`
- `POSTGRES_PASSWORD`
- `ADMIN_PASSWORD`

### 2. Start with Docker Compose
```bash
# Build and start services
docker-compose up --build

# Or run in background
docker-compose up -d --build
```

### 3. Access the Application
- **Main App**: http://localhost:3000
- **PostgreSQL**: localhost:5432
- **Default Admin**: admin / admin123

## 🔄 Switching Between Databases

### From SQLite to PostgreSQL
```bash
# Stop development server
# Copy PostgreSQL environment
cp env.postgresql .env

# Start with Docker
docker-compose up --build
```

### From PostgreSQL to SQLite
```bash
# Stop Docker services
docker-compose down

# Copy SQLite environment
cp env.sqlite .env

# Start development server
npm run dev
```

## 📊 Database Management Commands

### SQLite Commands
```bash
# Push schema to SQLite
npm run db:push:sqlite

# Open Prisma Studio for SQLite
npm run db:studio:sqlite

# Reset SQLite database
npm run db:reset
```

### PostgreSQL Commands
```bash
# Push schema to PostgreSQL
npm run db:push:postgresql

# Open Prisma Studio for PostgreSQL
npm run db:studio:postgresql

# Access PostgreSQL directly
docker-compose exec postgres psql -U postgres -d ca_management
```

## 🛠️ Docker Commands

### Service Management
```bash
# Start services
docker-compose up

# Start in background
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Rebuild and start
docker-compose up --build
```

### Database Operations
```bash
# Access PostgreSQL shell
docker-compose exec postgres psql -U postgres -d ca_management

# Backup database
docker-compose exec postgres pg_dump -U postgres ca_management > backup.sql

# Restore database
docker-compose exec -T postgres psql -U postgres -d ca_management < backup.sql
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Check what's using port 3000
lsof -ti:3000

# Kill the process
kill -9 <PID>

# Or use different port
docker-compose up -p 3001:3000
```

#### 2. Database Connection Issues
```bash
# Check PostgreSQL status
docker-compose exec postgres pg_isready -U postgres

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

#### 3. Permission Issues
```bash
# Fix file permissions
chmod +x scripts/init-db.sh
chmod 600 .env
```

#### 4. Build Issues
```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker-compose build --no-cache
```

### Health Checks

The application includes health checks for both services:

- **App Health**: http://localhost:3000/api/health
- **PostgreSQL**: Automatic health check in Docker Compose

## 📁 File Structure

```
├── env.sqlite          # SQLite environment (development)
├── env.postgresql      # PostgreSQL environment (production)
├── env.docker          # Docker environment (production)
├── docker-compose.yml  # Docker services configuration
├── Dockerfile          # Application container
├── scripts/
│   └── init-db.sh     # Database initialization script
└── prisma/
    ├── schema.prisma   # Main schema (PostgreSQL)
    ├── schema.sqlite   # SQLite schema backup
    └── schema.prisma.psql # PostgreSQL schema backup
```

## 🔐 Security Notes

### Production Deployment
1. **Change default passwords** in `env.docker`
2. **Use strong secrets** for `NEXTAUTH_SECRET` and `ENCRYPTION_KEY`
3. **Restrict database access** to application only
4. **Enable SSL/TLS** for production
5. **Regular backups** of PostgreSQL data

### Environment Variables
- Never commit `.env` files to version control
- Use different secrets for each environment
- Rotate secrets regularly
- Use secret management services in production

## 📞 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Docker and PostgreSQL logs
3. Check application health endpoints
4. Create an issue in the repository

---

**Happy deploying! 🚀**