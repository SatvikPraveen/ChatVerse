import clsx from 'clsx';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={clsx('inline-block', className)}>
      <span className="block h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-accent" />
    </span>
  );
}
