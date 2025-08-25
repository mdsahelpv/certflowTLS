# Environment Files Updated for CRL Distribution Points

## 🔄 **Changes Made to Environment Files**

All environment files have been updated to support the new CRL distribution points feature and enterprise PKI requirements.

---

## 📝 **Updated Files**

### **1. env.docker** ✅
**Changes:**
- ✅ Updated `CRL_DISTRIBUTION_POINT` to use correct API endpoint
- ✅ Updated `OCSP_URL` to use correct API endpoint  
- ✅ Added `CRL_PUBLICATION_ENDPOINTS` for high availability
- ✅ Changed from HTTP to HTTPS for production security

**Before:**
```bash
CRL_DISTRIBUTION_POINT=http://yourdomain.com/crl
OCSP_URL=http://yourdomain.com/ocsp
```

**After:**
```bash
CRL_DISTRIBUTION_POINT=https://yourdomain.com/api/crl/download/latest
OCSP_URL=https://yourdomain.com/api/ocsp
CRL_PUBLICATION_ENDPOINTS=https://cdn.yourdomain.com/crl/latest,https://backup.yourdomain.com/crl/latest
```

### **2. env.sqlite** ✅
**Changes:**
- ✅ Updated `CRL_DISTRIBUTION_POINT` to use correct API endpoint
- ✅ Updated `OCSP_URL` to use correct API endpoint
- ✅ Added `CRL_PUBLICATION_ENDPOINTS` for development

**Before:**
```bash
CRL_DISTRIBUTION_POINT="http://localhost:3000/crl"
OCSP_URL="http://localhost:3000/ocsp"
```

**After:**
```bash
CRL_DISTRIBUTION_POINT="http://localhost:3000/api/crl/download/latest"
OCSP_URL="http://localhost:3000/api/ocsp"
CRL_PUBLICATION_ENDPOINTS=http://localhost:3000/api/crl/download/latest
```

### **3. env.postgresql** ✅
**Changes:**
- ✅ Updated `CRL_DISTRIBUTION_POINT` to use correct API endpoint
- ✅ Updated `OCSP_URL` to use correct API endpoint
- ✅ Added `CRL_PUBLICATION_ENDPOINTS` for high availability
- ✅ Changed from HTTP to HTTPS for production security

**Before:**
```bash
CRL_DISTRIBUTION_POINT="http://yourdomain.com/crl"
OCSP_URL="http://yourdomain.com/ocsp"
```

**After:**
```bash
CRL_DISTRIBUTION_POINT="https://yourdomain.com/api/crl/download/latest"
OCSP_URL="https://yourdomain.com/api/ocsp"
CRL_PUBLICATION_ENDPOINTS=https://cdn.yourdomain.com/crl/latest,https://backup.yourdomain.com/crl/latest
```

### **4. env.example** ✅
**Changes:**
- ✅ Updated `CRL_DISTRIBUTION_POINT` to use correct API endpoint
- ✅ Updated `OCSP_URL` to use correct API endpoint
- ✅ Added `CRL_PUBLICATION_ENDPOINTS` with example values
- ✅ Changed from HTTP to HTTPS for production security

---

## 🔧 **New Environment Variables Added**

### **CRL_PUBLICATION_ENDPOINTS**
- **Purpose**: High availability CRL publication to multiple endpoints
- **Format**: Comma-separated list of HTTPS URLs
- **Example**: `https://cdn.yourdomain.com/crl/latest,https://backup.yourdomain.com/crl/latest`

---

## 🌐 **URL Structure Changes**

### **Before (Incorrect):**
```bash
CRL_DISTRIBUTION_POINT=http://yourdomain.com/crl
OCSP_URL=http://yourdomain.com/ocsp
```

### **After (Correct):**
```bash
CRL_DISTRIBUTION_POINT=https://yourdomain.com/api/crl/download/latest
OCSP_URL=https://yourdomain.com/api/ocsp
```

### **Why the Change?**
1. **Correct API Endpoints**: The URLs now point to the actual API routes
2. **HTTPS Security**: Production URLs use HTTPS instead of HTTP
3. **Proper Path Structure**: Uses the correct `/api/` path structure

---

## 🚀 **Deployment Instructions**

### **For Development:**
```bash
# Copy SQLite environment
cp env.sqlite .env

# Start development server
npm run dev
```

### **For Production (Docker):**
```bash
# Copy Docker environment
cp env.docker .env

# Edit .env with your actual domain
CRL_DISTRIBUTION_POINT="https://yourdomain.com/api/crl/download/latest"
OCSP_URL="https://yourdomain.com/api/ocsp"
CRL_PUBLICATION_ENDPOINTS="https://cdn.yourdomain.com/crl/latest"

# Deploy with Docker
docker compose up --build -d
```

### **For Production (PostgreSQL):**
```bash
# Copy PostgreSQL environment
cp env.postgresql .env

# Edit .env with your actual domain
CRL_DISTRIBUTION_POINT="https://yourdomain.com/api/crl/download/latest"
OCSP_URL="https://yourdomain.com/api/ocsp"
CRL_PUBLICATION_ENDPOINTS="https://cdn.yourdomain.com/crl/latest"

# Start application
npm run start
```

---

## ✅ **Verification Steps**

### **1. Check Environment Variables**
```bash
# Verify CRL distribution point is set
echo $CRL_DISTRIBUTION_POINT

# Verify OCSP URL is set
echo $OCSP_URL

# Verify CRL publication endpoints are set
echo $CRL_PUBLICATION_ENDPOINTS
```

### **2. Test CRL Endpoint**
```bash
# Test CRL download
curl -H "Accept: application/x-pkcs7-crl" \
     http://localhost:3000/api/crl/download/latest

# Should return PEM-formatted CRL
```

### **3. Test OCSP Endpoint**
```bash
# Test OCSP responder
curl -X POST -H "Content-Type: application/ocsp-request" \
     --data-binary @ocsp-request.der \
     http://localhost:3000/api/ocsp

# Should return OCSP response
```

---

## 🔒 **Security Considerations**

### **Production Requirements:**
- ✅ **HTTPS URLs only** (no HTTP)
- ✅ **Valid SSL certificates** for your domain
- ✅ **Proper DNS resolution**
- ✅ **Load balancer configuration** (if using HA)

### **Development:**
- ✅ **HTTP URLs** are acceptable for localhost
- ✅ **No SSL certificate** required for localhost
- ✅ **Simplified setup** for development

---

## 📋 **Checklist**

- ✅ **env.docker** updated with correct URLs
- ✅ **env.sqlite** updated with correct URLs  
- ✅ **env.postgresql** updated with correct URLs
- ✅ **env.example** updated with correct URLs
- ✅ **CRL_PUBLICATION_ENDPOINTS** added to all files
- ✅ **HTTPS URLs** for production environments
- ✅ **HTTP URLs** for development environment
- ✅ **Proper API endpoint paths** used

Your environment files are now **ready for enterprise PKI deployment** with proper CRL distribution points! 🎉