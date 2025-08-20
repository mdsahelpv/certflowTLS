'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  Download, 
  Upload, 
  FileText, 
  Key,
  CheckCircle,
  AlertCircle,
  Copy,
  RefreshCw,
  Settings
} from 'lucide-react';
import { KeyAlgorithm } from '@prisma/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface CAConfigData {
  name?: string;
  subjectDN: string;
  keyAlgorithm: KeyAlgorithm;
  keySize?: number;
  curve?: string;
}

interface CAResponse {
  caId: string;
  csr: string;
  privateKey: string;
}

export default function CASetupPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState<'config' | 'generate' | 'upload'>('config');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [caResponse, setCaResponse] = useState<CAResponse | null>(null);
  const [existingCAs, setExistingCAs] = useState<Array<{ id: string; name?: string; subjectDN: string; status: string; validFrom?: string; validTo?: string; certificateCount: number }>>([]);
  const [caConfig, setCaConfig] = useState<CAConfigData>({
    name: '',
    subjectDN: '',
    keyAlgorithm: KeyAlgorithm.RSA,
    keySize: 2048,
    curve: 'P-256'
  });
  const [selectedCAId, setSelectedCAId] = useState<string>('');

  // Form fields for DN
  const [dnFields, setDnFields] = useState({
    country: process.env.NEXT_PUBLIC_CA_COUNTRY || 'US',
    state: process.env.NEXT_PUBLIC_CA_STATE || 'California',
    locality: process.env.NEXT_PUBLIC_CA_LOCALITY || 'San Francisco',
    organization: process.env.NEXT_PUBLIC_CA_ORGANIZATION || 'My Organization',
    organizationalUnit: process.env.NEXT_PUBLIC_CA_ORGANIZATIONAL_UNIT || 'IT Department',
    commonName: process.env.NEXT_PUBLIC_CA_COMMON_NAME || 'My CA'
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated' && session?.user.role !== 'ADMIN') {
      router.push('/dashboard');
      return;
    }

    // Update subject DN when form fields change
    const subjectDN = `C=${dnFields.country},ST=${dnFields.state},L=${dnFields.locality},O=${dnFields.organization},OU=${dnFields.organizationalUnit},CN=${dnFields.commonName}`;
    setCaConfig(prev => ({ ...prev, subjectDN }));
    // Load existing CAs
    fetch('/api/ca/status').then(async (res) => {
      if (res.ok) {
        const list = await res.json();
        setExistingCAs(list);
      }
    });
  }, [status, router, session, dnFields]);

  const handleGenerateCSR = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/ca/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(caConfig)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initialize CA');
      }

      const data: CAResponse = await response.json();
      setCaResponse(data);
      setSelectedCAId(data.caId);
      setStep('generate');
      setSuccess('CA CSR generated successfully!');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate CSR');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadCertificate = async (certificate: string) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/ca/upload-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificate,
          caId: selectedCAId || caResponse?.caId,
          certificateChain: (document.getElementById('certificate-chain') as HTMLTextAreaElement)?.value || undefined,
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload certificate');
      }

      setSuccess('CA certificate uploaded successfully!');
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to upload certificate');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const downloadCSR = () => {
    if (!caResponse) return;
    
    const blob = new Blob([caResponse.csr], { type: 'application/pem-certificate-chain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ca-csr-${new Date().toISOString().split('T')[0]}.csr`;
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

  if (!session || session.user.role !== 'ADMIN') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            CA Setup
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Set up the Certificate Authority for your organization
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'config' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
              }`}>
                {step === 'config' ? '1' : <CheckCircle className="h-4 w-4" />}
              </div>
              <span className="ml-2 font-medium">Configuration</span>
            </div>
            <div className="flex-1 h-1 bg-gray-300 dark:bg-gray-600 mx-4"></div>
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'generate' ? 'bg-blue-600 text-white' : 
                step === 'upload' ? 'bg-green-600 text-white' : 'bg-gray-300 dark:bg-gray-600'
              }`}>
                {step === 'generate' ? '2' : step === 'upload' ? <CheckCircle className="h-4 w-4" /> : '2'}
              </div>
              <span className="ml-2 font-medium">Generate CSR</span>
            </div>
            <div className="flex-1 h-1 bg-gray-300 dark:bg-gray-600 mx-4"></div>
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-300 dark:bg-gray-600'
              }`}>
                {step === 'upload' ? '3' : '3'}
              </div>
              <span className="ml-2 font-medium">Upload Certificate</span>
            </div>
          </div>
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

        <Tabs value={step} className="w-full">
          {/* Existing CA list */}
          <div className="mb-8">
            <Card>
              <CardHeader>
                <CardTitle>Existing Certificate Authorities</CardTitle>
                <CardDescription>Overview of configured CAs with status and expiry</CardDescription>
              </CardHeader>
              <CardContent>
                {existingCAs.length === 0 ? (
                  <p className="text-sm text-gray-600 dark:text-gray-400">No CAs configured yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Subject DN</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Valid From</TableHead>
                          <TableHead>Valid To</TableHead>
                          <TableHead>Issued Certs</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {existingCAs.map(ca => (
                          <TableRow key={ca.id}>
                            <TableCell className="text-sm font-medium">{ca.name || '-'}</TableCell>
                            <TableCell className="font-mono text-xs">{ca.subjectDN}</TableCell>
                            <TableCell>
                              <Badge variant={ca.status === 'ACTIVE' ? 'default' : 'secondary'}>{ca.status}</Badge>
                            </TableCell>
                            <TableCell>{ca.validFrom ? new Date(ca.validFrom).toLocaleDateString() : '-'}</TableCell>
                            <TableCell>{ca.validTo ? new Date(ca.validTo).toLocaleDateString() : '-'}</TableCell>
                            <TableCell>{ca.certificateCount}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={async () => {
                                  if (!session || session.user.role !== 'ADMIN') return;
                                  const proceed = window.confirm('This will permanently delete the selected CA and all issued certificates associated with it. This action cannot be undone. Are you sure you want to continue?');
                                  if (!proceed) return;
                                  try {
                                    setIsLoading(true);
                                    setError('');
                                    const res = await fetch(`/api/ca/${ca.id}`, { method: 'DELETE' });
                                    if (!res.ok) {
                                      const data = await res.json().catch(() => ({}));
                                      throw new Error(data.error || 'Failed to delete CA');
                                    }
                                    setSuccess('CA deleted successfully');
                                    // Refresh list
                                    const refreshed = await fetch('/api/ca/status');
                                    if (refreshed.ok) {
                                      const list = await refreshed.json();
                                      setExistingCAs(list);
                                    }
                                  } catch (e: any) {
                                    setError(e?.message || 'Failed to delete CA');
                                  } finally {
                                    setIsLoading(false);
                                  }
                                }}
                                disabled={isLoading}
                              >
                                Delete
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="ml-2"
                                onClick={() => router.push(`/ca/${ca.id}`)}
                              >
                                View
                              </Button>
                              {ca.status === 'INITIALIZING' && (
                                <Button
                                  size="sm"
                                  className="ml-2"
                                  onClick={() => {
                                    setSelectedCAId(ca.id);
                                    setStep('upload');
                                    setSuccess('Ready to upload the signed certificate');
                                    setTimeout(() => setSuccess(''), 1500);
                                  }}
                                >
                                  Upload Signed Certificate
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          <TabsContent value="config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  CA Configuration
                </CardTitle>
                <CardDescription>
                  Configure the distinguished name and cryptographic settings for your Certificate Authority
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="caName">CA Name</Label>
                    <Input
                      id="caName"
                      value={caConfig.name || ''}
                      onChange={(e) => setCaConfig(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Production CA"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country (C)</Label>
                    <Input
                      id="country"
                      value={dnFields.country}
                      onChange={(e) => setDnFields(prev => ({ ...prev, country: e.target.value }))}
                      placeholder="US"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State/Province (ST)</Label>
                    <Input
                      id="state"
                      value={dnFields.state}
                      onChange={(e) => setDnFields(prev => ({ ...prev, state: e.target.value }))}
                      placeholder="California"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="locality">Locality (L)</Label>
                    <Input
                      id="locality"
                      value={dnFields.locality}
                      onChange={(e) => setDnFields(prev => ({ ...prev, locality: e.target.value }))}
                      placeholder="San Francisco"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organization">Organization (O)</Label>
                    <Input
                      id="organization"
                      value={dnFields.organization}
                      onChange={(e) => setDnFields(prev => ({ ...prev, organization: e.target.value }))}
                      placeholder="My Organization"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organizationalUnit">Organizational Unit (OU)</Label>
                    <Input
                      id="organizationalUnit"
                      value={dnFields.organizationalUnit}
                      onChange={(e) => setDnFields(prev => ({ ...prev, organizationalUnit: e.target.value }))}
                      placeholder="IT Department"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="commonName">Common Name (CN)</Label>
                    <Input
                      id="commonName"
                      value={dnFields.commonName}
                      onChange={(e) => setDnFields(prev => ({ ...prev, commonName: e.target.value }))}
                      placeholder="My CA"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Key Algorithm</Label>
                    <Select 
                      value={caConfig.keyAlgorithm} 
                      onValueChange={(value: KeyAlgorithm) => setCaConfig(prev => ({ ...prev, keyAlgorithm: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={KeyAlgorithm.RSA}>RSA</SelectItem>
                        <SelectItem value={KeyAlgorithm.ECDSA}>ECDSA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {caConfig.keyAlgorithm === KeyAlgorithm.RSA && (
                    <div>
                      <Label>Key Size</Label>
                      <Select 
                        value={caConfig.keySize?.toString()} 
                        onValueChange={(value) => setCaConfig(prev => ({ ...prev, keySize: parseInt(value) }))}
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

                  {caConfig.keyAlgorithm === KeyAlgorithm.ECDSA && (
                    <div>
                      <Label>Curve</Label>
                      <Select 
                        value={caConfig.curve} 
                        onValueChange={(value) => setCaConfig(prev => ({ ...prev, curve: value }))}
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
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <Label className="text-sm font-medium">Generated Subject DN:</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-mono mt-1">
                    {caConfig.subjectDN}
                  </p>
                </div>

                <Button 
                  onClick={handleGenerateCSR} 
                  disabled={isLoading || !caConfig.subjectDN}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Generating CSR...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Generate CA CSR
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="generate" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Certificate Signing Request (CSR)
                </CardTitle>
                <CardDescription>
                  Your CA CSR has been generated. Download it and sign it with your root CA, then upload the signed certificate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>CSR Content</Label>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => caResponse && copyToClipboard(caResponse.csr)}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={downloadCSR}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    value={caResponse?.csr || ''}
                    readOnly
                    rows={15}
                    className="font-mono text-xs"
                  />
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Important:</strong> Keep the private key secure! Download the CSR and sign it with your root CA, then return to upload the signed certificate.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setStep('config')}
                  >
                    Back to Configuration
                  </Button>
                  <Button 
                    onClick={() => setStep('upload')}
                    className="flex-1"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Signed Certificate
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Signed CA Certificate
                </CardTitle>
                <CardDescription>
                  Upload the certificate that was signed by your root CA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="certificate">Signed Certificate (PEM format)</Label>
                  <div
                    className="border border-dashed rounded-md p-4 text-center hover:bg-muted/30 transition cursor-pointer"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const el = document.getElementById('certificate') as HTMLTextAreaElement | null;
                        if (el) el.value = text;
                      } catch {
                        setError('Failed to read file');
                      }
                    }}
                    onClick={() => document.getElementById('certificate-file')?.click()}
                  >
                    <p className="text-sm text-muted-foreground">Drag and drop the certificate file here, or click to select</p>
                    <Input id="certificate-file" type="file" accept=".pem,.crt,.cer,.txt,application/x-x509-ca-cert,application/x-pem-file,text/plain" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const el = document.getElementById('certificate') as HTMLTextAreaElement | null;
                        if (el) el.value = text;
                      } catch {
                        setError('Failed to read file');
                      }
                    }} />
                  </div>
                  <Textarea
                    id="certificate"
                    placeholder="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
                    rows={15}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="certificate-chain">Certificate Chain (PEM bundle, optional)</Label>
                  <div
                    className="border border-dashed rounded-md p-4 text-center hover:bg-muted/30 transition cursor-pointer"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const el = document.getElementById('certificate-chain') as HTMLTextAreaElement | null;
                        if (el) el.value = text;
                      } catch {
                        setError('Failed to read chain file');
                      }
                    }}
                    onClick={() => document.getElementById('certificate-chain-file')?.click()}
                  >
                    <p className="text-sm text-muted-foreground">Drag and drop the chain file here, or click to select</p>
                    <Input id="certificate-chain-file" type="file" accept=".pem,.crt,.cer,.txt,application/x-x509-ca-cert,application/x-pem-file,text/plain" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const text = await file.text();
                        const el = document.getElementById('certificate-chain') as HTMLTextAreaElement | null;
                        if (el) el.value = text;
                      } catch {
                        setError('Failed to read chain file');
                      }
                    }} />
                  </div>
                  <Textarea
                    id="certificate-chain"
                    placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                    rows={10}
                    className="font-mono text-xs"
                  />
                </div>

                <div className="flex gap-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setStep('generate')}
                  >
                    Back to CSR
                  </Button>
                  <Button 
                    onClick={() => {
                      const certificate = (document.getElementById('certificate') as HTMLTextAreaElement)?.value;
                      if (certificate) {
                        handleUploadCertificate(certificate);
                      }
                    }}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="mr-2 h-4 w-4" />
                        Complete Setup
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}