import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function useAuth(redirectTo?: string) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (status !== 'loading') {
      setIsInitialized(true);
    }
  }, [status]);

  useEffect(() => {
    if (isInitialized && status === 'unauthenticated' && redirectTo) {
      router.push(redirectTo);
    }
  }, [isInitialized, status, redirectTo, router]);

  // Function to force session refresh
  const refreshSession = async () => {
    try {
      await update();
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  };

  return {
    session,
    status,
    isInitialized,
    isAuthenticated: status === 'authenticated',
    isLoading: status === 'loading' || !isInitialized,
    refreshSession,
  };
}
