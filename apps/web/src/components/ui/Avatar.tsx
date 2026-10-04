import clsx from 'clsx';
import { initials } from '@/lib/conversation-title';

const PALETTE = ['bg-sky-600', 'bg-emerald-600', 'bg-violet-600', 'bg-amber-600', 'bg-rose-600', 'bg-teal-600'];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function Avatar({
  name,
  src,
  size = 'md',
  online,
  className,
}: {
  name: string;
  src?: string | null;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
  className?: string;
}) {
  const dim = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-xl' : 'h-10 w-10 text-sm';
  return (
    <span className={clsx('relative inline-flex shrink-0', className)}>
      {src ? (
        <img src={src} alt="" className={clsx(dim, 'rounded-full object-cover')} />
      ) : (
        <span
          aria-hidden
          className={clsx(dim, colorFor(name), 'inline-flex items-center justify-center rounded-full font-semibold text-white')}
        >
          {initials(name) || '?'}
        </span>
      )}
      {online !== undefined && (
        <span
          className={clsx(
            'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-surface',
            online ? 'bg-success' : 'bg-muted',
          )}
          title={online ? 'Online' : 'Offline'}
        />
      )}
    </span>
  );
}
