# 🐳 Docker Troubleshooting Guide

## 🚨 **Blank Page Issue - Solutions**

### **Problem**: Docker Compose shows blank page at http://localhost:3000

### **Quick Fixes (Try in Order):**

#### **1. Check Container Status**
```bash
# Check if containers are running
docker compose ps

# Check container logs
docker compose logs ca-management
docker compose logs postgres
```

#### **2. Use Simple Configuration (Recommended)**
```bash
# Use the simplified Docker Compose file
docker compose -f docker-compose.simple.yml up --build
```

#### **3. Check Health Endpoint**
```bash
# Test if the app is responding
curl http://localhost:3000/api/health
```

#### **4. Check Database Connection**
```bash
# Connect to PostgreSQL container
docker compose exec postgres psql -U postgres -d ca_management
```

## 🔧 **Common Issues & Solutions**

### **Issue 1: Port Mismatch**
**Problem**: Server running on port 4000, Docker expecting 3000
**Solution**: ✅ **FIXED** - Updated server.ts and package.json to use port 3000 for both dev and production

### **Issue 2: Custom Server Not Starting**
**Problem**: Custom server with Socket.IO failing in production
**Solution**: 
```bash
# Use standard Next.js server instead
docker compose -f docker-compose.simple.yml up --build
```

### **Issue 3: Database Connection Issues**
**Problem**: PostgreSQL not ready when app starts
**Solution**: 
```bash
# Check database logs
docker compose logs postgres

# Restart with fresh database
docker compose down -v
docker compose up --build
```

### **Issue 4: Environment Variables**
**Problem**: Missing or incorrect environment variables
**Solution**: Check env.docker file and ensure all required variables are set

## 🛠️ **Debugging Steps**

### **Step 1: Check Container Logs**
```bash
# View real-time logs
docker compose logs -f ca-management

# Check specific service
docker compose logs postgres
```

### **Step 2: Check Container Status**
```bash
# List all containers
docker ps -a

# Check container health
docker compose ps
```

### **Step 3: Test Individual Services**
```bash
# Test PostgreSQL
docker compose exec postgres pg_isready -U postgres

# Test application health
curl http://localhost:3000/api/health
```

### **Step 4: Check Network Connectivity**
```bash
# Check if port is listening
netstat -tulpn | grep 3000

# Test from inside container
docker compose exec ca-management curl http://localhost:3000/api/health
```

## 📋 **Configuration Files**

### **docker-compose.yml** (Custom Server)
- Uses custom server with Socket.IO
- More complex startup process
- May have compatibility issues

### **docker-compose.simple.yml** (Standard Server)
- Uses standard Next.js server
- Simpler and more reliable
- Recommended for production

## 🔍 **Troubleshooting Checklist**

- [ ] Containers are running (`docker compose ps`)
- [ ] No error logs (`docker compose logs`)
- [ ] Health endpoint responds (`curl http://localhost:3000/api/health`)
- [ ] Database is accessible (`docker compose exec postgres psql -U postgres`)
- [ ] Port 3000 is listening (`netstat -tulpn | grep 3000`)
- [ ] Environment variables are set correctly
- [ ] Build completed successfully (`docker compose build`)

## 🚀 **Recommended Deployment**

### **For Production (Reliable)**
```bash
# Use simple configuration
docker compose -f docker-compose.simple.yml up --build -d

# Check status
docker compose -f docker-compose.simple.yml ps

# View logs
docker compose -f docker-compose.simple.yml logs -f
```

### **For Development (With Socket.IO)**
```bash
# Use custom server configuration
docker compose up --build

# Check logs for issues
docker compose logs -f ca-management
```

### **For Local Development**
```bash
# Standard Next.js dev server (port 3000)
npm run dev

# Custom server with Socket.IO (port 3000)
npm run dev:custom
```

## 📊 **Expected Output**

### **Successful Startup Logs**
```
⏳ Waiting for PostgreSQL to be ready...
✅ PostgreSQL is ready!
🔧 Using PostgreSQL schema...
🔧 Generating Prisma client...
📊 Pushing database schema...
✅ Database initialized! Starting application...
🚀 Starting server on port 3000
🚀 Starting server in production mode
📡 Server will listen on port 3000
📦 Preparing Next.js app...
🔧 Initializing system services...
✅ Server ready on http://0.0.0.0:3000
🔌 Socket.IO server running at ws://0.0.0.0:3000/api/socketio
🌍 Environment: production
🗄️  Database URL: Configured
```

### **Health Endpoint Response**
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "auth": true,
    "notifications": true
  },
  "timestamp": "2025-08-24T04:00:00.000Z"
}
```

## 🆘 **Still Having Issues?**

### **1. Reset Everything**
```bash
# Stop and remove everything
docker compose down -v
docker system prune -f

# Rebuild from scratch
docker compose -f docker-compose.simple.yml up --build
```

### **2. Check System Resources**
```bash
# Check Docker resources
docker system df

# Check disk space
df -h

# Check memory usage
free -h
```

### **3. Use Development Mode**
```bash
# Run in development mode locally (port 3000)
npm run dev

# Then access at http://localhost:3000
```

## 📞 **Support**

If you're still experiencing issues:
1. Check the logs: `docker compose logs ca-management`
2. Verify environment: `docker compose exec ca-management env`
3. Test database: `docker compose exec postgres psql -U postgres -d ca_management`
4. Check network: `docker network ls`

---

**Remember**: Both development and production now use port 3000 by default for consistency!