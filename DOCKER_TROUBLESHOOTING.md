# Docker Troubleshooting Guide

## 🚨 **Current Issue: Blank Page & No Logs**

If you're experiencing a blank page when accessing `http://localhost:3000` and can't see any logs, follow this troubleshooting guide.

## 🔍 **Quick Diagnosis**

### **Step 1: Check Container Status**
```bash
# Check if containers are running
docker compose ps

# Expected output:
# Name                    Command               State           Ports
# ca-management          sh -c echo '⏳ Waiti ...   Up      0.0.0.0:3000->3000/tcp
# postgres               docker-entrypoint.sh postgres    Up      0.0.0.0:5432->5432/tcp
```

### **Step 2: Check Application Logs**
```bash
# View application logs
docker compose logs ca-management

# View database logs
docker compose logs postgres

# Follow logs in real-time
docker compose logs -f ca-management
```

### **Step 3: Check Health Endpoint**
```bash
# Test if the application is responding
curl http://localhost:3000/api/health

# Expected response:
# {"status":"healthy","checks":{"database":true,"auth":true,"notifications":true}}
```

## 🛠️ **Step-by-Step Solutions**

### **Solution 1: Use Debug Configuration**
```bash
# Stop current containers
docker compose down

# Use debug configuration with verbose logging
docker compose -f docker-compose.debug.yml up --build

# This will show detailed startup information
```

### **Solution 2: Check Logs Directory**
```bash
# Create logs directory if it doesn't exist
mkdir -p logs

# Set proper permissions
chmod 755 logs

# Check if logs are being written
tail -f logs/app.log
```

### **Solution 3: Clean Rebuild**
```bash
# Complete clean rebuild
docker compose down -v
docker system prune -f
docker compose build --no-cache
docker compose up --build
```

### **Solution 4: Use Simple Configuration**
```bash
# Try the simple configuration
docker compose -f docker-compose.simple.yml up --build
```

## 🔧 **Common Issues and Fixes**

### **Issue 1: "Connection refused" on port 3000**
**Symptoms**: Cannot access `http://localhost:3000`
**Solution**:
```bash
# Check if port 3000 is already in use
lsof -ti:3000

# Kill any process using port 3000
lsof -ti:3000 | xargs kill -9

# Restart Docker containers
docker compose restart
```

### **Issue 2: "PostgreSQL is unavailable"**
**Symptoms**: Application stuck waiting for database
**Solution**:
```bash
# Check PostgreSQL logs
docker compose logs postgres

# Restart PostgreSQL container
docker compose restart postgres

# Wait for database to be ready
docker compose logs -f postgres
```

### **Issue 3: "Permission denied" on logs directory**
**Symptoms**: Cannot write to logs directory
**Solution**:
```bash
# Fix permissions
sudo chown -R $USER:$USER logs/
chmod 755 logs/

# Restart containers
docker compose restart
```

### **Issue 4: "Build failed"**
**Symptoms**: Docker build fails
**Solution**:
```bash
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker compose build --no-cache

# Start services
docker compose up
```

### **Issue 5: "No logs visible"**
**Symptoms**: No output in `docker compose logs`
**Solution**:
```bash
# Check if logs directory exists
ls -la logs/

# Create logs directory
mkdir -p logs

# Use debug configuration
docker compose -f docker-compose.debug.yml up --build
```

## 🚀 **Recommended Deployment Steps**

### **For Production (Reliable)**
```bash
# 1. Create logs directory
mkdir -p logs

# 2. Use simple configuration
docker compose -f docker-compose.simple.yml up --build -d

# 3. Check status
docker compose -f docker-compose.simple.yml ps

# 4. View logs
docker compose -f docker-compose.simple.yml logs -f
```

### **For Debugging**
```bash
# 1. Use debug configuration
docker compose -f docker-compose.debug.yml up --build

# 2. Watch logs in real-time
docker compose -f docker-compose.debug.yml logs -f ca-management
```

### **For Development**
```bash
# 1. Use local development
npm run dev

# 2. Access at http://localhost:3000
```

## 📊 **Expected Log Output**

### **Successful Startup**
```
🔍 DEBUG MODE: Starting application...
📁 Current directory: /app
📁 Directory contents: [files listed]
🔧 Environment variables:
  NODE_ENV: production
  PORT: 3000
  DATABASE_URL: postgresql://postgres:ca_management_password_2024@postgres:5432/ca_management
  LOG_LEVEL: debug
⏳ Waiting for PostgreSQL...
✅ PostgreSQL is ready!
🔧 Setting up database...
✅ Database setup complete!
🚀 Starting server...
📝 Log level: debug
📝 Log format: text
📝 Log file: /app/logs/app.log
🚀 Starting server in production mode
📡 Server will listen on port 3000
📦 Preparing Next.js app...
🔧 Initializing system services...
✅ Server ready on http://0.0.0.0:3000
🔌 Socket.IO server running at ws://0.0.0.0:3000/api/socketio
🌍 Environment: production
🗄️  Database URL: Configured
```

### **Health Check Response**
```json
{
  "status": "healthy",
  "checks": {
    "database": true,
    "auth": true,
    "notifications": true
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🔍 **Troubleshooting Script**

Use the automated troubleshooting script:
```bash
# Make script executable
chmod +x docker-troubleshoot.sh

# Run troubleshooting
./docker-troubleshoot.sh
```

## 📋 **Checklist**

Before reporting issues, verify:

- [ ] Docker and Docker Compose are installed
- [ ] Port 3000 is not in use by another service
- [ ] `env.docker` file exists and has correct configuration
- [ ] `logs` directory exists and has proper permissions
- [ ] No firewall blocking port 3000
- [ ] Sufficient disk space available
- [ ] Docker daemon is running

## 🆘 **Still Having Issues?**

If the above solutions don't work:

1. **Check Docker version**: `docker --version && docker compose version`
2. **Check system resources**: `docker system df`
3. **Check Docker daemon**: `docker info`
4. **Try different port**: Change port mapping to `"3001:3000"`
5. **Use host networking**: Add `network_mode: "host"` to service

## 📞 **Support**

- Check logs: `docker compose logs -f`
- Check container status: `docker compose ps`
- Check health endpoint: `curl http://localhost:3000/api/health`
- View log files: `tail -f logs/app.log`

---

**Remember**: The debug configuration (`docker-compose.debug.yml`) provides the most verbose output for troubleshooting!