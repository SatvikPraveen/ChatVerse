import { useUiStore } from '@/stores/ui';

export function ConnectionBanner() {
  const connection = useUiStore((s) => s.connection);
  if (connection === 'connected') return null;
  const text =
    connection === 'offline'
      ? 'You are offline. Messages you send will be delivered when you reconnect.'
      : connection === 'reconnecting'
        ? 'Connection lost. Reconnecting…'
        : 'Connecting…';
  return (
    <div
      role="status"
      className="bg-amber-500/15 px-4 py-1.5 text-center text-xs font-medium text-amber-700 dark:text-amber-300"
    >
      {text}
    </div>
  );
}
