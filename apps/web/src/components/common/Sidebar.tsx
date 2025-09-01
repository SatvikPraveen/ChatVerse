// apps/web/src/components/common/Sidebar.tsx
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MessageCircle, Settings, Search, Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useChatStore } from '../../store/chatStore';
import Avatar from './Avatar';
import Button from './Button';

export default function Sidebar() {
  const { user } = useAuth();
  const { conversations } = useChatStore();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const conversationList = Object.values(conversations).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const filteredConversations = conversationList.filter(conv => {
    if (!searchQuery) return true;
    return conv.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
           conv.participants.some(p =>
             typeof p.user !== 'string' &&
             p.user.name.toLowerCase().includes(searchQuery.toLowerCase())
           );
  });

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-gray-900">ChatVerse</h1>
          <Button variant="ghost" size="sm">
            <Plus className="w-5 h-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No conversations yet</p>
              <p className="text-sm">Start a new chat to get started</p>
            </div>
          ) : (
            filteredConversations.map(conversation => {
              const isConversationActive = isActive(`/chat/${conversation.id}`);
              const unreadCount = user ? conversation.unreadCount[user.id] || 0 : 0;

              // Get conversation display info
              let displayName = conversation.name;
              let displayAvatar = conversation.avatar;

              if (conversation.type === 'direct' && user) {
                const otherParticipant = conversation.participants.find(
                  p => typeof p.user !== 'string' && p.user.id !== user.id
                );
                if (otherParticipant && typeof otherParticipant.user !== 'string') {
                  displayName = otherParticipant.user.name;
                  displayAvatar = otherParticipant.user.avatar;
                }
              }

              return (
                <Link
                  key={conversation.id}
                  to={`/chat/${conversation.id}`}
                  className={`flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors ${
                    isConversationActive ? 'bg-blue-50 border border-blue-200' : ''
                  }`}
                >
                  <Avatar
                    src={displayAvatar}
                    name={displayName}
                    size="sm"
                    online={conversation.type === 'direct'}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 truncate">
                        {displayName}
                      </h3>
                      {conversation.lastMessage && (
                        <span className="text-xs text-gray-500">
                          {new Date(conversation.lastMessage.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      )}
                    </div>

                    {conversation.lastMessage && (
                      <p className="text-sm text-gray-600 truncate">
                        {conversation.lastMessage.content}
                      </p>
                    )}
                  </div>

                  {unreadCount > 0 && (
                    <div className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </div>
                  )}
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* User Profile */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-3">
          <Avatar
            src={user?.avatar}
            name={user?.name}
            size="sm"
            online={user?.presence.status === 'online'}
          />
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 truncate">
              {user?.name}
            </h4>
            <p className="text-sm text-gray-500 truncate">
              {user?.presence.status}
            </p>
          </div>
          <Link to="/settings">
            <Button
              variant="ghost"
              size="sm"
              className={isActive('/settings') ? 'bg-gray-100' : ''}
            >
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
