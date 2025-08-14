# Certificate Authority Management System

A comprehensive enterprise-grade Certificate Authority (CA) management solution with full PKI capabilities, audit logging, and role-based access control. Built with Next.js 15, TypeScript, and modern web technologies.

## 🚀 Features

- **Full CA Functionality**: Operate as a subordinate CA server in enterprise networks
- **Certificate Management**: Issue, renew, revoke server and client certificates
- **CRL Management**: Generate and manage Certificate Revocation Lists
- **Audit Logging**: Comprehensive activity tracking with compliance reporting
- **Security**: AES-256 encryption at rest, RBAC, secure authentication
- **User Management**: Role-based access control (Admin, Operator, Viewer)
- **Export Options**: PEM, DER, PKCS#12 export formats
- **Responsive UI**: Modern, mobile-friendly interface
- **Real-time Updates**: WebSocket integration for live notifications
- **Compliance**: Follows NIST and CA/Browser Forum guidelines

## 🛠️ Technology Stack

- **Frontend**: Next.js 15 with App Router, TypeScript
- **Backend**: Next.js API routes, Socket.IO for real-time features
- **Database**: SQLite with Prisma ORM
- **Authentication**: NextAuth.js with custom credentials provider
- **UI Components**: shadcn/ui with Tailwind CSS
- **Security**: AES-256 encryption, comprehensive security headers
- **Icons**: Lucide React
- **Development**: Nodemon for hot-reload

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js**: Version 18.0 or higher
- **npm**: Version 8.0 or higher (comes with Node.js)
- **Git**: For cloning the repository
- **Code Editor**: VS Code or any preferred editor

## 📦 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd certificate-authority-management
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Next.js and React
- TypeScript and development tools
- Prisma ORM and database client
- Authentication and security libraries
- UI components and styling

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
cp env.example .env
```

Edit the `.env` file with your configuration:

```env
# Database Configuration
DATABASE_URL="file:./db/custom.db"

# Application Configuration
NODE_ENV="development"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-super-secret-key-here"

# Encryption Configuration
ENCRYPTION_KEY="your-32-character-encryption-key-here"

# CA Configuration
CA_COUNTRY="US"
CA_STATE="California"
CA_LOCALITY="San Francisco"
CA_ORGANIZATION="Your Organization"
CA_ORGANIZATIONAL_UNIT="IT Department"
CA_COMMON_NAME="Your CA Common Name"
CA_EMAIL="ca@yourdomain.com"

# Email Configuration (Optional)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"

# Security Configuration
BCRYPT_ROUNDS=12
SESSION_MAX_AGE=86400
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

**Important Security Notes:**
- Generate a strong random secret for `NEXTAUTH_SECRET`
- Use a 32-character key for `ENCRYPTION_KEY`
- In production, use environment-specific values

### 4. Set Up the Database

```bash
# Create database directory if it doesn't exist
mkdir -p db

# Push the schema to the database
npm run db:push

# (Optional) Generate Prisma client
npx prisma generate
```

### 5. Build the Application

```bash
npm run build
```

## 🚀 Running the Application

### Development Mode

For development with hot-reload:

```bash
npm run dev
```

The application will be available at:
- **Main Application**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api/health
- **Socket.IO**: ws://localhost:3000/api/socketio

### Production Mode

For production deployment:

```bash
npm start
```

### Development with Custom Server

The project includes a custom server with Socket.IO integration:

```bash
# Development with custom server
npm run dev:server

# Production with custom server
npm run start:server
```

## 🎯 Initial Setup

### 1. Create Admin Account

1. Open http://localhost:3000 in your browser
2. Click "Get Started" on the landing page
3. Navigate to `/auth/signin`
4. Click "Create Account" and register your first admin user

### 2. Configure Certificate Authority

1. After logging in, navigate to `/ca/setup`
2. Fill in the CA configuration details
3. Generate a Certificate Signing Request (CSR)
4. Have the CSR signed by your root CA
5. Upload the signed certificate

### 3. Start Using the System

- **Issue Certificates**: Go to `/certificates/issue`
- **View Certificates**: Go to `/certificates`
- **Manage CRLs**: Go to `/crl`
- **View Audit Logs**: Go to `/audit`
- **Manage Users**: Go to `/users`

## 🔧 Configuration

### Database Configuration

The application uses SQLite by default. To use a different database:

1. Update the `DATABASE_URL` in `.env`
2. Install the appropriate database driver
3. Update `prisma/schema.prisma` if needed
4. Run `npx prisma db push`

