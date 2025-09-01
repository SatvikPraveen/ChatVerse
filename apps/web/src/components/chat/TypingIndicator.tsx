// apps/web/src/components/chat/TypingIndicator.tsx
import { useChatStore } from '../../store/chatStore';
import Avatar from '../common/Avatar';

interface TypingIndicatorProps {
  userIds: string[];
}

export default function TypingIndicator({ userIds }: TypingIndicatorProps) {
  const { users } = useChatStore();

  if (userIds.length === 0) return null;

  const typingUsers = userIds.map(id => users[id]).filter(Boolean);

  if (typingUsers.length === 0) return null;

  const getTypingText = () => {
    if (typingUsers.length === 1) {
      return `${typingUsers[0].name} is typing...`;
    } else if (typingUsers.length === 2) {
      return `${typingUsers[0].name} and ${typingUsers[1].name} are typing...`;
    } else {
      return `${typingUsers[0].name} and ${typingUsers.length - 1} others are typing...`;
    }
  };

  return (
    <div className="flex items-center gap-3 px-2 py-1">
      <div className="flex -space-x-2">
        {typingUsers.slice(0, 3).map(user => (
          <Avatar
            key={user.id}
            src={user.avatar}
            name={user.name}
            size="sm"
            className="border-2 border-white"
          />
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">{getTypingText()}</span>

        <div className="flex space-x-1">
          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    </div>
  );
}
