'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Layout from '@/components/layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  Search, 
  Filter,
  Download,
  RefreshCw,
  Ban,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Clock,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { CertificateType, CertificateStatus } from '@prisma/client';
import Link from 'next/link';

interface Certificate {
  id: string;
  serialNumber: string;
  subjectDN: string;
  issuerDN: string;
  type: CertificateType;
  status: CertificateStatus;
  keyAlgorithm: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
  issuedBy?: {
    id: string;
    username: string;
    name?: string;
  };
  revocation?: {
    revocationReason: string;
    revokedBy: {
      username: string;
      name?: string;
    };
  };
}

interface CertificatesResponse {
  certificates: Certificate[];
  total: number;
}

export default function CertificatesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    subjectDN: '',
    page: 1,
    limit: 20
  });

  // Download dialog state
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadSerial, setDownloadSerial] = useState<string>('');
  const [downloadFormat, setDownloadFormat] = useState<'PEM' | 'DER' | 'PKCS12'>('PEM');
  const [includePrivateKey, setIncludePrivateKey] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  // View dialog state
  const [viewOpen, setViewOpen] = useState(false);
  const [viewCert, setViewCert] = useState<Certificate | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      const permissions = session.user.permissions;
      if (!permissions.includes('certificate:view')) {
        router.push('/dashboard');
        return;
      }
      fetchCertificates();
    }
  }, [status, router, session, filters]);

  const fetchCertificates = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });

      const response = await fetch(`/api/certificates?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch certificates');
      }

      const data: CertificatesResponse = await response.json();
      setCertificates(data.certificates);
      setTotal(data.total);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch certificates');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: CertificateStatus) => {
    switch (status) {
      case CertificateStatus.ACTIVE:
        return 'bg-green-500';
      case CertificateStatus.EXPIRED:
        return 'bg-red-500';
      case CertificateStatus.REVOKED:
        return 'bg-orange-500';
      case CertificateStatus.PENDING:
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: CertificateStatus) => {
    switch (status) {
      case CertificateStatus.ACTIVE:
        return <CheckCircle className="h-4 w-4" />;
      case CertificateStatus.EXPIRED:
        return <AlertTriangle className="h-4 w-4" />;
      case CertificateStatus.REVOKED:
        return <Ban className="h-4 w-4" />;
      case CertificateStatus.PENDING:
        return <Clock className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: CertificateType) => {
    switch (type) {
      case CertificateType.SERVER:
        return <FileText className="h-4 w-4" />;
      case CertificateType.CLIENT:
        return <div className="h-4 w-4 rounded-full bg-blue-500" />;
      case CertificateType.CA:
        return <div className="h-4 w-4 rounded-full bg-purple-500" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const isExpiringSoon = (validTo: string) => {
    const validToDate = new Date(validTo);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return validToDate <= thirtyDaysFromNow && validToDate > new Date();
  };

  const handleRevoke = async (serialNumber: string) => {
    if (!confirm('Are you sure you want to revoke this certificate?')) {
      return;
    }

    try {
      const response = await fetch('/api/certificates/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          serialNumber,
          reason: 'UNSPECIFIED'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to revoke certificate');
      }

      await fetchCertificates();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to revoke certificate');
    }
  };

  const handleRenew = async (serialNumber: string) => {
    try {
      const response = await fetch(`/api/certificates/${serialNumber}/renew`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to renew certificate');
      }

      await fetchCertificates();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to renew certificate');
    }
  };

  const openDownloadDialog = (serialNumber: string) => {
    setDownloadSerial(serialNumber);
    setDownloadFormat('PEM');
    setIncludePrivateKey(false);
    setExportPassword('');
    setDownloadOpen(true);
  };

  const openViewDialog = (cert: Certificate) => {
    setViewCert(cert);
    setViewOpen(true);
  };

  const submitDownload = async () => {
    try {
      setError('');
      const body: any = {
        format: downloadFormat,
        includePrivateKey,
      };
      if (downloadFormat === 'PKCS12') {
        body.password = exportPassword || undefined;
      }
      const response = await fetch(`/api/certificates/${downloadSerial}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({} as any));
        throw new Error(data.error || 'Failed to export certificate');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || response.headers.get('content-disposition');
      let filename = `certificate-${downloadSerial}.${downloadFormat.toLowerCase()}`;
      if (disposition) {
        const match = /filename="?([^";]+)"?/i.exec(disposition);
        if (match && match[1]) filename = match[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to export certificate');
    }
  };

  const totalPages = Math.ceil(total / filters.limit);

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
                Certificates
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Manage issued certificates
              </p>
            </div>
            {permissions.includes('certificate:issue') && (
              <Link href="/certificates/issue">
                <Button>
                  <FileText className="mr-2 h-4 w-4" />
                  Issue Certificate
                </Button>
              </Link>
            )}
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Select
                  value={filters.type || 'ALL_TYPES'}
                  onValueChange={(value) =>
                    setFilters(prev => ({ ...prev, type: value === 'ALL_TYPES' ? '' : value, page: 1 }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Certificate Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_TYPES">All Types</SelectItem>
                    <SelectItem value="SERVER">Server</SelectItem>
                    <SelectItem value="CLIENT">Client</SelectItem>
                    <SelectItem value="CA">CA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Select
                  value={filters.status || 'ALL_STATUSES'}
                  onValueChange={(value) =>
                    setFilters(prev => ({ ...prev, status: value === 'ALL_STATUSES' ? '' : value, page: 1 }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_STATUSES">All Statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="EXPIRED">Expired</SelectItem>
                    <SelectItem value="REVOKED">Revoked</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by Subject DN..."
                  value={filters.subjectDN}
                  onChange={(e) => setFilters(prev => ({ ...prev, subjectDN: e.target.value, page: 1 }))}
                  className="pl-10"
                />
              </div>

              <div className="flex items-end">
                <Button variant="outline" onClick={fetchCertificates} className="w-full">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Apply Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Certificates Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Certificates ({total})
            </CardTitle>
            <CardDescription>
              List of all issued certificates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin" />
              </div>
            ) : certificates.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  No certificates found
                </p>
                {permissions.includes('certificate:issue') && (
                  <Link href="/certificates/issue">
                    <Button className="mt-4">
                      Issue Your First Certificate
                    </Button>
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Serial Number</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Valid From</TableHead>
                      <TableHead>Valid To</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {certificates.map((cert) => (
                      <TableRow key={cert.id}>
                        <TableCell className="font-mono text-sm">
                          {cert.serialNumber}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate" title={cert.subjectDN}>
                            {cert.subjectDN.split(',').find(part => part.startsWith('CN='))?.substring(3) || cert.subjectDN}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getTypeIcon(cert.type)}
                            <Badge variant="outline">{cert.type}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor(cert.status)}`} />
                            {getStatusIcon(cert.status)}
                            <span className="capitalize">{cert.status.toLowerCase()}</span>
                            {isExpiringSoon(cert.validTo) && cert.status === CertificateStatus.ACTIVE && (
                              <Badge variant="destructive" className="text-xs">
                                Expiring Soon
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(cert.validFrom)}</TableCell>
                        <TableCell>{formatDate(cert.validTo)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" aria-label="Actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openViewDialog(cert)}>
                                <FileText className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {cert.status === CertificateStatus.ACTIVE && permissions.includes('certificate:renew') && (
                                <DropdownMenuItem onClick={() => handleRenew(cert.serialNumber)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Renew
                                </DropdownMenuItem>
                              )}
                              {cert.status === CertificateStatus.ACTIVE && permissions.includes('certificate:revoke') && (
                                <DropdownMenuItem variant="destructive" onClick={() => handleRevoke(cert.serialNumber)}>
                                  <Ban className="h-4 w-4 mr-2" />
                                  Revoke
                                </DropdownMenuItem>
                              )}
                              {permissions.includes('certificate:export') && (
                                <DropdownMenuItem onClick={() => openDownloadDialog(cert.serialNumber)}>
                                  <Download className="h-4 w-4 mr-2" />
                                  Download
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Showing {((filters.page - 1) * filters.limit) + 1} to {Math.min(filters.page * filters.limit, total)} of {total} certificates
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={filters.page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={filters.page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Download Dialog */}
        <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Download Certificate</DialogTitle>
              <DialogDescription>
                Choose the format and options for downloading the certificate.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Format</Label>
                <Select value={downloadFormat} onValueChange={(v) => setDownloadFormat(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PEM">PEM (.pem)</SelectItem>
                    <SelectItem value="DER">DER (.cer/.der)</SelectItem>
                    <SelectItem value="PKCS12">PKCS12 (.p12)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Include Private Key</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">If available and permitted</p>
                </div>
                <Switch checked={includePrivateKey} onCheckedChange={setIncludePrivateKey} />
              </div>

              {downloadFormat === 'PKCS12' && (
                <div>
                  <Label>Password (optional)</Label>
                  <Input
                    type="password"
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    placeholder="Password to protect .p12 file"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={submitDownload}>
                  Download
                </Button>
                <Button variant="outline" onClick={() => setDownloadOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* View Details Dialog */}
        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Certificate Details</DialogTitle>
              <DialogDescription>
                View key details for this certificate.
              </DialogDescription>
            </DialogHeader>
            {viewCert && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Serial Number</p>
                  <p className="font-mono break-all">{viewCert.serialNumber}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p>{viewCert.type}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Subject DN</p>
                  <p className="break-all">{viewCert.subjectDN}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-muted-foreground">Issuer DN</p>
                  <p className="break-all">{viewCert.issuerDN}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valid From</p>
                  <p>{formatDate(viewCert.validFrom)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Valid To</p>
                  <p>{formatDate(viewCert.validTo)}</p>
                </div>
                {viewCert.issuedBy && (
                  <div>
                    <p className="text-muted-foreground">Issued By</p>
                    <p>{viewCert.issuedBy.name || viewCert.issuedBy.username}</p>
                  </div>
                )}
                {viewCert.revocation && (
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground">Revocation</p>
                    <p className="break-all">
                      Reason: {viewCert.revocation.revocationReason}
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// Download dialog rendered at page root
// (placed just before component close previously; moving here for clarity)
