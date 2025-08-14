'use client';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect, JSX } from 'react';
// Layout removed to avoid nested layout (double sidebar)
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Bell, 
  Plus, 
  Settings, 
  Mail, 
  Globe,
  Trash2,
  Edit,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar,
  Send
} from 'lucide-react';
import { NotificationType, NotificationEvent } from '@prisma/client';

interface NotificationSetting {
  id: string;
  type: NotificationType;
  event: NotificationEvent;
  recipient: string;
  daysBefore: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NotificationHistory {
  id: string;
  type: NotificationType;
  event: NotificationEvent;
  recipient: string;
  subject?: string;
  message: string;
  status: string;
  sentAt?: string;
  createdAt: string;
}

export default function NotificationsPage(): JSX.Element {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notifications, setNotifications] = useState<NotificationSetting[]>([]);
  const [history, setHistory] = useState<NotificationHistory[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingNotification, setEditingNotification] = useState<NotificationSetting | null>(null);
  
  const [formData, setFormData] = useState<{
    type: NotificationType;
    event: NotificationEvent;
    recipient: string;
    daysBefore: number;
    enabled: boolean;
  }>({
    type: NotificationType.EMAIL,
    event: NotificationEvent.CERTIFICATE_EXPIRY,
    recipient: '',
    daysBefore: 30,
    enabled: true,
  });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    if (status === 'authenticated') {
      const permissions = session.user.permissions;
      if (!permissions.includes('config:manage')) {
        router.push('/dashboard');
        return;
      }
      fetchNotifications();
      fetchNotificationHistory();
    }
  }, [status, router, session]);

  const fetchNotifications = async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/notifications');
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();
      setNotifications(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNotificationHistory = async () => {
    try {
      const response = await fetch('/api/notifications/history');
      if (!response.ok) {
        throw new Error('Failed to fetch notification history');
      }

      const data = await response.json();
      setHistory(data.notifications);
    } catch (error) {
      console.error('Failed to fetch notification history:', error);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const url = editingNotification ? '/api/notifications/update' : '/api/notifications/create';
      const method = editingNotification ? 'PUT' : 'POST';
      const body = editingNotification 
        ? { ...formData, id: editingNotification.id }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error('Failed to save notification');
      }

      setSuccess(editingNotification ? 'Notification updated successfully!' : 'Notification created successfully!');
      setShowAddDialog(false);
      setEditingNotification(null);
      setFormData({
        type: NotificationType.EMAIL,
        event: NotificationEvent.CERTIFICATE_EXPIRY,
        recipient: '',
        daysBefore: 30,
        enabled: true,
      });
      await fetchNotifications();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to save notification');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this notification?')) {
      return;
    }

    try {
      const response = await fetch(`/api/notifications/delete?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete notification');
      }

      await fetchNotifications();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete notification');
    }
  };

  const handleTestNotification = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/test?id=${id}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to send test notification');
      }

      setSuccess('Test notification sent successfully!');
      await fetchNotificationHistory();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send test notification');
    }
  };

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case NotificationType.EMAIL:
        return <Mail className="h-4 w-4" />;
      case NotificationType.WEBHOOK:
        return <Globe className="h-4 w-4" />;
      default:
        return <Bell className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="h-4 w-4" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString();
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Notification Settings
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                Configure email and webhook notifications for system events
              </p>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingNotification(null);
                  setFormData({
                    type: NotificationType.EMAIL,
                    event: NotificationEvent.CERTIFICATE_EXPIRY,
                    recipient: '',
                    daysBefore: 30,
                    enabled: true,
                  });
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Notification
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>
                    {editingNotification ? 'Edit Notification' : 'Add Notification'}
                  </DialogTitle>
                  <DialogDescription>
                    Configure notification settings for system events
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select 
                      value={formData.type} 
                      onValueChange={(value: NotificationType) => setFormData(prev => ({ ...prev, type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NotificationType.EMAIL}>Email</SelectItem>
                        <SelectItem value={NotificationType.WEBHOOK}>Webhook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Event</Label>
                    <Select 
                      value={formData.event} 
                      onValueChange={(value: NotificationEvent) => setFormData(prev => ({ ...prev, event: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NotificationEvent.CERTIFICATE_EXPIRY}>Certificate Expiry</SelectItem>
                        <SelectItem value={NotificationEvent.CA_EXPIRY}>CA Expiry</SelectItem>
                        <SelectItem value={NotificationEvent.CRL_UPDATE}>CRL Update</SelectItem>
                        <SelectItem value={NotificationEvent.SECURITY_ALERT}>Security Alert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Recipient</Label>
                    <Input
                      type={formData.type === NotificationType.EMAIL ? 'email' : 'url'}
                      placeholder={formData.type === NotificationType.EMAIL ? 'email@example.com' : 'https://example.com/webhook'}
                      value={formData.recipient}
                      onChange={(e) => setFormData(prev => ({ ...prev, recipient: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Days Before (for expiry events)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="365"
                      value={formData.daysBefore}
                      onChange={(e) => setFormData(prev => ({ ...prev, daysBefore: parseInt(e.target.value) }))}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="enabled"
                      checked={formData.enabled}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="enabled">Enabled</Label>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleSubmit} disabled={isLoading || !formData.recipient}>
                      {isLoading ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      {/* </div> */}
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
          {/* Notification Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure when and how notifications are sent
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No notifications configured
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {notifications.map((notification) => (
                    <div key={notification.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {getTypeIcon(notification.type)}
                        <div>
                          <div className="font-medium">
                            {notification.event.replace(/_/g, ' ')}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {notification.type === NotificationType.EMAIL ? notification.recipient : 'Webhook'}
                          </div>
                          {notification.event.includes('EXPIRY') && (
                            <div className="text-xs text-gray-500">
                              {notification.daysBefore} days before
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={notification.enabled ? 'default' : 'secondary'}>
                          {notification.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestNotification(notification.id)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingNotification(notification);
                            setFormData({
                              type: notification.type,
                              event: notification.event,
                              recipient: notification.recipient,
                              daysBefore: notification.daysBefore,
                              enabled: notification.enabled,
                            });
                            setShowAddDialog(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(notification.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notification History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Notifications
              </CardTitle>
              <CardDescription>
                History of sent notifications
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No notification history
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.slice(0, 10).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">
                            {formatDate(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTypeIcon(log.type)}
                              <Badge variant="outline">{log.type}</Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {log.event.replace(/_/g, ' ')}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(log.status)}`} />
                              {getStatusIcon(log.status)}
                              <span className="capitalize">{log.status.toLowerCase()}</span>
                            </div>
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

        {/* Configuration Info */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              SMTP Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">SMTP Host</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {process.env.SMTP_HOST || 'Not configured'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">SMTP Port</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {process.env.SMTP_PORT || 'Not configured'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">SMTP User</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {process.env.SMTP_USER || 'Not configured'}
                </p>
              </div>
              <div>
                <Label className="text-sm font-medium">From Email</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {process.env.SMTP_FROM || 'Not configured'}
                </p>
              </div>
            </div>
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                SMTP configuration is required for email notifications. Update your .env file with the correct SMTP settings.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    // </div>
  );
}