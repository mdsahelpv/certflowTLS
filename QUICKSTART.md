# Quick Start Guide

## 🚀 5-Minute Setup

### 1. Download and Extract
```bash
# Download the codebase
# Extract the zip file to your desired location
cd certificate-authority-management
```

### 2. Run Setup Script
```bash
# On macOS/Linux
./setup.sh

# On Windows (PowerShell)
npm install
mkdir -p db
cp env.example .env
npm run db:push
```

### 3. Configure Environment
Edit the `.env` file:
```env
NEXTAUTH_SECRET="generate-a-random-secret-here"
ENCRYPTION_KEY="32-character-encryption-key-here"
# Update other settings as needed
```

### 4. Start the Application
```bash
npm run dev
```

### 5. Access the Application
Open http://localhost:3000 in your browser

## 🎯 First-Time Setup

### Create Admin Account
1. Click "Get Started" on the landing page
2. Navigate to `/auth/signin`
3. Click "Create Account"
4. Register your first admin user

### Configure Certificate Authority
1. After logging in, go to `/ca/setup`
2. Fill in CA configuration
3. Generate CSR
4. Get it signed by your root CA
5. Upload the signed certificate

### Start Using the System
- **Issue Certificates**: `/certificates/issue`
- **View Certificates**: `/certificates`
- **Manage CRLs**: `/crl`
- **View Logs**: `/audit`

## 🔧 Common Commands

```bash
# Development
npm run dev              # Start development server
npm run build            # Build for production
npm run start            # Start production server

# Database
npm run db:push          # Update database schema
npm run db:studio        # Open database viewer

# Code Quality
npm run lint             # Check code quality
```

## 🐛 Quick Troubleshooting

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

### Database Issues
```bash
# Reset database
rm -f db/custom.db
npm run db:push
```

### Build Issues
```bash
# Clean build
rm -rf .next
npm run build
```

## 📚 Need Help?

- Check the full [README.md](README.md) for detailed instructions
- Review the [troubleshooting section](README.md#troubleshooting) in README
- Create an issue for technical problems

---

**You're ready to go!** 🎉