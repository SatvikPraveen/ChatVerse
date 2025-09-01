// apps/web/src/components/chat/MessageAttachments.tsx
import React from 'react';
import { Download, File, Image, Video, Music, FileText } from 'lucide-react';
import type { MessageAttachment } from '@chatverse/types';

interface MessageAttachmentsProps {
  attachments: MessageAttachment[];
}

export default function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  if (!attachments || attachments.length === 0) {
    return null;
  }

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return Image;
    if (type.startsWith('video/')) return Video;
    if (type.startsWith('audio/')) return Music;
    if (type.includes('pdf') || type.includes('document')) return FileText;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleDownload = (attachment: MessageAttachment) => {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((attachment) => {
        const FileIcon = getFileIcon(attachment.type);

        // Render images as previews
        if (attachment.type.startsWith('image/')) {
          return (
            <div key={attachment.id} className="relative group">
              <img
                src={attachment.thumbnailUrl || attachment.url}
                alt={attachment.name}
                className="max-w-sm max-h-64 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => window.open(attachment.url, '_blank')}
              />
              <button
                onClick={() => handleDownload(attachment)}
                className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          );
        }

        // Render videos with controls
        if (attachment.type.startsWith('video/')) {
          return (
            <div key={attachment.id} className="relative group max-w-sm">
              <video
                src={attachment.url}
                className="w-full max-h-64 rounded-lg"
                controls
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
              <button
                onClick={() => handleDownload(attachment)}
                className="absolute top-2 right-2 p-1 bg-black bg-opacity-50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          );
        }

        // Render audio files
        if (attachment.type.startsWith('audio/')) {
          return (
            <div key={attachment.id} className="bg-gray-100 rounded-lg p-3 max-w-xs">
              <div className="flex items-center gap-3 mb-2">
                <FileIcon className="w-5 h-5 text-gray-600" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {attachment.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(attachment.size)}
                  </p>
                </div>
                <button
                  onClick={() => handleDownload(attachment)}
                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                  title="Download"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
              <audio
                src={attachment.url}
                className="w-full"
                controls
                preload="metadata"
              >
                Your browser does not support the audio tag.
              </audio>
            </div>
          );
        }

        // Render other files as file cards
        return (
          <div
            key={attachment.id}
            className="flex items-center gap-3 bg-gray-100 rounded-lg p-3 max-w-xs hover:bg-gray-200 transition-colors cursor-pointer"
            onClick={() => handleDownload(attachment)}
          >
            <FileIcon className="w-8 h-8 text-gray-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {attachment.name}
              </p>
              <p className="text-xs text-gray-500">
                {formatFileSize(attachment.size)}
              </p>
            </div>
            <Download className="w-4 h-4 text-gray-400" />
          </div>
        );
      })}
    </div>
  );
}
