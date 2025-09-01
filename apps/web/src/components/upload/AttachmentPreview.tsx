// apps/web/src/components/upload/AttachmentPreview.tsx
import React from 'react';
import { X, File, Image, Video, Music } from 'lucide-react';
import Button from '../common/Button';

interface AttachmentPreviewProps {
  files: File[];
  onRemove: (index: number) => void;
}

export default function AttachmentPreview({ files, onRemove }: AttachmentPreviewProps) {
  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) {
      return <Image className="w-4 h-4" />;
    } else if (file.type.startsWith('video/')) {
      return <Video className="w-4 h-4" />;
    } else if (file.type.startsWith('audio/')) {
      return <Music className="w-4 h-4" />;
    } else {
      return <File className="w-4 h-4" />;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getPreviewUrl = (file: File) => {
    if (file.type.startsWith('image/')) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file, index) => {
        const previewUrl = getPreviewUrl(file);

        return (
          <div
            key={index}
            className="relative flex items-center gap-2 bg-gray-100 rounded-lg p-2 max-w-xs"
          >
            {/* Preview or icon */}
            <div className="flex-shrink-0">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="w-12 h-12 object-cover rounded"
                  onLoad={() => URL.revokeObjectURL(previewUrl)}
                />
              ) : (
                <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center">
                  {getFileIcon(file)}
                </div>
              )}
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {file.name}
              </p>
              <p className="text-xs text-gray-500">
                {formatFileSize(file.size)}
              </p>
            </div>

            {/* Remove button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(index)}
              className="absolute -top-2 -right-2 w-6 h-6 p-0 bg-red-500 text-white hover:bg-red-600 rounded-full"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
