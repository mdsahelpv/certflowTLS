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

## Getting Started

### Development (SQLite, port 4000)
```bash
npm run setup:sqlite
npm install
npm run db:push:sqlite
npm run dev
# App: http://localhost:4000
```

### Production (Docker + PostgreSQL, port 3000)
```bash
cp env.docker .env
docker-compose up --build
# App: http://localhost:3000
```

### Prerequisites
- Node.js 18+
- npm 8+
- Git
- Docker & Docker Compose (for production)

### Environment Configuration
- Edit `.env` (see `env.example`, `env.sqlite`, `env.postgresql`, `env.docker`).
- **Security-critical**:
  - `NEXTAUTH_SECRET`: strong random secret
  - `ENCRYPTION_KEY`: 32 chars (AES-256)
- **Database**:
  - Dev: `DATABASE_URL="file:./db/custom.db"`
  - Prod: PostgreSQL URL (from Docker env)
- **CA fields**: `CA_COUNTRY`, `CA_STATE`, `CA_LOCALITY`, `CA_ORGANIZATION`, `CA_ORGANIZATIONAL_UNIT`, `CA_COMMON_NAME`, `CA_EMAIL`
- **Security**: `BCRYPT_ROUNDS`, `SESSION_MAX_AGE`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`
- **X.509/Revocation**: `CA_PATH_LENGTH_CONSTRAINT`, `POLICY_REQUIRE_EXPLICIT`, `POLICY_INHIBIT_MAPPING`, `CRL_DISTRIBUTION_POINT`, `OCSP_URL`

### Database Modes and Switching
- Default dev mode uses SQLite; production uses PostgreSQL (Docker).
```bash
# SQLite -> PostgreSQL
cp env.postgresql .env
docker-compose up --build

# PostgreSQL -> SQLite
docker-compose down
cp env.sqlite .env
npm run dev
```
Helpful DB commands:
```bash
npm run db:push:sqlite
npm run db:push:postgresql
npm run db:studio:sqlite
npm run db:studio:postgresql
```

## Data Model (Prisma)
- **User**: role, status, lastLogin → relations to `AuditLog`, `Certificate`, `CertificateRevocation`
- **CAConfig**: subjectDN, encrypted privateKey, certificate, csr, status, validity, `crlNumber`, `crlDistributionPoint`, `ocspUrl`
- **Certificate**: serialNumber, subject/issuer, PEM, optional encrypted privateKey/CSR, type, status, algorithm, validity, SANs, fingerprint, `lastValidated`
- **CertificateRevocation**: serialNumber, reason, dates, actor
- **CRL**: crlNumber, PEM, issuedAt/nextUpdate, CA relation
- **AuditLog**: action, user info, description, metadata
- **NotificationSetting** and **NotificationHistory**; **SystemConfig**

## API Overview
- **Auth**: `POST /api/auth/signin`, `POST /api/auth/signout`, `GET /api/auth/session`
- **CA**: `GET /api/ca/status`, `POST /api/ca/initialize`, `POST /api/ca/upload-certificate`, `GET /api/ca/[id]`
- **Certificates**:
  - `GET /api/certificates`
  - `POST /api/certificates/issue`
  - `POST /api/certificates/[serialNumber]/renew`
  - `POST /api/certificates/revoke`
  - `GET /api/certificates/[serialNumber]/export`
  - Validation: `POST /api/certificates/validate`, `POST /api/certificates/validate/batch`, `GET /api/certificates/validate?action=statistics`
  - `GET /api/certificates/stats`
- **CRL**: `GET /api/crl`, `POST /api/crl/generate` (full/delta), `POST /api/crl/validate`, `GET /api/crl/export`, `GET /api/crl/download/[crlNumber]`, `GET /api/crl/status`, `GET /api/crl/revoked`
- **Audit**: `GET /api/audit`, `GET /api/audit/export`
- **Users**: CRUD + password reset/update
- **Notifications**: CRUD + history

## Security Features
- **Auth/RBAC**: NextAuth with roles; session and JWT support
- **Data protection**: AES-256 at-rest encryption, Prisma query safety, input validation/sanitization
- **Headers/Rate limit**: Strict security headers, CSP, rate limiting, origin validation
- **Audit**: Every sensitive operation recorded with metadata

## Certificate Validation Improvements
- Chain validation (RFC 5280 §6.1) with configurable depth
- Signature verification (RFC 5280 §4.1.1.3)
- Expiration checks with days-until-expiry
- Validation Service with DB revocation checks, audit logging, batch ops
- API endpoints for single/batch validation + statistics
- UI page at `/certificates/validate` with real-time results and chain details
- Schema updates: `Certificate.lastValidated`, new audit actions

## X.509 Standards Compliance Enhancements
- Path length constraints for CA certificates (`CA_PATH_LENGTH_CONSTRAINT`)
- Purpose-specific key usage; critical flags for CA extensions
- Policy and name constraints; enhanced Extended Key Usage
- Pre-signing extension validation for compliance

## CRL Implementation Enhancements
- CRL numbering with DB tracking; authority key identifier; distribution points
- Full and delta CRLs with delta indicators and shorter validity
- Required extensions: `cRLNumber`, `authorityKeyIdentifier`, `cRLDistributionPoints`, `issuingDistributionPoint`, `authorityInfoAccess`; delta support
- Validation utilities: extension checks, compliance issues, CRL info extraction
- API: generate (full/delta), validate, statistics; RBAC + audit
- UI: Tabbed CRL page (Overview, Generate, Validate, Revoked) with live stats and downloads

## Commands and Scripts
```bash
# App
npm run dev     # Dev server (port 4000)
npm run build   # Production build
npm run start   # Production server (standalone, port 4000 by default)

# Docker
docker-compose up --build
docker-compose up -d --build
docker-compose down
docker-compose logs -f

# Testing
npm test
npm run test:coverage

# Lint/Format
npm run lint
npm run format
```

## Troubleshooting
```bash
# Port in use
lsof -ti:3000 | xargs kill -9
# or for dev port
lsof -ti:4000 | xargs kill -9

# DB issues (SQLite)
rm -f db/custom.db && npm run db:push

# Build issues
rm -rf .next && npm run build

# Docker rebuild
docker system prune -a
docker-compose build --no-cache

# Permissions
chmod +x scripts/init-db.sh
chmod 600 .env
```

## First-Time Use Flow
1. Create admin account → `/auth/signin` → “Create Account”
2. Configure CA → `/ca/setup` → generate CSR → sign with root CA → upload
3. Use the system: `/certificates/issue`, `/certificates`, `/crl`, `/audit`, `/users`

## Important Security Notes
- Rotate and harden `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, DB passwords
- Restrict DB access; enable TLS in production; backup regularly
- Never commit `.env`; use environment-specific secrets; consider a secret manager

## Project Structure
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

## License
This project is licensed under the MIT License. See the `LICENSE` file for details.

## Contributing
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support
- Create an issue in the repository
- Review the troubleshooting section above
