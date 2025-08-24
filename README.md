![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/markrubio18/CER?utm_source=oss&utm_medium=github&utm_campaign=markrubio18%2FCER&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

## Certificate Authority Management System

An enterprise-grade subordinate CA manager to issue, renew, revoke, and export certificates; manage CRLs; audit all actions; send notifications; and provide real-time updates. Built with Next.js 15, TypeScript, Prisma, Tailwind + shadcn/ui, and Socket.IO.

### Core Features
- **CA lifecycle**: Initialize CA, generate CSR, upload signed CA certificate, track validity and status
- **Certificates**: Issue, renew, revoke; export (PEM/DER/PKCS#12); SANs; algorithms (RSA/ECDSA/Ed25519)
- **CRLs**: Generate, validate, download full and delta CRLs with numbering and extensions
- **Audit**: Detailed audit trail for security and compliance
- **RBAC**: Roles (Admin/Operator/Viewer) gate all actions
- **Security**: AES-256 at-rest encryption, bcrypt, strict headers, rate limits, CSP
- **Notifications**: Email/webhook settings and delivery history (expiry, CRL updates, alerts)
- **Real-time**: Socket.IO at `/api/socketio` for live updates

### Tech Stack
- **Frontend**: Next.js App Router, React 19, Tailwind 4, shadcn/ui
- **Backend**: Next.js route handlers, custom server (`server.ts`) + Socket.IO
- **Database**: Prisma with SQLite (dev) and PostgreSQL (prod via Docker)
- **Auth**: NextAuth.js (credentials), sessions + JWT
- **Tooling**: Jest, ESLint, TypeScript, Nodemon/tsx

## 🚀 Quick Start

### **Development Environment** (SQLite + Next.js Dev Server)
```bash
# 1. Install dependencies
npm install

# 2. Setup environment (SQLite)
cp env.sqlite .env

# 3. Initialize database
npm run db:push:sqlite

# 4. Start development server
npm run dev

# 5. Access application
# App: http://localhost:3000
```

### **Production Environment** (Docker + PostgreSQL)
```bash
# 1. Setup environment (PostgreSQL)
cp env.docker .env

# 2. Start with Docker Compose
docker compose up --build

# 3. Access application
# App: http://localhost:3000
```

## 📋 Environment Configuration

### **Prerequisites**
- **Development**: Node.js 18+, npm 8+, Git
- **Production**: Docker & Docker Compose

### **Environment Files**
- `env.sqlite` - Development environment (SQLite database)
- `env.docker` - Production environment (PostgreSQL via Docker)
- `env.example` - Template with all available options

### **Required Environment Variables**
```bash
# Security (CRITICAL - Change these!)
NEXTAUTH_SECRET=your-strong-random-secret-here
ENCRYPTION_KEY=your-32-character-encryption-key

# Database
DATABASE_URL=file:./db/custom.db          # Development (SQLite)
DATABASE_URL=postgresql://...             # Production (PostgreSQL)

# CA Configuration
CA_COUNTRY=US
CA_STATE=California
CA_LOCALITY=San Francisco
CA_ORGANIZATION=Your Organization
CA_ORGANIZATIONAL_UNIT=IT Department
CA_COMMON_NAME=Your CA Name
CA_EMAIL=ca@yourdomain.com

# Security Settings
BCRYPT_ROUNDS=12
SESSION_MAX_AGE=86400
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# X.509/Revocation Settings
CA_PATH_LENGTH_CONSTRAINT=0
POLICY_REQUIRE_EXPLICIT=false
POLICY_INHIBIT_MAPPING=false
CRL_DISTRIBUTION_POINT=http://yourdomain.com/crl
OCSP_URL=http://yourdomain.com/ocsp
```

## 🔄 Environment Switching

### **Development → Production**
```bash
# Stop development server
# Copy production environment
cp env.docker .env

# Start with Docker
docker compose up --build
```

### **Production → Development**
```bash
# Stop Docker containers
docker compose down

# Copy development environment
cp env.sqlite .env

# Start development server
npm run dev
```

## 🛠️ Available Scripts

### **Development Scripts**
```bash
npm run dev              # Next.js dev server (port 3000)
npm run dev:custom       # Custom server with Socket.IO (port 3000)
npm run build           # Production build
npm run start           # Production custom server (port 3000)
npm run start:next      # Production standard server (port 3000)
```

### **Database Scripts**
```bash
npm run db:push:sqlite      # Push schema to SQLite
npm run db:push:postgresql  # Push schema to PostgreSQL
npm run db:studio:sqlite    # Open Prisma Studio (SQLite)
npm run db:studio:postgresql # Open Prisma Studio (PostgreSQL)
```

### **Testing Scripts**
```bash
npm test                 # Run tests
npm run test:coverage    # Run tests with coverage
npm run lint            # Run ESLint
npm run format          # Format code
```

## 🐳 Docker Deployment

### **Standard Deployment** (Custom Server + Socket.IO)
```bash
# Build and start
docker compose up --build

# Run in background
docker compose up -d --build

# View logs
docker compose logs -f

# Stop
docker compose down
```

### **Simple Deployment** (Standard Next.js Server - Recommended)
```bash
# Use simple configuration
docker compose -f docker-compose.simple.yml up --build

# Run in background
docker compose -f docker-compose.simple.yml up -d --build
```

### **Docker Configuration**
- **Port**: 3000 (exposed to host)
- **Database**: PostgreSQL with health checks
- **Environment**: Production mode with optimized settings
- **Health Check**: Available at `/api/health`

## 🔧 Troubleshooting

### **Port Issues**
```bash
# Kill process using port 3000
lsof -ti:3000 | xargs kill -9

# Check what's using the port
netstat -tulpn | grep 3000
```

### **Database Issues**
```bash
# Reset SQLite database
rm -f db/custom.db && npm run db:push:sqlite

# Check PostgreSQL connection
docker compose exec postgres pg_isready -U postgres
```

### **Build Issues**
```bash
# Clean build cache
rm -rf .next && npm run build

# Rebuild Docker images
docker system prune -a
docker compose build --no-cache
```

### **Docker Issues**
```bash
# Check container status
docker compose ps

# View detailed logs
docker compose logs ca-management

# Reset everything
docker compose down -v
docker system prune -f
```

### **Environment Issues**
```bash
# Check environment variables
docker compose exec ca-management env

# Verify .env file
cat .env | grep -E "(DATABASE_URL|NEXTAUTH_SECRET|ENCRYPTION_KEY)"
```

## 📊 Health Checks

### **Application Health**
```bash
# Check if app is running
curl http://localhost:3000/api/health

# Expected response:
{
  "status": "healthy",
  "checks": {
    "database": true,
    "auth": true,
    "notifications": true
  }
}
```

### **Database Health**
```bash
# SQLite
sqlite3 db/custom.db "SELECT 1;"

# PostgreSQL (Docker)
docker compose exec postgres psql -U postgres -d ca_management -c "SELECT 1;"
```

## 🔐 Security Configuration

### **First-Time Setup**
1. **Create Admin Account**: Visit `/auth/signin` → "Create Account"
2. **Configure CA**: Visit `/ca/setup` → Generate CSR → Sign with root CA → Upload
3. **Start Using**: Navigate to `/certificates/issue`, `/certificates`, `/crl`, `/audit`, `/users`

### **Security Best Practices**
- ✅ **Rotate Secrets**: Change `NEXTAUTH_SECRET` and `ENCRYPTION_KEY` in production
- ✅ **Database Security**: Use strong passwords, enable TLS, restrict access
- ✅ **Environment Files**: Never commit `.env` files
- ✅ **Backup Strategy**: Regular database backups
- ✅ **Access Control**: Use RBAC roles (Admin/Operator/Viewer)

## 📁 Project Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes
│   ├── auth/              # Authentication pages
│   ├── ca/                # CA management pages
│   ├── certificates/      # Certificate management pages
│   ├── crl/               # CRL management pages
│   ├── audit/             # Audit log pages
│   ├── users/             # User management pages
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/                # shadcn/ui components
│   └── layout.tsx         # Layout component
├── lib/                   # Utility libraries
│   ├── auth.ts            # Authentication configuration
│   ├── ca.ts              # CA management logic
│   ├── crypto.ts          # Cryptographic utilities
│   ├── db.ts              # Database client
│   ├── security.ts        # Security middleware
│   └── audit.ts           # Audit logging
├── hooks/                 # Custom React hooks
├── middleware.ts          # Request middleware
└── middleware-security.ts # Security middleware
```

## 📚 Additional Resources

### **Documentation**
- `DOCKER_TROUBLESHOOTING.md` - Comprehensive Docker deployment guide
- `test/README.md` - Testing framework documentation

### **Configuration Files**
- `docker-compose.yml` - Standard Docker deployment
- `docker-compose.simple.yml` - Simple Docker deployment (recommended)
- `Dockerfile` - Docker image configuration
- `jest.config.js` - Test configuration
- `tsconfig.json` - TypeScript configuration

## 🤝 Contributing
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support
- Create an issue in the repository
- Review the troubleshooting section above
- Check `DOCKER_TROUBLESHOOTING.md` for Docker-specific issues

## 📄 License
This project is licensed under the MIT License. See the `LICENSE` file for details.
