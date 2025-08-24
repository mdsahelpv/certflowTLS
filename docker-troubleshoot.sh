#!/bin/bash

echo "🔍 Docker Compose Troubleshooting Script"
echo "========================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    echo "Please install Docker first: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not installed or not in PATH"
    echo "Please install Docker Compose first: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "✅ Docker and Docker Compose are available"
echo ""

# Function to check container status
check_container_status() {
    echo "📊 Container Status:"
    docker compose ps
    echo ""
}

# Function to show logs
show_logs() {
    echo "📝 Application Logs:"
    docker compose logs ca-management --tail=50
    echo ""
    
    echo "🗄️  Database Logs:"
    docker compose logs postgres --tail=20
    echo ""
}

# Function to check network connectivity
check_network() {
    echo "🌐 Network Connectivity:"
    echo "Checking if port 3000 is accessible..."
    
    if curl -s http://localhost:3000/api/health > /dev/null; then
        echo "✅ Application is responding on http://localhost:3000"
        curl -s http://localhost:3000/api/health | jq . 2>/dev/null || curl -s http://localhost:3000/api/health
    else
        echo "❌ Application is not responding on http://localhost:3000"
    fi
    echo ""
}

# Function to check environment
check_environment() {
    echo "🔧 Environment Check:"
    echo "Checking if env.docker exists..."
    if [ -f "env.docker" ]; then
        echo "✅ env.docker file exists"
        echo "Checking DATABASE_URL..."
        if grep -q "DATABASE_URL" env.docker; then
            echo "✅ DATABASE_URL is configured"
        else
            echo "❌ DATABASE_URL is missing"
        fi
    else
        echo "❌ env.docker file is missing"
        echo "Please copy env.docker to .env or create it"
    fi
    echo ""
}

# Function to restart services
restart_services() {
    echo "🔄 Restarting Services..."
    docker compose down
    docker compose up --build -d
    echo "✅ Services restarted"
    echo ""
}

# Function to clean and rebuild
clean_rebuild() {
    echo "🧹 Clean Rebuild..."
    docker compose down -v
    docker system prune -f
    docker compose build --no-cache
    docker compose up -d
    echo "✅ Clean rebuild completed"
    echo ""
}

# Function to check logs directory
check_logs() {
    echo "📁 Logs Directory Check:"
    if [ -d "logs" ]; then
        echo "✅ logs directory exists"
        if [ -f "logs/app.log" ]; then
            echo "✅ app.log file exists"
            echo "Last 10 lines of app.log:"
            tail -10 logs/app.log
        else
            echo "⚠️  app.log file does not exist yet"
        fi
    else
        echo "❌ logs directory does not exist"
        echo "Creating logs directory..."
        mkdir -p logs
        echo "✅ logs directory created"
    fi
    echo ""
}

# Main troubleshooting flow
echo "🔍 Starting diagnostics..."
echo ""

# Check environment
check_environment

# Check logs directory
check_logs

# Check if services are running
if docker compose ps | grep -q "Up"; then
    echo "✅ Services are running"
    check_container_status
    show_logs
    check_network
else
    echo "❌ Services are not running"
    echo "Starting services..."
    docker compose up --build -d
    
    echo "Waiting for services to start..."
    sleep 30
    
    check_container_status
    show_logs
    check_network
fi

echo "🔧 Troubleshooting Options:"
echo "1. Show logs: docker compose logs -f"
echo "2. Restart services: docker compose restart"
echo "3. Clean rebuild: docker compose down -v && docker compose up --build"
echo "4. Check health: curl http://localhost:3000/api/health"
echo "5. View logs file: tail -f logs/app.log"
echo ""

echo "🚀 Quick Fix Commands:"
echo "If the application is not working, try these commands in order:"
echo ""
echo "1. Stop and restart:"
echo "   docker compose down"
echo "   docker compose up --build"
echo ""
echo "2. If still not working, clean rebuild:"
echo "   docker compose down -v"
echo "   docker system prune -f"
echo "   docker compose up --build"
echo ""
echo "3. Check logs:"
echo "   docker compose logs -f ca-management"
echo ""
echo "4. Access application:"
echo "   http://localhost:3000"
echo ""

echo "📋 Common Issues and Solutions:"
echo ""
echo "❌ Issue: 'Connection refused' on port 3000"
echo "   Solution: Check if another service is using port 3000"
echo "   Command: lsof -ti:3000 | xargs kill -9"
echo ""
echo "❌ Issue: 'PostgreSQL is unavailable'"
echo "   Solution: Wait for database to start or check PostgreSQL logs"
echo "   Command: docker compose logs postgres"
echo ""
echo "❌ Issue: 'Permission denied' on logs directory"
echo "   Solution: Fix permissions on logs directory"
echo "   Command: sudo chown -R $USER:$USER logs/"
echo ""
echo "❌ Issue: 'Build failed'"
echo "   Solution: Clean Docker cache and rebuild"
echo "   Command: docker system prune -a && docker compose build --no-cache"
echo ""

echo "✅ Troubleshooting complete!"