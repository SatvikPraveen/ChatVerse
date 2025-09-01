// File: packages/ui/src/Avatar.tsx

import React from 'react';
import { clsx } from 'clsx';

export interface AvatarProps {
  src?: string;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;
  status?: 'online' | 'offline' | 'away' | 'busy';
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = '',
  size = 'md',
  fallback,
  status,
  className,
}) => {
  const [imageError, setImageError] = React.useState(false);

  const sizeClasses = {
    xs: 'h-6 w-6 text-xs',
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-base',
    lg: 'h-12 w-12 text-lg',
    xl: 'h-16 w-16 text-xl',
  };

  const statusClasses = {
    online: 'bg-green-400',
    offline: 'bg-gray-400',
    away: 'bg-yellow-400',
    busy: 'bg-red-400',
  };

  const statusSizes = {
    xs: 'h-2 w-2',
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
    xl: 'h-4 w-4',
  };

  const shouldShowImage = src && !imageError;
  const initials = React.useMemo(() => {
    if (!fallback) return '';
    return fallback
      .split(' ')
      .slice(0, 2)
      .map(name => name[0])
      .join('')
      .toUpperCase();
  }, [fallback]);

  return (
    <div className={clsx('relative inline-block', className)}>
      <div
        className={clsx(
          'relative flex items-center justify-center rounded-full bg-gray-100 font-medium text-gray-600 ring-2 ring-white dark:bg-gray-800 dark:text-gray-300',
          sizeClasses[size]
        )}
      >
        {shouldShowImage ? (
          <img
            src={src}
            alt={alt}
            className="h-full w-full rounded-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="select-none">{initials || '?'}</span>
        )}
      </div>

      {status && (
        <div
          className={clsx(
            'absolute bottom-0 right-0 rounded-full border-2 border-white dark:border-gray-900',
            statusClasses[status],
            statusSizes[size]
          )}
        />
      )}
    </div>
  );
};
