'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Key, 
  Download, 
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  FileText,
  Calendar,
  Hash,
  Ban,
  Shield,
  Info,
  Clock,
  TrendingUp
} from 'lucide-react';

interface CRL {
  id: string;
  crlNumber: number;
  crlData: string;
  issuedAt: string;
  nextUpdate: string;
  createdAt: string;
}

interface RevokedCertificate {
  id: string;
  serialNumber: string;
  revocationDate: string;
  revocationReason: string;
  certificate: {
    subjectDN: string;
    validTo: string;
  };
  revokedBy: {
    username: string;
    name?: string;
  };
}

interface CRLStatistics {
  totalCRLs: number;
  lastFullCRL?: {
    crlNumber: number;
    issuedAt: string;
    nextUpdate: string;
    revokedCount: number;
  };
  lastDeltaCRL?: {
    crlNumber: number;
    issuedAt: string;
    nextUpdate: string;
    revokedCount: number;
  };
  totalRevokedCertificates: number;
  crlDistributionPoint?: string;
  nextCRLUpdate?: string;
}

interface CRLValidation {
  isValid: boolean;
  issues: string[];
  info: {
    issuer: string;
    thisUpdate: string;
    nextUpdate: string;
    revokedCount: number;
    crlNumber?: number;
    isDeltaCRL: boolean;
    deltaCRLIndicator?: number;
    extensions: string[];
  };
}

