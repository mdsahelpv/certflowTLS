'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Shield, RefreshCw, ArrowLeft, Link as LinkIcon } from 'lucide-react';

export default function CAViewPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ca, setCa] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/ca/${id}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to load CA details');
        }
        const data = await res.json();
        setCa(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load CA details');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[300px]">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !ca) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertDescription>{error || 'CA not found'}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button variant="outline" onClick={() => router.push('/ca/setup')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to CA Setup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6" />
          <h1 className="text-2xl font-bold">CA Details</h1>
          <Badge variant={ca.status === 'ACTIVE' ? 'default' : 'secondary'}>{ca.status}</Badge>
        </div>
        <Button variant="outline" onClick={() => router.push('/ca/setup')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Core information about this Certificate Authority</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500">Name</div>
              <div className="font-mono text-sm">{ca.name || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Subject DN</div>
              <div className="font-mono text-sm break-words">{ca.subjectDN}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Validity</div>
              <div className="text-sm">{ca.validFrom ? new Date(ca.validFrom).toLocaleDateString() : '-'} → {ca.validTo ? new Date(ca.validTo).toLocaleDateString() : '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Key Algorithm</div>
              <div className="text-sm">{ca.keyAlgorithm}{ca.keySize ? ` ${ca.keySize}` : ca.curve ? ` ${ca.curve}` : ''}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">CRL Number</div>
              <div className="text-sm">{ca.crlNumber}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">CRL Distribution Point</div>
              <div className="font-mono text-xs break-all">{ca.crlDistributionPoint || '-'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">OCSP URL</div>
              <div className="font-mono text-xs break-all">{ca.ocspUrl || '-'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certificate</CardTitle>
          <CardDescription>Signed CA certificate information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ca.certificateInfo ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-500">Subject CN</div>
                <div className="font-mono text-sm">{ca.certificateInfo.subjectCN || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Issuer CN</div>
                <div className="font-mono text-sm">{ca.certificateInfo.issuerCN || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Self-signed</div>
                <div className="text-sm">{ca.certificateInfo.selfSigned ? 'Yes' : 'No'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Valid From</div>
                <div className="text-sm">{new Date(ca.certificateInfo.notBefore).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Valid To</div>
                <div className="text-sm">{new Date(ca.certificateInfo.notAfter).toLocaleDateString()}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-600">No certificate uploaded yet.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Certificate Chain</CardTitle>
          <CardDescription>Chain entries up to the root (if provided)</CardDescription>
        </CardHeader>
        <CardContent>
          {ca.certificateChainInfo && ca.certificateChainInfo.count > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Subject CN</TableHead>
                  <TableHead>Issuer CN</TableHead>
                  <TableHead>Valid From</TableHead>
                  <TableHead>Valid To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ca.certificateChainInfo.entries.map((e: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{e.subjectCN || '-'}</TableCell>
                    <TableCell className="font-mono text-xs">{e.issuerCN || '-'}</TableCell>
                    <TableCell className="text-xs">{e.notBefore ? new Date(e.notBefore).toLocaleDateString() : '-'}</TableCell>
                    <TableCell className="text-xs">{e.notAfter ? new Date(e.notAfter).toLocaleDateString() : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-gray-600">No certificate chain uploaded.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

