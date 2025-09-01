// File: packages/ui/src/Card.tsx

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  className,
  padding = 'md',
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  };

  return (
    <div
      className={clsx(
        'rounded-lg border bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900',
        paddingClasses[padding],
        className
      )}
    >
      {children}
    </div>
  );
};
