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
  Activity, 
  Search, 
  Filter,
  Download,
  RefreshCw,
  Calendar,
  User,
  AlertTriangle,
  FileText,
  Database,
  Shield,
  Key,
  Users
} from 'lucide-react';
import { AuditAction } from '@prisma/client';

interface AuditLog {
  id: string;
  action: AuditAction;
  userId?: string;
  username?: string;
  ipAddress?: string;
  userAgent?: string;
  description: string;
  metadata?: string;
  createdAt: string;
  user?: {
    id: string;
    username: string;
    name?: string;
    email?: string;
  };
}

interface AuditLogsResponse {
  logs: AuditLog[];
  total: number;
}

export default function AuditPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    action: '',
    username: '',
    startDate: '',
    endDate: '',
    page: 1,
    limit: 50
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      const permissions = session.user.permissions;
      if (!permissions.includes('audit:view')) {
        router.push('/dashboard');
        return;
      }
      fetchAuditLogs();
    }
  }, [status, router, session, filters]);

  const fetchAuditLogs = async () => {
    setIsLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value.toString());
      });

      const response = await fetch(`/api/audit?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }

      const data: AuditLogsResponse = await response.json();
      setAuditLogs(data.logs);
      setTotal(data.total);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  const exportAuditLogs = async (format: 'csv' | 'json') => {
    try {
      const params = new URLSearchParams();
      if (filters.action) params.append('action', filters.action);
      if (filters.username) params.append('username', filters.username);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`/api/audit/export?${params}&format=${format}`);
      if (!response.ok) {
        throw new Error('Failed to export audit logs');
      }

      const data = await response.text();
      const blob = new Blob([data], { 
        type: format === 'csv' ? 'text/csv' : 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to export audit logs');
    }
  };

  const getActionIcon = (action: AuditAction) => {
    switch (action) {
      case AuditAction.LOGIN:
      case AuditAction.LOGOUT:
        return <User className="h-4 w-4" />;
      case AuditAction.CA_CSR_GENERATED:
      case AuditAction.CA_CERTIFICATE_UPLOADED:
        return <Shield className="h-4 w-4" />;
      case AuditAction.CERTIFICATE_ISSUED:
      case AuditAction.CERTIFICATE_RENEWED:
        return <Key className="h-4 w-4" />;
      case AuditAction.CERTIFICATE_REVOKED:
        return <AlertTriangle className="h-4 w-4" />;
      case AuditAction.CRL_GENERATED:
        return <Database className="h-4 w-4" />;
      case AuditAction.USER_CREATED:
      case AuditAction.USER_UPDATED:
      case AuditAction.USER_DELETED:
        return <Users className="h-4 w-4" />;
      case AuditAction.EXPORT_PERFORMED:
        return <Download className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActionColor = (action: AuditAction) => {
    switch (action) {
      case AuditAction.LOGIN:
      case AuditAction.LOGOUT:
        return 'bg-blue-500';
      case AuditAction.CA_CSR_GENERATED:
      case AuditAction.CA_CERTIFICATE_UPLOADED:
        return 'bg-purple-500';
      case AuditAction.CERTIFICATE_ISSUED:
      case AuditAction.CERTIFICATE_RENEWED:
        return 'bg-green-500';
      case AuditAction.CERTIFICATE_REVOKED:
        return 'bg-red-500';
      case AuditAction.CRL_GENERATED:
        return 'bg-orange-500';
      case AuditAction.USER_CREATED:
      case AuditAction.USER_UPDATED:
      case AuditAction.USER_DELETED:
        return 'bg-indigo-500';
      case AuditAction.EXPORT_PERFORMED:
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatMetadata = (metadata?: string) => {
    if (!metadata) return '-';
    try {
      const parsed = JSON.parse(metadata);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return metadata;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
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
                Audit Logs
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                System audit trails and activity logs
              </p>
            </div>
            <div className="flex gap-2">
              {permissions.includes('audit:export') && (
                <>
                  <Button variant="outline" onClick={() => exportAuditLogs('csv')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export CSV
                  </Button>
                  <Button variant="outline" onClick={() => exportAuditLogs('json')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Export JSON
                  </Button>
                </>
              )}
            </div>
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
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Select
                  value={filters.action}
                  onValueChange={(value) =>
                    setFilters((prev) => ({ ...prev, action: value === 'ALL' ? '' : value, page: 1 }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Actions</SelectItem>
                    <SelectItem value="LOGIN">Login</SelectItem>
                    <SelectItem value="LOGOUT">Logout</SelectItem>
                    <SelectItem value="CA_CSR_GENERATED">CA CSR Generated</SelectItem>
                    <SelectItem value="CA_CERTIFICATE_UPLOADED">CA Certificate Uploaded</SelectItem>
                    <SelectItem value="CERTIFICATE_ISSUED">Certificate Issued</SelectItem>
                    <SelectItem value="CERTIFICATE_RENEWED">Certificate Renewed</SelectItem>
                    <SelectItem value="CERTIFICATE_REVOKED">Certificate Revoked</SelectItem>
                    <SelectItem value="CRL_GENERATED">CRL Generated</SelectItem>
                    <SelectItem value="USER_CREATED">User Created</SelectItem>
                    <SelectItem value="USER_UPDATED">User Updated</SelectItem>
                    <SelectItem value="USER_DELETED">User Deleted</SelectItem>
                    <SelectItem value="EXPORT_PERFORMED">Export Performed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Username..."
                  value={filters.username}
                  onChange={(e) => setFilters(prev => ({ ...prev, username: e.target.value, page: 1 }))}
                  className="pl-10"
                />
              </div>

              <div>
                <Input
                  type="date"
                  placeholder="Start Date"
                  value={filters.startDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value, page: 1 }))}
                />
              </div>

              <div>
                <Input
                  type="date"
                  placeholder="End Date"
                  value={filters.endDate}
                  onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value, page: 1 }))}
                />
              </div>

              <div className="flex items-end">
                <Button variant="outline" onClick={fetchAuditLogs} className="w-full">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Apply Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Audit Logs ({total})
            </CardTitle>
            <CardDescription>
              System activity and security events
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  No audit logs found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Metadata</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm">
                          {formatDate(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getActionColor(log.action)}`} />
                            {getActionIcon(log.action)}
                            <Badge variant="outline" className="text-xs">
                              {log.action.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {log.user?.name || log.username || log.user?.username || 'System'}
                            </div>
                            {log.user?.email && (
                              <div className="text-sm text-gray-500 dark:text-gray-400">
                                {log.user.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate" title={log.description}>
                            {log.description}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {log.ipAddress || '-'}
                        </TableCell>
                        <TableCell>
                          <details className="cursor-pointer">
                            <summary className="text-sm text-blue-600 hover:text-blue-800">
                              View Metadata
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-x-auto">
                              {formatMetadata(log.metadata)}
                            </pre>
                          </details>
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
                  Showing {((filters.page - 1) * filters.limit) + 1} to {Math.min(filters.page * filters.limit, total)} of {total} audit logs
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
      </div>
    </div>
  );
}