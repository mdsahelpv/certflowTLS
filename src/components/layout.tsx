'use client';

import { signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

interface LayoutProps {
  children: React.ReactNode;
}

// Sidebar removed; navigation no longer needed

export default function Layout({ children }: LayoutProps) {
  const pathname = usePathname();
  
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="flex items-center space-x-2">
                    <User className="h-5 w-5" />
                    <span className="hidden sm:block">
                      {session.user.name || session.user.username}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {userRole}
                    </Badge>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {session.user.name || session.user.username}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {session.user.email}
                      </span>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  {permissions.includes('user:manage') && (
                    <DropdownMenuItem asChild>
                      <Link href="/users" className="flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        <span>User Management</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      signOut();
                    }}
                    className="text-red-600 focus:bg-red-50 dark:focus:bg-red-950/30 focus:text-red-700"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            
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