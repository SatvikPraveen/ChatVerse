import type { ReactNode } from 'react';

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <img src="/favicon.svg" alt="" className="mx-auto h-12 w-12" />
          <h1 className="mt-3 text-xl font-semibold">{title}</h1>
          <p className="text-xs text-muted">ChatVerse · end-to-end encrypted messaging</p>
        </div>
        {children}
      </div>
    </div>
  );
}
