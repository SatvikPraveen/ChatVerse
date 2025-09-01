// apps/web/src/components/chat/Composer.tsx
import { useState, useRef, useEffect } from 'react';
import { Send, Paperclip, Image, Smile } from 'lucide-react';
import { useSocket } from '../../app/providers/SocketProvider';
import { useUpload } from '../../hooks/useUpload';
import EmojiPicker from '../common/EmojiPicker';
import AttachmentPreview from '../upload/AttachmentPreview';
import Button from '../common/Button';

interface ComposerProps {
  conversationId: string;
  placeholder?: string;
}

export default function Composer({ conversationId, placeholder = "Type a message..." }: ComposerProps) {
  const [content, setContent] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const { sendMessage, startTyping, stopTyping } = useSocket();
  const { uploadFiles, isUploading } = useUpload();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [content]);

  // Typing indicator logic
  const handleTyping = () => {
    startTyping(conversationId);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(conversationId);
    }, 1000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedContent = content.trim();
    if (!trimmedContent && attachments.length === 0) return;

    try {
      let uploadedAttachments: any[] = [];

      if (attachments.length > 0) {
        uploadedAttachments = await uploadFiles(attachments);
      }

      sendMessage(conversationId, trimmedContent, uploadedAttachments);

      setContent('');
      setAttachments([]);
      stopTyping(conversationId);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleEmojiSelect = (emoji: string) => {
    setContent(prev => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const isDisabled = isUploading;
  const hasContent = content.trim() || attachments.length > 0;

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="mb-3">
          <AttachmentPreview
            files={attachments}
            onRemove={handleRemoveAttachment}
          />
        </div>
      )}

      {/* Main composer */}
      <div className="flex items-end gap-3">
        {/* File attachment button */}
        <div className="flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled}
            className="p-2"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
        </div>

        {/* Text input area */}
        <form onSubmit={handleSubmit} className="flex-1">
          <div className="flex items-end bg-gray-50 rounded-lg border border-gray-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                handleTyping();
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isDisabled}
              className="flex-1 bg-transparent border-0 resize-none px-3 py-2 focus:outline-none text-sm max-h-32 min-h-10"
              rows={1}
            />

            {/* Emoji picker button */}
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                disabled={isDisabled}
                className="p-2 m-1"
              >
                <Smile className="w-5 h-5" />
              </Button>

              {showEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2">
                  <EmojiPicker
                    onSelect={handleEmojiSelect}
                    onClose={() => setShowEmojiPicker(false)}
                  />
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Send button */}
        <div className="flex-shrink-0">
          <Button
            onClick={handleSubmit}
            disabled={!hasContent || isDisabled}
            isLoading={isUploading}
            variant="primary"
            size="sm"
            className="p-2"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Helper text */}
      <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
        <span>Press Enter to send, Shift+Enter for new line</span>
        {isUploading && <span>Uploading files...</span>}
      </div>
    </div>
  );
}
