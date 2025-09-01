// apps/web/src/components/chat/MessageItem.tsx
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MoreHorizontal, Reply, Copy, Trash2, Edit3 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import Avatar from '../common/Avatar';
import MessageAttachments from './MessageAttachments';
import type { Message } from '@chatverse/types';

interface MessageItemProps {
  message: Message;
  showAvatar: boolean;
  showTimestamp: boolean;
  isOwn: boolean;
}

export default function MessageItem({
  message,
  showAvatar,
  showTimestamp,
  isOwn
}: MessageItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const { updateMessage, deleteMessage } = useChatStore();

  const handleEdit = async () => {
    if (editContent.trim() && editContent !== message.content) {
      try {
        await updateMessage(message.conversationId, {
          ...message,
          content: editContent,
          isEdited: true,
        });
        setIsEditing(false);
      } catch (error) {
        console.error('Failed to edit message:', error);
      }
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Delete this message?')) {
      try {
        await deleteMessage(message.conversationId, message.id);
      } catch (error) {
        console.error('Failed to delete message:', error);
      }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setShowMenu(false);
  };

  const formatTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };

  return (
    <div className={`flex gap-3 group hover:bg-gray-50 px-2 py-1 rounded-lg ${
      isOwn ? 'flex-row-reverse' : 'flex-row'
    }`}>
      {/* Avatar */}
      <div className="flex-shrink-0">
        {showAvatar ? (
          <Avatar
            src={message.sender?.avatar}
            name={message.sender?.name}
            size="sm"
          />
        ) : (
          <div className="w-8 h-8" />
        )}
      </div>

      {/* Message content */}
      <div className={`flex-1 min-w-0 ${isOwn ? 'text-right' : 'text-left'}`}>
        {/* Header */}
        {showAvatar && (
          <div className={`flex items-center gap-2 mb-1 ${
            isOwn ? 'justify-end' : 'justify-start'
          }`}>
            <span className="font-semibold text-sm text-gray-900">
              {message.sender?.name}
            </span>
            {showTimestamp && (
              <span className="text-xs text-gray-500">
                {formatTime(message.createdAt)}
              </span>
            )}
          </div>
        )}

        {/* Message body */}
        <div className={`relative ${isOwn ? 'ml-12' : 'mr-12'}`}>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleEdit();
                  }
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                    setEditContent(message.content);
                  }
                }}
              />
              <div className="flex gap-2 text-xs">
                <button
                  onClick={handleEdit}
                  className="text-blue-600 hover:underline"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditContent(message.content);
                  }}
                  className="text-gray-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className={`inline-block max-w-full px-3 py-2 rounded-lg ${
              isOwn
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}>
              <p className="whitespace-pre-wrap break-words text-sm">
                {message.content}
              </p>

              {message.isEdited && (
                <span className={`text-xs opacity-75 ${
                  isOwn ? 'text-blue-200' : 'text-gray-500'
                }`}>
                  (edited)
                </span>
              )}

              {message.attachments && message.attachments.length > 0 && (
                <MessageAttachments attachments={message.attachments} />
              )}
            </div>
          )}

          {/* Message actions */}
          {!isEditing && (
            <div className={`absolute top-0 ${
              isOwn ? 'left-0 -translate-x-8' : 'right-0 translate-x-8'
            } opacity-0 group-hover:opacity-100 transition-opacity`}>
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {showMenu && (
                  <div className={`absolute top-full mt-1 ${
                    isOwn ? 'right-0' : 'left-0'
                  } bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10`}>
                    <button
                      onClick={() => {
                        // TODO: Implement reply
                        setShowMenu(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Reply className="w-4 h-4" />
                      Reply
                    </button>

                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <Copy className="w-4 h-4" />
                      Copy
                    </button>

                    {isOwn && (
                      <>
                        <button
                          onClick={() => {
                            setIsEditing(true);
                            setShowMenu(false);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Edit3 className="w-4 h-4" />
                          Edit
                        </button>

                        <button
                          onClick={() => {
                            handleDelete();
                            setShowMenu(false);
                          }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Timestamp for single messages */}
        {!showAvatar && showTimestamp && (
          <div className={`text-xs text-gray-500 mt-1 ${
            isOwn ? 'text-right' : 'text-left'
          }`}>
            {formatTime(message.createdAt)}
          </div>
        )}
      </div>
    </div>
  );
}
