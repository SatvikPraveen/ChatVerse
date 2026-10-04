import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ConnectionBanner } from '@/components/layout/ConnectionBanner';
import { Sidebar } from '@/components/chat/Sidebar';
import { Spinner } from '@/components/ui/Spinner';
import { startSession } from '@/lib/session';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

/** Authenticated shell: starts the runtime once and lays out sidebar + content. */
export function AppLayout() {
  const status = useAuthStore((s) => s.status);
  const toast = useUiStore((s) => s.toast);
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    startSession()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Could not start session';
        if (!cancelled) setError(msg);
        toast('error', msg);
      });
    return () => {
      cancelled = true;
    };
  }, [status, toast]);

  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  // On narrow screens the sidebar is shown only on the root route; a conversation takes the screen.
  const inConversation = /^\/app\/(c\/|settings)/.test(location.pathname);

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner />
      {error && !ready ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm">
          <p className="text-danger">{error}</p>
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      ) : !ready ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner label="Starting session" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className={clsx('h-full w-full md:block md:w-auto', inConversation && 'hidden')}>
            <Sidebar />
          </div>
          <main className={clsx('min-w-0 flex-1', !inConversation && 'hidden md:flex')}>
            <Outlet />
          </main>
        </div>
      )}
    </div>
  );
}
