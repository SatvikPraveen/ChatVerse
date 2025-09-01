// apps/web/src/components/common/Header.tsx
import React from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Phone, Video, MoreVertical, Search } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useAuth } from '../../hooks/useAuth';
import Avatar from './Avatar';
import Button from './Button';

export default function Header() {
  const location = useLocation();
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { conversations, users } = useChatStore();

  // Don't show header on auth pages
  if (location.pathname.startsWith('/login') || location.pathname.startsWith('/register')) {
    return null;
  }

  // Get current conversation if we're in a chat
  const currentConversation = conversationId ? conversations[conversationId] : null;

  // Get conversation display info
  let displayName = '';
  let displayAvatar = '';
  let isOnline = false;
  let participantCount = 0;

  if (currentConversation) {
    participantCount = currentConversation.participants.length;

    if (currentConversation.type === 'direct' && user) {
      // For direct chats, show the other participant
      const otherParticipant = currentConversation.participants.find(
        p => typeof p.user !== 'string' && p.user.id !== user.id
      );

      if (otherParticipant && typeof otherParticipant.user !== 'string') {
        displayName = otherParticipant.user.name;
        displayAvatar = otherParticipant.user.avatar;
        isOnline = otherParticipant.user.presence?.status === 'online';
      }
    } else {
      // For group chats, show conversation name
      displayName = currentConversation.name || 'Group Chat';
      displayAvatar = currentConversation.avatar;
    }
  }

  const getPageTitle = () => {
    if (location.pathname === '/settings') {
      return 'Settings';
    }
    if (currentConversation) {
      return displayName;
    }
    return 'ChatVerse';
  };

  const getSubtitle = () => {
    if (currentConversation?.type === 'direct') {
      return isOnline ? 'Online' : 'Offline';
    }
    if (currentConversation?.type === 'group') {
      return `${participantCount} members`;
    }
    return null;
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - Conversation info or page title */}
        <div className="flex items-center gap-3">
          {currentConversation && (
            <Avatar
              src={displayAvatar}
              name={displayName}
              size="md"
              online={currentConversation.type === 'direct' ? isOnline : undefined}
            />
          )}

          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              {getPageTitle()}
            </h1>
            {getSubtitle() && (
              <p className="text-sm text-gray-500">
                {getSubtitle()}
              </p>
            )}
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {currentConversation && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="p-2"
                title="Search in conversation"
              >
                <Search className="w-5 h-5" />
              </Button>

              {currentConversation.type === 'direct' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2"
                    title="Voice call"
                  >
                    <Phone className="w-5 h-5" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2"
                    title="Video call"
                  >
                    <Video className="w-5 h-5" />
                  </Button>
                </>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="p-2"
                title="More options"
              >
                <MoreVertical className="w-5 h-5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