### Security Configuration

Key security settings in `.env`:

- `BCRYPT_ROUNDS`: Password hashing complexity (default: 12)
- `SESSION_MAX_AGE`: Session duration in seconds (default: 86400)
- `RATE_LIMIT_WINDOW_MS`: Rate limiting window (default: 15 minutes)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window (default: 100)

### CA Configuration

Configure your CA settings in `.env`:

- `CA_COUNTRY`: Two-letter country code
- `CA_STATE`: State or province
- `CA_LOCALITY`: City or locality
- `CA_ORGANIZATION`: Organization name
- `CA_ORGANIZATIONAL_UNIT`: Department name
- `CA_COMMON_NAME`: CA common name
- `CA_EMAIL`: CA contact email

## 📊 API Endpoints

### Authentication
- `POST /api/auth/signin` - User login
- `POST /api/auth/signout` - User logout
- `GET /api/auth/session` - Get session info

### CA Management
- `GET /api/ca/status` - Get CA status
- `POST /api/ca/initialize` - Initialize CA
- `POST /api/ca/upload-certificate` - Upload signed certificate

### Certificate Operations
- `GET /api/certificates` - List certificates
- `POST /api/certificates/issue` - Issue certificate
- `POST /api/certificates/[serialNumber]/renew` - Renew certificate
- `POST /api/certificates/revoke` - Revoke certificate
- `GET /api/certificates/[serialNumber]/export` - Export certificate

### CRL Management
- `GET /api/crl` - Get CRL info
- `POST /api/crl/generate` - Generate CRL
- `GET /api/crl/download/[crlNumber]` - Download CRL

### Audit & Monitoring
- `GET /api/audit` - Get audit logs
- `GET /api/health` - Health check

## 🔒 Security Features

### Authentication & Authorization
- Role-based access control (Admin, Operator, Viewer)
- Secure password hashing with bcrypt
- Session management with NextAuth.js
- JWT tokens for API access

### Data Protection
- AES-256 encryption for sensitive data at rest
- Secure input validation and sanitization
- SQL injection prevention with Prisma ORM
- XSS protection with Content Security Policy

### Network Security
- HTTPS enforcement in production
- Comprehensive security headers
- Rate limiting for sensitive operations
- Origin validation for API requests

### Audit & Compliance
- Comprehensive audit logging for all actions
- User activity tracking
- Security event monitoring
- Compliance reporting capabilities

## 🐛 Development

### Project Structure

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

### Available Scripts

```bash
# Development
npm run dev              # Start development server
npm run dev:server       # Start with custom server

# Production
npm run build            # Build for production
npm run start            # Start production server
npm run start:server     # Start production with custom server

# Database
npm run db:push          # Push schema to database
npm run db:studio        # Open Prisma Studio
npx prisma generate      # Generate Prisma client

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier

# Type Checking
npx tsc --noEmit         # Type check without emitting files
```

### Environment-Specific Builds

```bash
# Development build with debugging
NODE_ENV=development npm run build

# Production build with optimizations
NODE_ENV=production npm run build
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Port Already in Use
```bash
# Find process using port 3000
lsof -ti:3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3001 npm run dev
```

#### 2. Database Connection Issues
```bash
# Check if database file exists
ls -la db/

# Recreate database
rm -f db/custom.db
npm run db:push
```

#### 3. NextAuth Configuration Issues
```bash
# Ensure NEXTAUTH_URL and NEXTAUTH_SECRET are set
echo $NEXTAUTH_URL
echo $NEXTAUTH_SECRET

# Regenerate secrets
node -e "console.log(crypto.randomBytes(32).toString('hex'))"
```

#### 4. Build Errors
```bash
# Clean build cache
rm -rf .next
npm run build

# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### 5. Permission Issues
```bash
# Fix file permissions
chmod -R 755 .
chmod 600 .env
```

### Debug Mode

Enable debug logging:

```bash
DEBUG=* npm run dev
```

Or for specific components:

```bash
DEBUG=ca:* npm run dev
```

## 📝 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For support and questions:

- Create an issue in the GitHub repository
- Check the [documentation](docs/)
- Review the [troubleshooting guide](#troubleshooting)

## 🔗 Related Links

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**Note**: This is a development environment. For production deployment, ensure you:
- Use a production database (PostgreSQL, MySQL)
- Set up proper SSL/TLS certificates
- Configure environment-specific settings
- Set up monitoring and logging
- Implement backup and disaster recovery procedures