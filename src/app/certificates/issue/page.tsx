'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  FileText, 
  Plus, 
  Download, 
  Key,
  CheckCircle,
  AlertCircle,
  Copy,
  RefreshCw,
  Shield,
  Globe,
  User
} from 'lucide-react';
import { CertificateType, KeyAlgorithm } from '@prisma/client';
import forge from 'node-forge';

interface CertificateData {
  certificate: string;
  privateKey?: string;
  serialNumber: string;
  fingerprint: string;
}

interface CertificateResponse {
  certificate: string;
  privateKey?: string;
  serialNumber: string;
  fingerprint: string;
}

export default function IssueCertificatePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [certificateData, setCertificateData] = useState<CertificateData | null>(null);
  const [certificateType, setCertificateType] = useState<CertificateType>(CertificateType.SERVER);
  const [keyAlgorithm, setKeyAlgorithm] = useState<KeyAlgorithm>(KeyAlgorithm.RSA);
  const [sans, setSans] = useState<string[]>(['']);
  const [csrMode, setCsrMode] = useState<'generate' | 'upload'>('generate');
  const [caList, setCaList] = useState<Array<{ id: string; name?: string; subjectDN: string; status: string; validTo?: string }>>([]);
  const [selectedCaId, setSelectedCaId] = useState<string>('');

  // Parsed CSR state (used in upload mode)
  const [csrSubject, setCsrSubject] = useState<{
    C?: string; ST?: string; L?: string; O?: string; OU?: string; CN?: string;
  } | null>(null);
  const [csrSans, setCsrSans] = useState<string[]>([]);
  const [csrError, setCsrError] = useState<string>('');

  // Form fields
  const [formData, setFormData] = useState({
    country: 'US',
    state: 'California',
    locality: 'San Francisco',
    organization: 'My Organization',
    organizationalUnit: 'IT Department',
    commonName: '',
    validityDays: 365,
    keySize: 2048,
    curve: 'P-256',
    externalCsr: '',
    externalPrivateKey: ''
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      const permissions = session.user.permissions;
      if (!permissions.includes('certificate:issue')) {
        router.push('/dashboard');
        return;
      }
    }
    // Load available CAs
    fetch('/api/ca/status').then(async (res) => {
      if (res.ok) {
        const list = await res.json();
        setCaList(list);
        const active = list.find((i: any) => i.status === 'ACTIVE') || list[0];
        if (active) setSelectedCaId(active.id);
      }
    });
  }, [status, router, session]);

  const handleIssueCertificate = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const subjectDN = csrMode === 'upload' && csrSubject
        ? [`C=${csrSubject.C || ''}`, `ST=${csrSubject.ST || ''}`, `L=${csrSubject.L || ''}`, `O=${csrSubject.O || ''}`, `OU=${csrSubject.OU || ''}`, `CN=${csrSubject.CN || ''}`]
            .filter(part => !part.endsWith('='))
            .join(',')
        : `C=${formData.country},ST=${formData.state},L=${formData.locality},O=${formData.organization},OU=${formData.organizationalUnit},CN=${formData.commonName}`;
      
      const requestData: any = {
        subjectDN,
        certificateType,
        keyAlgorithm,
        validityDays: formData.validityDays,
        caId: selectedCaId || undefined,
        sans: (
          csrMode === 'upload'
            ? [...(csrSans || []), ...sans]
            : sans
        ).filter(s => s && s.trim() !== '')
      };

      if (csrMode === 'generate') {
        if (keyAlgorithm === KeyAlgorithm.RSA) {
          requestData.keySize = formData.keySize;
        } else if (keyAlgorithm === KeyAlgorithm.ECDSA) {
          requestData.curve = formData.curve;
        }
      } else {
        if (!formData.externalCsr) {
          throw new Error('CSR is required for external certificate signing');
        }
        requestData.csr = formData.externalCsr;
        requestData.privateKey = formData.externalPrivateKey;
      }

      const response = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to issue certificate');
      }

      const data: CertificateResponse = await response.json();
      setCertificateData(data);
      setSuccess('Certificate issued successfully!');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to issue certificate');
    } finally {
      setIsLoading(false);
    }
  };

  // Parse CSR and populate subject + algorithm + existing SANs
  const parseCsr = (pem: string) => {
    try {
      setCsrError('');
      const csr = forge.pki.certificationRequestFromPem(pem);
      if (!csr.verify()) {
        throw new Error('Invalid CSR signature');
      }
      const parts: Record<string, string> = {};
      for (const attr of csr.subject.attributes) {
        if (attr.name === 'countryName') parts.C = attr.value;
        if (attr.name === 'stateOrProvinceName') parts.ST = attr.value;
        if (attr.name === 'localityName') parts.L = attr.value;
        if (attr.name === 'organizationName') parts.O = attr.value;
        if (attr.name === 'organizationalUnitName') parts.OU = attr.value;
        if (attr.name === 'commonName') parts.CN = attr.value;
      }
      setCsrSubject(parts);

      // Detect algorithm from public key shape
      const pub: any = csr.publicKey;
      if (pub.n && pub.e) {
        setKeyAlgorithm(KeyAlgorithm.RSA);
      } else {
        setKeyAlgorithm(KeyAlgorithm.ECDSA);
      }

      // Extract SANs if present
      let existingSans: string[] = [];
      const extReq = csr.getAttribute({ name: 'extensionRequest' });
      if (extReq && extReq.extensions) {
        const sanExt = extReq.extensions.find((e: any) => e.name === 'subjectAltName');
        if (sanExt && Array.isArray(sanExt.altNames)) {
          existingSans = sanExt.altNames
            .filter((n: any) => n && (n.type === 2 || n.type === 'DNS'))
            .map((n: any) => n.value);
        }
      }
      setCsrSans(existingSans);
    } catch (err) {
      setCsrSubject(null);
      setCsrSans([]);
      setCsrError(err instanceof Error ? err.message : 'Failed to parse CSR');
    }
  };

  const addSan = () => {
    setSans([...sans, '']);
  };

  const updateSan = (index: number, value: string) => {
    const newSans = [...sans];
    newSans[index] = value;
    setSans(newSans);
  };

  const removeSan = (index: number) => {
    setSans(sans.filter((_, i) => i !== index));
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const downloadCertificate = () => {
    if (!certificateData) return;
    
    const blob = new Blob([certificateData.certificate], { type: 'application/x-x509-ca-cert' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certificate-${certificateData.serialNumber}.crt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPrivateKey = () => {
    if (!certificateData?.privateKey) return;
    
    const blob = new Blob([certificateData.privateKey], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `private-${certificateData.serialNumber}.key`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Issue Certificate
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Create and sign new certificates
          </p>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {!certificateData ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Certificate Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure the certificate details and cryptographic settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Select CA */}
                  <div className="space-y-2">
                    <Label>Issuing CA</Label>
                    <Select value={selectedCaId} onValueChange={(value) => setSelectedCaId(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select CA" />
                      </SelectTrigger>
                      <SelectContent>
                        {caList.map(ca => (
                          <SelectItem key={ca.id} value={ca.id}>
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{ca.name || ca.subjectDN}</span>
                              <span className="text-xs text-gray-500">{ca.status}{ca.validTo ? ` · exp ${new Date(ca.validTo).toLocaleDateString()}` : ''}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Certificate Type */}
                  <div className="space-y-2">
                    <Label>Certificate Type</Label>
                    <Select 
                      value={certificateType} 
                      onValueChange={(value: CertificateType) => setCertificateType(value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CertificateType.SERVER}>
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            Server Certificate
                          </div>
                        </SelectItem>
                        <SelectItem value={CertificateType.CLIENT}>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Client Certificate
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* CSR Mode */}
                  <div className="space-y-2">
                    <Label>CSR Mode</Label>
                    <Tabs value={csrMode} onValueChange={(value) => setCsrMode(value as 'generate' | 'upload')}>
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="generate">Generate CSR</TabsTrigger>
                        <TabsTrigger value="upload">Upload CSR</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="generate" className="space-y-4">
                        <div>
                          <Label>Key Algorithm</Label>
                          <Select 
                            value={keyAlgorithm} 
                            onValueChange={(value: KeyAlgorithm) => setKeyAlgorithm(value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={KeyAlgorithm.RSA}>RSA</SelectItem>
                              <SelectItem value={KeyAlgorithm.ECDSA}>ECDSA</SelectItem>
                              <SelectItem value={KeyAlgorithm.Ed25519}>Ed25519</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {keyAlgorithm === KeyAlgorithm.RSA && (
                          <div>
                            <Label>Key Size</Label>
                            <Select 
                              value={formData.keySize.toString()} 
                              onValueChange={(value) => setFormData(prev => ({ ...prev, keySize: parseInt(value) }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="2048">2048 bits</SelectItem>
                                <SelectItem value="3072">3072 bits</SelectItem>
                                <SelectItem value="4096">4096 bits</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {keyAlgorithm === KeyAlgorithm.ECDSA && (
                          <div>
                            <Label>Curve</Label>
                            <Select 
                              value={formData.curve} 
                              onValueChange={(value) => setFormData(prev => ({ ...prev, curve: value }))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="P-256">P-256</SelectItem>
                                <SelectItem value="P-384">P-384</SelectItem>
                                <SelectItem value="P-521">P-521</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </TabsContent>

                      <TabsContent value="upload" className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="externalCsr">Certificate Signing Request (CSR)</Label>
                        <Textarea
                          id="externalCsr"
                          value={formData.externalCsr}
                          onChange={(e) => {
                            const pem = e.target.value;
                            setFormData(prev => ({ ...prev, externalCsr: pem }));
                            if (pem && pem.includes('BEGIN CERTIFICATE REQUEST')) {
                              parseCsr(pem);
                            } else {
                              setCsrSubject(null);
                              setCsrSans([]);
                            }
                          }}
                          placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;...&#10;-----END CERTIFICATE REQUEST-----"
                          rows={8}
                          className="font-mono text-xs"
                        />
                        {csrError && (
                          <p className="text-sm text-red-600">{csrError}</p>
                        )}
                      </div>
                        
                      <div className="space-y-2">
                        <Label htmlFor="externalPrivateKey">Private Key (Optional - for storage)</Label>
                        <Textarea
                          id="externalPrivateKey"
                          value={formData.externalPrivateKey}
                          onChange={(e) => setFormData(prev => ({ ...prev, externalPrivateKey: e.target.value }))}
                          placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                          rows={8}
                          className="font-mono text-xs"
                        />
                      </div>

                      {/* Readonly Subject from CSR */}
                      {csrSubject && (
                        <div className="space-y-2">
                          <Label>Subject (from CSR)</Label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <Input value={csrSubject.C || ''} readOnly placeholder="C" />
                            <Input value={csrSubject.ST || ''} readOnly placeholder="ST" />
                            <Input value={csrSubject.L || ''} readOnly placeholder="L" />
                            <Input value={csrSubject.O || ''} readOnly placeholder="O" />
                            <Input value={csrSubject.OU || ''} readOnly placeholder="OU" />
                            <Input value={csrSubject.CN || ''} readOnly placeholder="CN" />
                          </div>
                        </div>
                      )}

                      {/* Existing SANs from CSR (read-only) */}
                      {csrSans.length > 0 && (
                        <div className="space-y-2">
                          <Label>Existing SANs (from CSR)</Label>
                          <div className="flex flex-wrap gap-2">
                            {csrSans.map((s, i) => (
                              <Badge key={`${s}-${i}`} variant="outline">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      </TabsContent>
                    </Tabs>
                  </div>

                  {/* Subject DN (hidden/readonly in upload mode) */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium">Subject Distinguished Name</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="country">Country (C)</Label>
                        <Input
                          id="country"
                          value={csrMode === 'upload' ? (csrSubject?.C || '') : formData.country}
                          onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                          readOnly={csrMode === 'upload'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State/Province (ST)</Label>
                        <Input
                          id="state"
                          value={csrMode === 'upload' ? (csrSubject?.ST || '') : formData.state}
                          onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                          readOnly={csrMode === 'upload'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="locality">Locality (L)</Label>
                        <Input
                          id="locality"
                          value={csrMode === 'upload' ? (csrSubject?.L || '') : formData.locality}
                          onChange={(e) => setFormData(prev => ({ ...prev, locality: e.target.value }))}
                          readOnly={csrMode === 'upload'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="organization">Organization (O)</Label>
                        <Input
                          id="organization"
                          value={csrMode === 'upload' ? (csrSubject?.O || '') : formData.organization}
                          onChange={(e) => setFormData(prev => ({ ...prev, organization: e.target.value }))}
                          readOnly={csrMode === 'upload'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="organizationalUnit">Organizational Unit (OU)</Label>
                        <Input
                          id="organizationalUnit"
                          value={csrMode === 'upload' ? (csrSubject?.OU || '') : formData.organizationalUnit}
                          onChange={(e) => setFormData(prev => ({ ...prev, organizationalUnit: e.target.value }))}
                          readOnly={csrMode === 'upload'}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="commonName">Common Name (CN) *</Label>
                        <Input
                          id="commonName"
                          value={csrMode === 'upload' ? (csrSubject?.CN || '') : formData.commonName}
                          onChange={(e) => setFormData(prev => ({ ...prev, commonName: e.target.value }))}
                          placeholder={certificateType === CertificateType.SERVER ? 'example.com' : 'user@example.com'}
                          required
                          readOnly={csrMode === 'upload'}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Subject Alternative Names */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">Subject Alternative Names (SANs)</h3>
                      <Button variant="outline" size="sm" onClick={addSan}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add SAN
                      </Button>
                    </div>
                    {sans.map((san, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          value={san}
                          onChange={(e) => updateSan(index, e.target.value)}
                          placeholder={certificateType === CertificateType.SERVER ? 'www.example.com' : 'user@example.com'}
                        />
                        {sans.length > 1 && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeSan(index)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Validity Period */}
                  <div className="space-y-2">
                    <Label htmlFor="validityDays">Validity Period (days)</Label>
                    <Input
                      id="validityDays"
                      type="number"
                      value={formData.validityDays}
                      onChange={(e) => setFormData(prev => ({ ...prev, validityDays: parseInt(e.target.value) }))}
                      min="1"
                      max="3650"
                    />
                  </div>

                  <Button 
                    onClick={handleIssueCertificate} 
                    disabled={isLoading || !formData.commonName}
                    className="w-full"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Issuing Certificate...
                      </>
                    ) : (
                      <>
                        <Shield className="mr-2 h-4 w-4" />
                        Issue Certificate
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5" />
                    Quick Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Certificate Type</h4>
                    <Badge variant={certificateType === CertificateType.SERVER ? 'default' : 'secondary'}>
                      {certificateType === CertificateType.SERVER ? 'Server' : 'Client'}
                    </Badge>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Key Algorithm</h4>
                    <Badge variant="outline">{keyAlgorithm}</Badge>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">CSR Mode</h4>
                    <Badge variant="outline">{csrMode === 'generate' ? 'Generate' : 'Upload'}</Badge>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">SANs</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {sans.filter(s => s.trim() !== '').length} configured
                    </p>
                  </div>

                  <div>
                    <h4 className="font-medium mb-2">Validity</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formData.validityDays} days
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Certificate Issued Successfully
              </CardTitle>
              <CardDescription>
                Your certificate has been issued and is ready for download
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Serial Number</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyToClipboard(certificateData.serialNumber)}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <Input value={certificateData.serialNumber} readOnly />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Fingerprint</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyToClipboard(certificateData.fingerprint)}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                  <Input value={certificateData.fingerprint} readOnly />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Certificate</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={downloadCertificate}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                </div>
                <Textarea
                  value={certificateData.certificate}
                  readOnly
                  rows={15}
                  className="font-mono text-xs"
                />
              </div>

              {certificateData.privateKey && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Private Key</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={downloadPrivateKey}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                  <Textarea
                    value={certificateData.privateKey}
                    readOnly
                    rows={15}
                    className="font-mono text-xs"
                  />
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Security Warning:</strong> Keep this private key secure! Do not share it with anyone.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              <div className="flex gap-4">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setCertificateData(null);
                    setFormData({
                      ...formData,
                      commonName: '',
                      externalCsr: '',
                      externalPrivateKey: ''
                    });
                    setSans(['']);
                  }}
                >
                  Issue Another Certificate
                </Button>
                <Button 
                  onClick={() => router.push('/certificates')}
                >
                  View All Certificates
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}