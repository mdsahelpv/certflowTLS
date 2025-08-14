'use client';

import { signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import SignInPage from '../app/auth/signin/page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { 
  Shield, 
  Activity, 
  Bell,
  Users,
  Settings,
  LogOut,
  ChevronDown,
  User,
  CheckCircle
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

// Sidebar removed; navigation no longer needed

export default function Layout({ children }: LayoutProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  
  // Use custom auth hook
  const { session, isAuthenticated, isLoading } = useAuth();

  // For auth routes, render children only (no chrome)
  if (pathname.startsWith('/auth')) {
    return <>{children}</>;
  }

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // For other routes, if not authenticated, show sign-in
  if (!isAuthenticated || !session) {
    return <SignInPage />;
  }

  const permissions = session.user.permissions as string[];
  const userRole = session.user.role;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Main content (sidebar removed) */}
      <div>
        {/* Top navigation */}
        
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="flex items-center gap-2">
                <Shield className="h-6 w-6" />
                <span className="font-semibold">CA Management</span>
              </Link>
              <Link href="/dashboard">
                <Button variant="outline" size="sm">Home</Button>
              </Link>
            </div>

            <div className="flex items-center space-x-2 ml-auto">
              {permissions.includes('audit:view') && (
                <Link href="/audit">
                  <Button variant="ghost" size="sm" className="hidden md:inline-flex">
                    <Activity className="h-4 w-4 mr-2" />
                    Activity Log
                  </Button>
                </Link>
              )}
              {permissions.includes('config:manage') && (
                <Link href="/notifications">
                  <Button variant="ghost" size="sm" className="hidden md:inline-flex">
                    <Bell className="h-4 w-4 mr-2" />
                    Notifications
                  </Button>
                </Link>
              )}
              {/* Show Validate for users with certificate:validate or certificate:view permission */}
              {(permissions.includes('certificate:validate') || permissions.includes('certificate:view')) && (
                <Link href="/certificates/validate">
                  <Button variant="ghost" size="sm" className="hidden md:inline-flex">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Validate
                  </Button>
                </Link>
              )}
              {permissions.includes('ca:manage') && (
                <Link href="/ca/setup">
                  <Button variant="ghost" size="sm" className="hidden md:inline-flex">
                    <Shield className="h-4 w-4 mr-2" />
                    CA Management
                  </Button>
                </Link>
              )}
              <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-2"
                >
                  <User className="h-5 w-5" />
                  <span className="hidden sm:block">
                    {session.user.name || session.user.username}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {userRole}
                  </Badge>
                  <ChevronDown className="h-4 w-4" />
                </Button>               

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50">
                    <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {session.user.name || session.user.username}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {session.user.email}
                      </p>
                    </div>
                    <Link href="/profile" onClick={() => setUserMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">
                        <Settings className="h-4 w-4 mr-2" />
                        Profile
                      </Button>
                    </Link>
                  {permissions.includes('user:manage') && (
                    <Link href="/users" onClick={() => setUserMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">
                        <Users className="h-4 w-4 mr-2" />
                        User Management
                      </Button>
                    </Link>
                  )}
                    <Button
                      variant="ghost"
                      className="w-full justify-start text-red-600 hover:text-red-700"
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </Button>
                  </div>
                )}
              </div>
            
            </div>
          
          </div>
        </header>
        {/* </style> */}

        {/* Page content */}
        <main>{children}</main>
      </div>
    </div>
  );
}