# Enterprise PKI Setup Guide

## 🚨 CRITICAL: CRL Distribution Points in Certificates

### **Issue Identified and Fixed**

Your application was **NOT including CRL distribution points** in issued certificates, which is **NOT production-ready** for enterprise PKI. This has been **FIXED** in the latest update.

### **What Was Wrong**

1. **CRL Distribution Points Extension** was commented out in certificate generation
2. **Authority Information Access Extension** was commented out
3. **Certificate Policies Extension** was commented out
4. Certificates were missing critical revocation checking information

### **What's Now Fixed**

✅ **CRL Distribution Points** are now included in all certificates  
✅ **Authority Information Access** (OCSP + CA Issuers) is now included  
✅ **Certificate Policies** are now included for enterprise compliance  
✅ **Proper revocation reason codes** are specified  

---

## 🏢 Enterprise PKI Configuration

### **Required Environment Variables**

```bash
# CRITICAL: CRL Distribution Point URL
CRL_DISTRIBUTION_POINT="https://yourdomain.com/api/crl/download/latest"

# CRITICAL: OCSP Responder URL  
OCSP_URL="https://yourdomain.com/api/ocsp"

# CRL Publication Endpoints (High Availability)
CRL_PUBLICATION_ENDPOINTS="https://cdn.yourdomain.com/crl/latest,https://backup.yourdomain.com/crl/latest"

# CRL Update Schedule
CRL_UPDATE_INTERVAL_HOURS=24
CRL_RUN_ON_STARTUP=true
```

### **Enterprise Certificate Extensions**

All certificates now include these **required extensions**:

#### **1. CRL Distribution Points**
```x509
X509v3 CRL Distribution Points:
    URI:https://yourdomain.com/api/crl/download/latest
```

#### **2. Authority Information Access**
```x509
X509v3 Authority Information Access:
    OCSP - URI:https://yourdomain.com/api/ocsp
    CA Issuers - URI:https://yourdomain.com/api/ca
```

#### **3. Certificate Policies**
```x509
X509v3 Certificate Policies:
    Policy: 2.5.29.32.0 (Any Policy)
    Policy: 1.3.6.1.4.1.311.21.10 (Enterprise Policy)
    Policy: 1.3.6.1.5.5.7.2.1 (CPS Qualifier)
```

---

## 🌐 Production URL Configuration

### **Domain Setup**

Your CRL and OCSP URLs must be **publicly accessible**:

```bash
# Primary Domain
https://yourdomain.com/api/crl/download/latest
https://yourdomain.com/api/ocsp

# High Availability (CDN/Backup)
https://cdn.yourdomain.com/crl/latest
https://backup.yourdomain.com/crl/latest
```

### **SSL/TLS Requirements**

- **HTTPS only** (no HTTP)
- **Valid SSL certificate** for your domain
- **Proper DNS resolution**
- **Load balancer configuration** (if using HA)

---

## 🔧 Implementation Details

### **Certificate Generation Process**

```typescript
// Now includes CRL distribution points
const certificate = X509Utils.signCertificateFromCSR(
  csr,
  caCert,
  caPrivateKey,
  serialNumber,
  validityDays,
  isCA,
  sans,
  {
    // CRL and OCSP URLs (NOW INCLUDED)
    crlDistributionPointUrl: caConfig.crlDistributionPoint,
    ocspUrl: caConfig.ocspUrl,
    
    // Certificate Policies (NOW INCLUDED)
    certificatePolicies: this.getDefaultCertificatePolicies(),
    
    // CA-specific settings
    pathLenConstraint: parseInt(process.env.CA_PATH_LENGTH_CONSTRAINT || '0')
  }
);
```

### **CRL Generation with Extensions**

```typescript
// CRL includes proper extensions
const crl = CRLUtils.generateCRL(
  revokedCertificates,
  caConfig.subjectDN,
  caPrivateKey,
  nextUpdate,
  {
    crlNumber: caConfig.crlNumber + 1,
    caCertificatePem: caConfig.certificate,
    crlDistributionPoint: caConfig.crlDistributionPoint,
    authorityInfoAccess: caConfig.ocspUrl,
  }
);
```

---

## 🧪 Testing Your Setup

### **1. Verify Certificate Extensions**

```bash
# Check if CRL distribution points are included
openssl x509 -in certificate.pem -text -noout | grep -A 5 "CRL Distribution Points"

# Check if Authority Information Access is included
openssl x509 -in certificate.pem -text -noout | grep -A 5 "Authority Information Access"
```

### **2. Test CRL Download**

```bash
# Test CRL download endpoint
curl -H "Accept: application/x-pkcs7-crl" \
     https://yourdomain.com/api/crl/download/latest

# Should return PEM-formatted CRL
```

### **3. Test OCSP Responder**

```bash
# Test OCSP endpoint
curl -X POST -H "Content-Type: application/ocsp-request" \
     --data-binary @ocsp-request.der \
     https://yourdomain.com/api/ocsp

# Should return OCSP response
```

---

## 🔒 Security Considerations

### **Access Control**

- **CRL endpoints** should be publicly accessible
- **OCSP endpoints** should be publicly accessible
- **Admin endpoints** should be protected by authentication
- **Rate limiting** should be configured

### **Monitoring**

- **CRL generation** should be monitored
- **OCSP response times** should be monitored
- **Certificate expiry** should be monitored
- **Revocation events** should be logged

### **Backup & Recovery**

- **CRL data** should be backed up
- **CA private keys** should be securely backed up
- **Disaster recovery** procedures should be documented

---

## 📋 Compliance Checklist

### **RFC 5280 Compliance**

- ✅ **CRL Distribution Points** extension included
- ✅ **Authority Information Access** extension included
- ✅ **Certificate Policies** extension included
- ✅ **Proper revocation reason codes**
- ✅ **CRL numbering** sequence maintained
- ✅ **CRL extensions** properly formatted

### **Enterprise Requirements**

- ✅ **High availability** CRL publication
- ✅ **Automated CRL generation**
- ✅ **OCSP responder** implementation
- ✅ **Audit logging** for all operations
- ✅ **Role-based access control**
- ✅ **Certificate validation** tools

---

## 🚀 Deployment Steps

### **1. Update Environment Variables**

```bash
# Copy production environment
cp env.docker .env

# Edit .env file with your domain
CRL_DISTRIBUTION_POINT="https://yourdomain.com/api/crl/download/latest"
OCSP_URL="https://yourdomain.com/api/ocsp"
CRL_PUBLICATION_ENDPOINTS="https://cdn.yourdomain.com/crl/latest"
```

### **2. Deploy Application**

```bash
# Build and deploy
docker compose up --build -d

# Verify deployment
curl https://yourdomain.com/api/health
```

### **3. Test Certificate Issuance**

```bash
# Issue a test certificate
# Verify it includes CRL distribution points
openssl x509 -in test-cert.pem -text -noout | grep -A 5 "CRL Distribution Points"
```

### **4. Monitor CRL Generation**

```bash
# Check CRL generation logs
docker compose logs -f ca-management | grep CRL

# Verify CRL is accessible
curl https://yourdomain.com/api/crl/download/latest
```

---

## 📞 Support

If you encounter issues:

1. **Check logs**: `docker compose logs ca-management`
2. **Verify environment**: Ensure all URLs are correct
3. **Test endpoints**: Verify CRL and OCSP URLs are accessible
4. **Check DNS**: Ensure domain resolution is working
5. **Review SSL**: Ensure HTTPS certificates are valid

Your PKI system is now **enterprise-ready** with proper CRL distribution points in all certificates!