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
import { 
  Key, 
  Download, 
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  FileText,
  Calendar,
  Hash,
  Ban
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

export default function CRLPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [crls, setCrls] = useState<CRL[]>([]);
  const [revokedCertificates, setRevokedCertificates] = useState<RevokedCertificate[]>([]);
  const [selectedCRL, setSelectedCRL] = useState<CRL | null>(null);

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
      const [crlResponse, revokedResponse] = await Promise.all([
        fetch('/api/crl'),
        fetch('/api/crl/revoked')
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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch CRL data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateCRL = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/crl/generate', {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to generate CRL');
      }

      setSuccess('CRL generated successfully!');
      await fetchCRLData();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to generate CRL');
    } finally {
      setIsLoading(false);
    }
  };

  const downloadCRL = () => {
    if (!selectedCRL) return;
    
    const blob = new Blob([selectedCRL.crlData], { type: 'application/x-pkcs7-crl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crl-${selectedCRL.crlNumber}.crl`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
  };

  const getReasonColor = (reason: string) => {
    switch (reason) {
      case 'KEY_COMPROMISE':
      case 'CA_COMPROMISE':
        return 'bg-red-500';
      case 'SUPERSEDED':
      case 'CESSATION_OF_OPERATION':
        return 'bg-yellow-500';
      default:
        return 'bg-orange-500';
    }
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

  const permissions = session.user.permissions;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Certificate Revocation List (CRL)
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Manage certificate revocation and CRL generation
              </p>
            </div>
            {permissions.includes('crl:manage') && (
              <Button onClick={handleGenerateCRL} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Generate CRL
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CRL Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                CRL Management
              </CardTitle>
              <CardDescription>
                Current and historical Certificate Revocation Lists
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {crls.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No CRLs generated yet
                  </p>
                  {permissions.includes('crl:manage') && (
                    <Button className="mt-4" onClick={handleGenerateCRL}>
                      Generate First CRL
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Select CRL Version</Label>
                    <Select 
                      value={selectedCRL?.id || ''} 
                      onValueChange={(value) => {
                        const crl = crls.find(c => c.id === value);
                        setSelectedCRL(crl || null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select CRL version" />
                      </SelectTrigger>
                      <SelectContent>
                        {crls.map((crl) => (
                          <SelectItem key={crl.id} value={crl.id}>
                            CRL #{crl.crlNumber} - {formatDate(crl.issuedAt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCRL && (
                    <div className="space-y-4">
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
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Revoked Certificates */}
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
        </div>

        {/* CRL Distribution Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              CRL Distribution Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">CRL Distribution Point</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                  {process.env.CRL_DISTRIBUTION_POINT || 'http://localhost:3000/api/crl'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Update Interval</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {process.env.CRL_UPDATE_INTERVAL_HOURS || '24'} hours
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Current CRL Number</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  #{crls.length > 0 ? Math.max(...crls.map(c => c.crlNumber)) : 0}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">Total Revoked Certificates</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {revokedCertificates.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}