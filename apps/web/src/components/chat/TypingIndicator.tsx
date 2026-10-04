import { useTypingNames } from '@/hooks/useTypingNames';

export function TypingIndicator({ conversationId }: { conversationId: string }) {
  const names = useTypingNames(conversationId);
  if (names.length === 0) return null;
  const label =
    names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : 'Several people are typing…';
  return (
    <p className="px-4 pb-1 text-xs text-muted" aria-live="polite">
      {label}
    </p>
  );
}
