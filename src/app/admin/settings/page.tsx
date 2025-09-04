'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { Shield, Database, Lock, Bell, FileText, Settings as SettingsIcon, Activity, Zap, Download, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function AdminSettingsPage() {
  const { session, isAuthenticated } = useAuth('/auth/signin');
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('system');
  const [systemConfig, setSystemConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [securityConfig, setSecurityConfig] = useState<any>(null);
  const [passwordPolicy, setPasswordPolicy] = useState({
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    preventReuse: 5,
    expiryDays: 90,
  });
  const [sessionConfig, setSessionConfig] = useState({
    timeoutMinutes: 30,
    maxConcurrentSessions: 5,
    extendOnActivity: true,
    rememberMeDays: 30,
  });
  const [mfaConfig, setMfaConfig] = useState({
    enabled: false,
    requiredForAdmins: false,
    allowedMethods: ['totp', 'email'],
    gracePeriodHours: 24,
  });
  const [auditConfig, setAuditConfig] = useState({
    enabled: true,
    logLevel: 'info',
    retentionDays: 365,
    alertOnSuspicious: true,
  });

  if (!isAuthenticated || !session) {
    return null;
  }

  const permissions = session.user.permissions as string[];

  // Check if user has admin settings permission
  if (!permissions.includes('config:manage')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Access Denied</CardTitle>
            <CardDescription className="text-center">
              You don't have permission to access admin settings.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Fetch system configuration
  const fetchSystemConfig = async () => {
    try {
      const response = await fetch('/api/admin/system-config');
      if (response.ok) {
        const data = await response.json();
        setSystemConfig(data);
        setMaintenanceMode(data.maintenanceMode || false);
        setMaintenanceMessage(data.maintenanceMessage || '');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch system configuration',
        variant: 'destructive',
      });
    }
  };

  // Toggle maintenance mode
  const toggleMaintenanceMode = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/system-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggleMaintenance',
          config: {
            maintenanceMode: !maintenanceMode,
            maintenanceMessage,
          },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setMaintenanceMode(!maintenanceMode);
        toast({
          title: 'Success',
          description: result.message,
        });
      } else {
        throw new Error('Failed to update maintenance mode');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update maintenance mode',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Create backup
  const createBackup = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/system-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createBackup',
          config: {},
        }),
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: 'Success',
          description: result.message,
        });
      } else {
        throw new Error('Failed to create backup');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create backup',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'system') {
      fetchSystemConfig();
    }
  }, [activeTab]);

  return (
    <div className="w-full p-6 pt-12 space-y-8 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
            Admin Settings
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Configure system-wide settings and preferences
          </p>
        </div>
      </div>

      {/* Settings Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">System</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Audit</span>
          </TabsTrigger>
          <TabsTrigger value="ca" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">CA</span>
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Performance</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">Integrations</span>
          </TabsTrigger>
        </TabsList>

        {/* System Configuration Tab */}
        <TabsContent value="system" className="space-y-6">
          {/* Database Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Settings
              </CardTitle>
              <CardDescription>
                Current database configuration and connection status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Database Type</Label>
                    <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded text-sm">
                      {systemConfig?.databaseType || 'Loading...'}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Connection Status</Label>
                    <div className="mt-1 p-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded text-sm">
                      {systemConfig?.databaseUrl === 'configured' ? 'Connected' : 'Not Configured'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4">
                  <Button variant="outline" size="sm" onClick={fetchSystemConfig}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Status
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Backup & Restore */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Backup & Restore
              </CardTitle>
              <CardDescription>
                Create and manage system backups
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <h4 className="font-medium mb-2 text-blue-900 dark:text-blue-100">Create Backup</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
                    Create a backup of the current system state and database.
                  </p>
                  <Button
                    onClick={createBackup}
                    disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Creating Backup...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Create Backup
                      </>
                    )}
                  </Button>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Backup History</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Recent backups will appear here. In a full implementation, this would show a list of available backups with restore options.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    No backups found
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Maintenance Mode */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Maintenance Mode
              </CardTitle>
              <CardDescription>
                Enable maintenance mode to temporarily disable user access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Maintenance Mode</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      When enabled, users will see a maintenance message
                    </p>
                  </div>
                  <Switch
                    checked={maintenanceMode}
                    onCheckedChange={setMaintenanceMode}
                    disabled={loading}
                  />
                </div>
                {maintenanceMode && (
                  <div className="space-y-2">
                    <Label htmlFor="maintenance-message">Maintenance Message</Label>
                    <Textarea
                      id="maintenance-message"
                      placeholder="Enter maintenance message..."
                      value={maintenanceMessage}
                      onChange={(e) => setMaintenanceMessage(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
                <div className="flex items-center gap-2 pt-4">
                  <Button
                    onClick={toggleMaintenanceMode}
                    disabled={loading}
                    variant={maintenanceMode ? "destructive" : "default"}
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      `${maintenanceMode ? 'Disable' : 'Enable'} Maintenance Mode`
                    )}
                  </Button>
                  {maintenanceMode && (
                    <span className="text-sm text-orange-600 dark:text-orange-400">
                      System is in maintenance mode
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Environment Variables */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Environment Variables
              </CardTitle>
              <CardDescription>
                Current environment configuration (sensitive values are masked)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {systemConfig?.environmentVariables && Object.entries(systemConfig.environmentVariables).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="font-mono text-sm font-medium">{key}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {value as string}
                    </span>
                  </div>
                ))}
                <div className="text-xs text-gray-500 mt-4">
                  Note: Environment variables are read-only in this interface for security reasons.
                  To modify them, update your .env file or system environment.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Settings Tab */}
        <TabsContent value="security" className="space-y-6">
          {/* Password Policy Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Password Policy
              </CardTitle>
              <CardDescription>
                Configure password complexity and security requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="min-length">Minimum Length</Label>
                    <Input
                      id="min-length"
                      type="number"
                      min="6"
                      max="32"
                      value={passwordPolicy.minLength}
                      onChange={(e) => setPasswordPolicy(prev => ({ ...prev, minLength: parseInt(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="prevent-reuse">Prevent Password Reuse (last N passwords)</Label>
                    <Input
                      id="prevent-reuse"
                      type="number"
                      min="0"
                      max="20"
                      value={passwordPolicy.preventReuse}
                      onChange={(e) => setPasswordPolicy(prev => ({ ...prev, preventReuse: parseInt(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="expiry-days">Password Expiry (days)</Label>
                    <Input
                      id="expiry-days"
                      type="number"
                      min="30"
                      max="365"
                      value={passwordPolicy.expiryDays}
                      onChange={(e) => setPasswordPolicy(prev => ({ ...prev, expiryDays: parseInt(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="require-uppercase">Require Uppercase Letters</Label>
                    <Switch
                      id="require-uppercase"
                      checked={passwordPolicy.requireUppercase}
                      onCheckedChange={(checked) => setPasswordPolicy(prev => ({ ...prev, requireUppercase: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="require-lowercase">Require Lowercase Letters</Label>
                    <Switch
                      id="require-lowercase"
                      checked={passwordPolicy.requireLowercase}
                      onCheckedChange={(checked) => setPasswordPolicy(prev => ({ ...prev, requireLowercase: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="require-numbers">Require Numbers</Label>
                    <Switch
                      id="require-numbers"
                      checked={passwordPolicy.requireNumbers}
                      onCheckedChange={(checked) => setPasswordPolicy(prev => ({ ...prev, requireNumbers: checked }))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="require-special">Require Special Characters</Label>
                    <Switch
                      id="require-special"
                      checked={passwordPolicy.requireSpecialChars}
                      onCheckedChange={(checked) => setPasswordPolicy(prev => ({ ...prev, requireSpecialChars: checked }))}
                    />
                  </div>
                </div>
                <Button className="mt-4">Save Password Policy</Button>
              </div>
            </CardContent>
          </Card>

          {/* Session Management */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Session Management
              </CardTitle>
              <CardDescription>
                Configure session timeout and concurrent session limits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="session-timeout">Session Timeout (minutes)</Label>
                    <Input
                      id="session-timeout"
                      type="number"
                      min="5"
                      max="480"
                      value={sessionConfig.timeoutMinutes}
                      onChange={(e) => setSessionConfig(prev => ({ ...prev, timeoutMinutes: parseInt(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="max-sessions">Max Concurrent Sessions</Label>
                    <Input
                      id="max-sessions"
                      type="number"
                      min="1"
                      max="10"
                      value={sessionConfig.maxConcurrentSessions}
                      onChange={(e) => setSessionConfig(prev => ({ ...prev, maxConcurrentSessions: parseInt(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="remember-me">Remember Me Duration (days)</Label>
                    <Input
                      id="remember-me"
                      type="number"
                      min="1"
                      max="365"
                      value={sessionConfig.rememberMeDays}
                      onChange={(e) => setSessionConfig(prev => ({ ...prev, rememberMeDays: parseInt(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="extend-activity">Extend Session on Activity</Label>
                  <Switch
                    id="extend-activity"
                    checked={sessionConfig.extendOnActivity}
                    onCheckedChange={(checked) => setSessionConfig(prev => ({ ...prev, extendOnActivity: checked }))}
                  />
                </div>
                <Button className="mt-4">Save Session Settings</Button>
              </div>
            </CardContent>
          </Card>

          {/* Multi-Factor Authentication */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Multi-Factor Authentication
              </CardTitle>
              <CardDescription>
                Configure MFA settings and requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="mfa-enabled">Enable MFA</Label>
                  <Switch
                    id="mfa-enabled"
                    checked={mfaConfig.enabled}
                    onCheckedChange={(checked) => setMfaConfig(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="mfa-admins">Require MFA for Administrators</Label>
                  <Switch
                    id="mfa-admins"
                    checked={mfaConfig.requiredForAdmins}
                    onCheckedChange={(checked) => setMfaConfig(prev => ({ ...prev, requiredForAdmins: checked }))}
                  />
                </div>
                <div>
                  <Label htmlFor="mfa-methods">Allowed MFA Methods</Label>
                  <Select value={mfaConfig.allowedMethods.join(',')} onValueChange={(value) => setMfaConfig(prev => ({ ...prev, allowedMethods: value.split(',') }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="totp">TOTP (Authenticator Apps)</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                      <SelectItem value="totp,email">TOTP + Email</SelectItem>
                      <SelectItem value="totp,email,sms">All Methods</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="grace-period">MFA Grace Period (hours)</Label>
                  <Input
                    id="grace-period"
                    type="number"
                    min="0"
                    max="168"
                    value={mfaConfig.gracePeriodHours}
                    onChange={(e) => setMfaConfig(prev => ({ ...prev, gracePeriodHours: parseInt(e.target.value) }))}
                  />
                </div>
                <Button className="mt-4">Save MFA Settings</Button>
              </div>
            </CardContent>
          </Card>

          {/* Security Audit */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Security Audit
              </CardTitle>
              <CardDescription>
                Configure audit logging and security monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="audit-enabled">Enable Security Audit</Label>
                  <Switch
                    id="audit-enabled"
                    checked={auditConfig.enabled}
                    onCheckedChange={(checked) => setAuditConfig(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="alert-suspicious">Alert on Suspicious Activity</Label>
                  <Switch
                    id="alert-suspicious"
                    checked={auditConfig.alertOnSuspicious}
                    onCheckedChange={(checked) => setAuditConfig(prev => ({ ...prev, alertOnSuspicious: checked }))}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="log-level">Log Level</Label>
                    <Select value={auditConfig.logLevel} onValueChange={(value) => setAuditConfig(prev => ({ ...prev, logLevel: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="error">Error</SelectItem>
                        <SelectItem value="warn">Warning</SelectItem>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="debug">Debug</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="retention-days">Log Retention (days)</Label>
                    <Input
                      id="retention-days"
                      type="number"
                      min="30"
                      max="3650"
                      value={auditConfig.retentionDays}
                      onChange={(e) => setAuditConfig(prev => ({ ...prev, retentionDays: parseInt(e.target.value) }))}
                    />
                  </div>
                </div>
                <Button className="mt-4">Save Audit Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure email, alerts, and notification preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">SMTP Configuration</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Set up email server settings for notifications.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Alert Thresholds</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configure when to send alerts (e.g., certificate expiration).
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Notification Templates</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Customize notification message templates.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Audit & Logging
              </CardTitle>
              <CardDescription>
                Manage audit trails, log retention, and compliance settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Log Retention Policies</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Set how long to keep audit logs and system logs.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Audit Trail Export</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Export audit logs for compliance and analysis.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Log Level Configuration</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Set logging verbosity levels for different components.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CA Settings Tab */}
        <TabsContent value="ca" className="space-y-6">
          {/* CA Renewal Policy */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                CA Renewal Policy
              </CardTitle>
              <CardDescription>
                Configure automatic renewal settings for CA certificates
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-renewal">Enable Auto Renewal</Label>
                  <Switch id="auto-renewal" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="renewal-threshold">Renewal Threshold (days before expiry)</Label>
                    <Input id="renewal-threshold" type="number" min="1" max="365" defaultValue="30" />
                  </div>
                  <div>
                    <Label htmlFor="max-attempts">Max Renewal Attempts</Label>
                    <Input id="max-attempts" type="number" min="1" max="10" defaultValue="3" />
                  </div>
                  <div>
                    <Label htmlFor="notification-days">Notification Days Before Expiry</Label>
                    <Input id="notification-days" type="number" min="1" max="90" defaultValue="7" />
                  </div>
                </div>
                <Button className="mt-4">Save Renewal Policy</Button>
              </div>
            </CardContent>
          </Card>

          {/* Certificate Templates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Certificate Templates
              </CardTitle>
              <CardDescription>
                Configure default certificate issuance parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="default-validity">Default Validity (days)</Label>
                    <Input id="default-validity" type="number" min="30" max="3650" defaultValue="365" />
                  </div>
                  <div>
                    <Label htmlFor="default-key-size">Default Key Size</Label>
                    <Select defaultValue="2048">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1024">1024 bits</SelectItem>
                        <SelectItem value="2048">2048 bits</SelectItem>
                        <SelectItem value="3072">3072 bits</SelectItem>
                        <SelectItem value="4096">4096 bits</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="default-algorithm">Default Algorithm</Label>
                    <Select defaultValue="RSA">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RSA">RSA</SelectItem>
                        <SelectItem value="ECDSA">ECDSA</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="custom-extensions">Allow Custom Extensions</Label>
                  <Switch id="custom-extensions" defaultChecked />
                </div>
                <Button className="mt-4">Save Certificate Templates</Button>
              </div>
            </CardContent>
          </Card>

          {/* CRL Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Certificate Revocation List (CRL)
              </CardTitle>
              <CardDescription>
                Configure CRL generation and distribution settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="crl-enabled">Enable CRL</Label>
                  <Switch id="crl-enabled" defaultChecked />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="crl-interval">Update Interval (hours)</Label>
                    <Input id="crl-interval" type="number" min="1" max="168" defaultValue="24" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="include-revoked">Include Revoked Certificates</Label>
                  <Switch id="include-revoked" defaultChecked />
                </div>
                <div>
                  <Label htmlFor="distribution-points">CRL Distribution Points</Label>
                  <Textarea
                    id="distribution-points"
                    placeholder="Enter CRL distribution URLs (one per line)"
                    rows={3}
                    defaultValue="https://yourdomain.com/crl/latest.crl"
                  />
                </div>
                <Button className="mt-4">Save CRL Settings</Button>
              </div>
            </CardContent>
          </Card>

          {/* OCSP Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Online Certificate Status Protocol (OCSP)
              </CardTitle>
              <CardDescription>
                Configure OCSP responder settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="ocsp-enabled">Enable OCSP</Label>
                  <Switch id="ocsp-enabled" defaultChecked />
                </div>
                <div>
                  <Label htmlFor="responder-url">OCSP Responder URL</Label>
                  <Input
                    id="responder-url"
                    type="url"
                    placeholder="https://yourdomain.com/ocsp"
                    defaultValue="https://yourdomain.com/ocsp"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cache-timeout">Cache Timeout (minutes)</Label>
                    <Input id="cache-timeout" type="number" min="5" max="1440" defaultValue="60" />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="include-next-update">Include Next Update</Label>
                  <Switch id="include-next-update" defaultChecked />
                </div>
                <Button className="mt-4">Save OCSP Settings</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          {/* Health Checks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Health Checks
              </CardTitle>
              <CardDescription>
                Configure system health monitoring and automatic recovery
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="health-enabled">Enable Health Checks</Label>
                  <Switch id="health-enabled" defaultChecked />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="health-interval">Check Interval (minutes)</Label>
                    <Input id="health-interval" type="number" min="1" max="60" defaultValue="5" />
                  </div>
                  <div>
                    <Label htmlFor="health-timeout">Timeout (seconds)</Label>
                    <Input id="health-timeout" type="number" min="5" max="300" defaultValue="30" />
                  </div>
                  <div>
                    <Label htmlFor="failure-threshold">Failure Threshold</Label>
                    <Input id="failure-threshold" type="number" min="1" max="10" defaultValue="3" />
                  </div>
                </div>
                <Button className="mt-4">Save Health Check Settings</Button>
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Performance Metrics
              </CardTitle>
              <CardDescription>
                Configure metrics collection and alerting thresholds
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="metrics-enabled">Enable Metrics Collection</Label>
                  <Switch id="metrics-enabled" defaultChecked />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="metrics-interval">Collection Interval (minutes)</Label>
                    <Input id="metrics-interval" type="number" min="1" max="60" defaultValue="1" />
                  </div>
                  <div>
                    <Label htmlFor="metrics-retention">Data Retention (days)</Label>
                    <Input id="metrics-retention" type="number" min="1" max="365" defaultValue="30" />
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="font-medium">Alert Thresholds</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cpu-threshold">CPU Usage (%)</Label>
                      <Input id="cpu-threshold" type="number" min="1" max="100" defaultValue="80" />
                    </div>
                    <div>
                      <Label htmlFor="memory-threshold">Memory Usage (%)</Label>
                      <Input id="memory-threshold" type="number" min="1" max="100" defaultValue="85" />
                    </div>
                    <div>
                      <Label htmlFor="disk-threshold">Disk Usage (%)</Label>
                      <Input id="disk-threshold" type="number" min="1" max="100" defaultValue="90" />
                    </div>
                    <div>
                      <Label htmlFor="response-threshold">Response Time (ms)</Label>
                      <Input id="response-threshold" type="number" min="100" max="30000" defaultValue="5000" />
                    </div>
                  </div>
                </div>
                <Button className="mt-4">Save Metrics Settings</Button>
              </div>
            </CardContent>
          </Card>

          {/* Resource Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Resource Limits
              </CardTitle>
              <CardDescription>
                Set maximum resource usage limits and rate limiting
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="max-cpu">Max CPU Usage (%)</Label>
                    <Input id="max-cpu" type="number" min="1" max="100" defaultValue="90" />
                  </div>
                  <div>
                    <Label htmlFor="max-memory">Max Memory Usage (%)</Label>
                    <Input id="max-memory" type="number" min="1" max="100" defaultValue="90" />
                  </div>
                  <div>
                    <Label htmlFor="max-disk">Max Disk Usage (%)</Label>
                    <Input id="max-disk" type="number" min="1" max="100" defaultValue="95" />
                  </div>
                  <div>
                    <Label htmlFor="max-connections">Max Concurrent Connections</Label>
                    <Input id="max-connections" type="number" min="10" max="10000" defaultValue="1000" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="rate-limit">Rate Limit (requests per minute)</Label>
                  <Input id="rate-limit" type="number" min="10" max="10000" defaultValue="1000" />
                </div>
                <Button className="mt-4">Save Resource Limits</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Integration Settings
              </CardTitle>
              <CardDescription>
                Configure external integrations and API settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">API Rate Limiting</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configure API request rate limits.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">External Services</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Manage connections to external services.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <h4 className="font-medium mb-2">Webhook Management</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Configure webhook endpoints and settings.
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Implementation pending
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
