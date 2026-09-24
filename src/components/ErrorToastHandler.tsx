import { useEffect } from 'react';
import { toast } from 'sonner';

export function ErrorToastHandler() {
  useEffect(() => {
    let lastAuthToast = 0;
    const handler = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || 'An unexpected error occurred';

      // Expired/missing sign-in from a background request: handle gracefully
      // instead of letting it surface as an uncaught crash.
      if (
        /returned 401|invalid or expired dashboard session|not authenticated|invalid_token|session expired/i.test(msg)
      ) {
        e.preventDefault();
        if (/dashboard session|invalid_token/i.test(msg)) {
          try { localStorage.removeItem('dashboard_session_token'); } catch { /* ignore */ }
        }
        const now = Date.now();
        if (now - lastAuthToast > 30_000) {
          lastAuthToast = now;
          toast.error('Your session expired', {
            description: 'Please sign in again to continue.',
            action: { label: 'Sign in', onClick: () => window.location.assign('/login') },
          });
        }
        return;
      }

      if (msg.includes('API key not configured') || msg.includes('Missing API key')) {
        toast.error('API key not configured', {
          description: 'Go to Settings to configure your API keys.',
          action: {
            label: 'Settings',
            onClick: () => window.location.assign('/settings'),
          },
        });
      } else if (msg.includes('429') || msg.includes('Rate limit') || msg.includes('rate limited')) {
        toast.error('Rate limited', {
          description: 'Too many requests. Please wait a moment and try again.',
          duration: 10000,
        });
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('network')) {
        toast.error('Network error', {
          description: 'Check your connection and try again.',
        });
      } else {
        toast.error(msg.slice(0, 120));
      }
    };

    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  return null;
}
