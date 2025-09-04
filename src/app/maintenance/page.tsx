'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Wrench, Clock } from 'lucide-react';

export default function MaintenancePage() {
  const [message, setMessage] = useState('System is currently under maintenance. Please try again later.');
  const [lastChecked, setLastChecked] = useState(new Date());

  // Check maintenance status periodically
  useEffect(() => {
    const checkMaintenanceStatus = async () => {
      try {
        const response = await fetch('/api/maintenance/status');
        if (response.ok) {
          const data = await response.json();
          if (!data.isMaintenanceMode) {
            // Maintenance mode is disabled, redirect to home
            window.location.href = '/';
            return;
          }
          if (data.message) {
            setMessage(data.message);
          }
        }
      } catch (error) {
        console.error('Failed to check maintenance status:', error);
      }
      setLastChecked(new Date());
    };

    // Check immediately
    checkMaintenanceStatus();

    // Check every 30 seconds
    const interval = setInterval(checkMaintenanceStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-orange-100 dark:bg-orange-900/20 rounded-full w-fit">
            <Wrench className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            System Maintenance
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            We're currently performing maintenance
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Maintenance Message */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {message}
            </p>
          </div>

          {/* Status Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Status:</span>
              <span className="font-medium text-orange-600 dark:text-orange-400">Maintenance Mode</span>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400">Last Checked:</span>
              <span className="font-medium text-slate-900 dark:text-slate-50">
                {lastChecked.toLocaleTimeString()}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleRefresh}
              className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>

            <div className="text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                This page will automatically refresh every 30 seconds
              </p>
            </div>
          </div>

          {/* Additional Information */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
              <Clock className="h-4 w-4" />
              <span>Expected downtime: Please check back soon</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
