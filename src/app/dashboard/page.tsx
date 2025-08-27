'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { 
  Shield, 
  FileText, 
  Users, 
  Activity, 
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Settings,
  Key,
  Ban,
  Bell,
  TrendingUp,
  Server,
  Globe,
  User
} from 'lucide-react';
import Link from 'next/link';
interface CAItem {
  id: string;
  status: string;
  name?: string;
  subjectDN: string;
  validFrom?: string;
  validTo?: string;
  certificateCount: number;
}
type CAStatus = CAItem | null;

interface DashboardStats {
  totalCertificates: number;
  activeCertificates: number;
  expiredCertificates: number;
  revokedCertificates: number;
  expiringSoon: number;
}

interface RecentActivity {
  id: string;
  action: string;
  description: string;
  username: string;
  createdAt: string;
}

interface SystemHealth {
  status: 'healthy' | 'warning' | 'error';
  message: string;
  checks: {
    name: string;
    status: 'healthy' | 'warning' | 'error';
    message: string;
  }[];
}


export default function DashboardPage() {
  const router = useRouter();
  const { session, isAuthenticated, isLoading } = useAuth('/auth/signin');
  const [caStatus, setCaStatus] = useState<CAStatus>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [isCreatingDemo, setIsCreatingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && session) {
      fetchDashboardData();
    }
  }, [isAuthenticated, session]);

  const fetchDashboardData = async () => {
    try {
      const [caResponse, statsResponse, activityResponse, healthResponse] = await Promise.all([
        fetch('/api/ca/status'),
        fetch('/api/certificates/stats'),
        fetch('/api/dashboard/activity'),
        fetch('/api/dashboard/health')
      ]);

      if (caResponse.ok) {
        const caData: CAItem[] = await caResponse.json();
        // Pick ACTIVE CA first, else most recent entry
        const preferred = caData.find(item => item.status === 'ACTIVE') || caData[0] || null;
        setCaStatus(preferred);
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }

      if (activityResponse.ok) {
        const activityData = await activityResponse.json();
        setRecentActivity(activityData.activities);
      }

      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        setSystemHealth(healthData);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleInitializeDemoCA = async () => {
    try {
      setIsCreatingDemo(true);
      setDemoError(null);
      const res = await fetch('/api/ca/self-signed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectDN: 'C=US,ST=California,L=San Francisco,O=Demo Organization,OU=Demo CA,CN=Demo Root CA',
          keyAlgorithm: 'RSA',
          keySize: 2048,
          validityDays: 3650,
          force: false,
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to initialize demo CA');
      }
      await fetchDashboardData();
    } catch (e: any) {
      setDemoError(e?.message || 'Failed to initialize demo CA');
    } finally {
      setIsCreatingDemo(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'healthy':
        return 'bg-green-500';
      case 'INITIALIZING':
      case 'warning':
        return 'bg-yellow-500';
      case 'EXPIRED':
      case 'REVOKED':
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
      case 'healthy':
        return <CheckCircle className="h-4 w-4" />;
      case 'INITIALIZING':
      case 'warning':
        return <Clock className="h-4 w-4" />;
      case 'EXPIRED':
      case 'REVOKED':
      case 'error':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  if (isLoading || isDataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Ensure session exists before accessing user properties
  if (!session) {
    return null;
  }

  const userRole = session.user.role;
  const permissions = session.user.permissions;

  return (
    <div className="w-full p-6 pt-12 space-y-8 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Certificate Authority Management Overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchDashboardData}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Health Alert */}
      {systemHealth && systemHealth.status !== 'healthy' && (
        <Card className={systemHealth.status === 'error' ? 'border-red-200 dark:border-red-800' : 'border-yellow-200 dark:border-yellow-800'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              {getStatusIcon(systemHealth.status)}
              <span className="font-medium">{systemHealth.message}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full">
        {permissions.includes('certificate:issue') && (
          <Link href="/certificates/issue">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col w-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">Issue Certificate</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Create new certificates</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {permissions.includes('certificate:view') && (
          <Link href="/certificates">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col w-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <FileText className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">View Certificates</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Browse all certificates</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {permissions.includes('crl:manage') && (
          <Link href="/crl">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                    <Key className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">CRL Management</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Manage revocation lists</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {permissions.includes('ca:manage') && (
          <Link href="/ca/setup">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full flex flex-col">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
                    <Shield className="h-6 w-6 text-red-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-medium">CA Manager</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Manage CA certificates</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        )}

        {/* Audit Logs quick action removed */}
      </div>

      {/* <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"> */}
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* CA Status */}
          {caStatus && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  CA Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(caStatus.status)}`} />
                    <span className="font-medium">Status:</span>
                    <span className="capitalize">{caStatus.status.toLowerCase()}</span>
                    {getStatusIcon(caStatus.status)}
                  </div>
                  
                   {(caStatus.name || caStatus.subjectDN) && (
                    <div>
                       <span className="font-medium">CA:</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                         {caStatus.name || caStatus.subjectDN}
                      </p>
                    </div>
                  )}
                  
                  {caStatus.validTo && (
                    <div>
                      <span className="font-medium">Valid Until:</span>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(caStatus.validTo).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <span className="font-medium">Certificates:</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {caStatus.certificateCount}
                    </p>
                  </div>
                </div>

                {caStatus.status === 'INITIALIZING' && permissions.includes('ca:manage') && (
                  <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <span className="font-medium text-yellow-800 dark:text-yellow-200">
                        CA Initialization Required
                      </span>
                    </div>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-3">
                      The CA needs to be initialized before issuing certificates.
                    </p>
                    <Link href="/ca/setup">
                      <Button variant="outline" size="sm">
                        Initialize CA
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {!caStatus && permissions.includes('ca:manage') && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  CA Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mt-2 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <span className="font-medium text-orange-800 dark:text-orange-200">
                      No CA initialized
                    </span>
                  </div>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mb-3">
                    You need to initialize a Certificate Authority before issuing certificates.
                  </p>
                  <div className="flex items-center gap-3">
                    <Link href="/ca/setup">
                      <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white">
                        Initialize CA
                      </Button>
                    </Link>
                    <Button size="sm" variant="outline" disabled={isCreatingDemo} onClick={handleInitializeDemoCA}>
                      {isCreatingDemo ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Initializing Demo CA...
                        </>
                      ) : (
                        'Initialize Demo CA'
                      )}
                    </Button>
                  </div>
                  {demoError && (
                    <p className="text-sm text-red-600 mt-2">{demoError}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Statistics */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
                      <p className="text-2xl font-bold">{stats.totalCertificates}</p>
                    </div>
                    <FileText className="h-8 w-8 text-gray-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Active</p>
                      <p className="text-2xl font-bold text-green-600">{stats.activeCertificates}</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Expired</p>
                      <p className="text-2xl font-bold text-red-600">{stats.expiredCertificates}</p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-red-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Revoked</p>
                      <p className="text-2xl font-bold text-orange-600">{stats.revokedCertificates}</p>
                    </div>
                    <Ban className="h-8 w-8 text-orange-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Expiring Soon</p>
                      <p className="text-2xl font-bold text-yellow-600">{stats.expiringSoon}</p>
                    </div>
                    <Clock className="h-8 w-8 text-yellow-400" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Recent Activity removed */}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* System Health */}
          {systemHealth && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(systemHealth.status)}`} />
                  <span className="font-medium capitalize">{systemHealth.status}</span>
                </div>
                
                {systemHealth.checks.map((check, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span>{check.name}</span>
                    <div className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(check.status)}`} />
                      <span className="text-xs">{check.status}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Quick Info removed */}

          {/* Quick Links removed */}
        </div>
      {/* </div> */}
    </div>
  );
}