export default function CRLPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [crls, setCrls] = useState<CRL[]>([]);
  const [revokedCertificates, setRevokedCertificates] = useState<RevokedCertificate[]>([]);
  const [selectedCRL, setSelectedCRL] = useState<CRL | null>(null);
  const [crlStatistics, setCrlStatistics] = useState<CRLStatistics | null>(null);
  const [crlValidation, setCrlValidation] = useState<CRLValidation | null>(null);
  const [isGeneratingCRL, setIsGeneratingCRL] = useState(false);
  const [isValidatingCRL, setIsValidatingCRL] = useState(false);
  const [crlType, setCrlType] = useState<'full' | 'delta'>('full');
  const [crlPemToValidate, setCrlPemToValidate] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      const permissions = session.user.permissions;
      if (!permissions.includes('crl:manage')) {
        router.push('/dashboard');
        return;
      }
      fetchCRLData();
    }
  }, [status, router, session]);

  const fetchCRLData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [crlResponse, revokedResponse, statsResponse] = await Promise.all([
        fetch('/api/crl'),
        fetch('/api/crl/revoked'),
        fetch('/api/crl/validate')
      ]);

      if (crlResponse.ok) {
        const crlData = await crlResponse.json();
        setCrls(crlData);
        if (crlData.length > 0) {
          setSelectedCRL(crlData[0]); // Select the most recent CRL
        }
      }

      if (revokedResponse.ok) {
        const revokedData = await revokedResponse.json();
        setRevokedCertificates(revokedData);
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setCrlStatistics(statsData.statistics);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch CRL data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCRL = async () => {
    setIsGeneratingCRL(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/crl/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: crlType }),
      });

      if (response.ok) {
        const result = await response.json();
        setSuccess(`${crlType === 'delta' ? 'Delta' : 'Full'} CRL generated successfully!`);
        fetchCRLData(); // Refresh data
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to generate CRL');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate CRL');
    } finally {
      setIsGeneratingCRL(false);
    }
  };

  const handleValidateCRL = async () => {
    if (!crlPemToValidate.trim()) {
      setError('Please enter CRL PEM data to validate');
      return;
    }

    setIsValidatingCRL(true);
    setError('');
    setCrlValidation(null);

    try {
      const response = await fetch('/api/crl/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ crlPem: crlPemToValidate }),
      });

      if (response.ok) {
        const result = await response.json();
        setCrlValidation(result.validation);
        if (result.validation.isValid) {
          setSuccess('CRL validation successful!');
        } else {
          setError('CRL validation failed. Check the issues below.');
        }
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to validate CRL');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to validate CRL');
    } finally {
      setIsValidatingCRL(false);
    }
  };

  const downloadCRL = () => {
    if (!selectedCRL) return;
    
    const blob = new Blob([selectedCRL.crlData], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crl-${selectedCRL.crlNumber}.pem`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getReasonColor = (reason: string) => {
    const colors: Record<string, string> = {
      KEY_COMPROMISE: 'bg-red-500',
      CA_COMPROMISE: 'bg-red-600',
      AFFILIATION_CHANGED: 'bg-blue-500',
      SUPERSEDED: 'bg-yellow-500',
      CESSATION_OF_OPERATION: 'bg-gray-500',
      CERTIFICATE_HOLD: 'bg-orange-500',
      REMOVE_FROM_CRL: 'bg-green-500',
      PRIVILEGE_WITHDRAWN: 'bg-purple-500',
      AA_COMPROMISE: 'bg-red-700',
      UNSPECIFIED: 'bg-gray-400',
    };
    return colors[reason] || 'bg-gray-400';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span>Loading CRL data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Certificate Revocation List (CRL)</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Manage and generate Certificate Revocation Lists for your CA
        </p>
      </div>

      {error && (
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-6 border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">{success}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="generate">Generate CRL</TabsTrigger>
          <TabsTrigger value="validate">Validate CRL</TabsTrigger>
          <TabsTrigger value="revoked">Revoked Certificates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* CRL Statistics */}
          {crlStatistics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total CRLs</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{crlStatistics.totalCRLs}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Revoked Certificates</CardTitle>
                  <Ban className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{crlStatistics.totalRevokedCertificates}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Last Full CRL</CardTitle>
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {crlStatistics.lastFullCRL ? `#${crlStatistics.lastFullCRL.crlNumber}` : 'None'}
                  </div>
                  {crlStatistics.lastFullCRL && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(crlStatistics.lastFullCRL.issuedAt).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Last Delta CRL</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {crlStatistics.lastDeltaCRL ? `#${crlStatistics.lastDeltaCRL.crlNumber}` : 'None'}
                  </div>
                  {crlStatistics.lastDeltaCRL && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(crlStatistics.lastDeltaCRL.issuedAt).toLocaleDateString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* CRL Distribution Point Info */}
          {crlStatistics?.crlDistributionPoint && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  CRL Distribution Point
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">Your CRL is available at:</p>
                <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">
                  {crlStatistics.crlDistributionPoint}
                </code>
              </CardContent>
            </Card>
          )}

          {/* Recent CRLs */}
          <Card>
            <CardHeader>
              <CardTitle>Recent CRLs</CardTitle>
              <CardDescription>Latest generated Certificate Revocation Lists</CardDescription>
            </CardHeader>
            <CardContent>
              {crls.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No CRLs generated yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CRL Number</TableHead>
                      <TableHead>Issued</TableHead>
                      <TableHead>Next Update</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {crls.slice(0, 5).map((crl) => (
                      <TableRow key={crl.id}>
                        <TableCell className="font-mono">#{crl.crlNumber}</TableCell>
                        <TableCell>{new Date(crl.issuedAt).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(crl.nextUpdate).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedCRL(crl)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Selected CRL Details */}
          {selectedCRL && (
            <Card>
              <CardHeader>
                <CardTitle>CRL #{selectedCRL.crlNumber} Details</CardTitle>
                <CardDescription>Certificate Revocation List information and content</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">CRL Number</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      #{selectedCRL.crlNumber}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Issued At</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(selectedCRL.issuedAt)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Next Update</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(selectedCRL.nextUpdate)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Revoked Certificates</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {revokedCertificates.length}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>CRL Content</Label>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={downloadCRL}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                  <Textarea
                    value={selectedCRL.crlData}
                    readOnly
                    rows={10}
                    className="font-mono text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="generate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Generate CRL</CardTitle>
              <CardDescription>
                Generate a new Certificate Revocation List with enhanced X.509 extensions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="crl-type">CRL Type</Label>
                <Select value={crlType} onValueChange={(value: 'full' | 'delta') => setCrlType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full CRL</SelectItem>
                    <SelectItem value="delta">Delta CRL</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {crlType === 'full' 
                    ? 'Full CRL contains all revoked certificates (valid for 24 hours)'
                    : 'Delta CRL contains only new revocations since last full CRL (valid for 6 hours)'
                  }
                </p>
              </div>

              <Button 
                onClick={handleGenerateCRL} 
                disabled={isGeneratingCRL}
                className="w-full"
              >
                {isGeneratingCRL ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Generating {crlType === 'delta' ? 'Delta' : 'Full'} CRL...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Generate {crlType === 'delta' ? 'Delta' : 'Full'} CRL
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Validate CRL</CardTitle>
              <CardDescription>
                Validate CRL extensions and compliance with X.509 standards
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="crl-pem">CRL PEM Data</Label>
                <Textarea
                  id="crl-pem"
                  placeholder="Paste CRL PEM data here..."
                  value={crlPemToValidate}
                  onChange={(e) => setCrlPemToValidate(e.target.value)}
                  rows={8}
                />
              </div>

              <Button 
                onClick={handleValidateCRL} 
                disabled={isValidatingCRL || !crlPemToValidate.trim()}
                className="w-full"
              >
                {isValidatingCRL ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Validating CRL...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Validate CRL
                  </>
                )}
              </Button>

              {/* Validation Results */}
              {crlValidation && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-lg border ${
                    crlValidation.isValid 
                      ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' 
                      : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
                  }`}>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      {crlValidation.isValid ? (
                        <>
                          <CheckCircle className="h-5 w-5 text-green-600" />
                          CRL Validation Successful
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-5 w-5 text-red-600" />
                          CRL Validation Failed
                        </>
                      )}
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <strong>Issuer:</strong> {crlValidation.info.issuer}
                      </div>
                      <div>
                        <strong>Revoked Count:</strong> {crlValidation.info.revokedCount}
                      </div>
                      <div>
                        <strong>This Update:</strong> {new Date(crlValidation.info.thisUpdate).toLocaleString()}
                      </div>
                      <div>
                        <strong>Next Update:</strong> {new Date(crlValidation.info.nextUpdate).toLocaleString()}
                      </div>
                      {crlValidation.info.crlNumber && (
                        <div>
                          <strong>CRL Number:</strong> #{crlValidation.info.crlNumber}
                        </div>
                      )}
                      <div>
                        <strong>Type:</strong> {crlValidation.info.isDeltaCRL ? 'Delta CRL' : 'Full CRL'}
                      </div>
                    </div>

                    {crlValidation.info.extensions.length > 0 && (
                      <div className="mt-3">
                        <strong>Extensions:</strong>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {crlValidation.info.extensions.map((ext, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {ext}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {crlValidation.issues.length > 0 && (
                    <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
                      <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">Issues Found:</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-red-700 dark:text-red-300">
                        {crlValidation.issues.map((issue, index) => (
                          <li key={index}>{issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Revoked Certificates */}
        <TabsContent value="revoked" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5" />
                Revoked Certificates
              </CardTitle>
              <CardDescription>
                List of all revoked certificates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {revokedCertificates.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No certificates have been revoked
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Serial Number</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Revoked By</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revokedCertificates.map((cert) => (
                        <TableRow key={cert.id}>
                          <TableCell className="font-mono text-sm">
                            {cert.serialNumber}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-xs truncate" title={cert.certificate.subjectDN}>
                              {cert.certificate.subjectDN.split(',').find(part => part.startsWith('CN='))?.substring(3) || cert.certificate.subjectDN}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              <div className={`w-2 h-2 rounded-full mr-1 ${getReasonColor(cert.revocationReason)}`} />
                              {cert.revocationReason.replace(/_/g, ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {cert.revokedBy.name || cert.revokedBy.username}
                          </TableCell>
                          <TableCell>
                            {formatDate(cert.revocationDate)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}