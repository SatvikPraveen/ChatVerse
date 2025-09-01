// apps/web/src/hooks/useUpload.ts
import { useState } from 'react';
import { apiClient } from '../services/apiClient';
import type { UploadResponse } from '@chatverse/types';

export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFiles = async (files: File[]): Promise<any[]> => {
    if (files.length === 0) return [];

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploadedFiles = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Get presigned upload URL
        const uploadRequest = await apiClient.post<UploadResponse>('/uploads/presign', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });

        const { uploadUrl, fileUrl, fileId } = uploadRequest.data;

        // Upload file to S3/storage
        await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        uploadedFiles.push({
          id: fileId,
          name: file.name,
          size: file.size,
          type: file.type,
          url: fileUrl,
          thumbnailUrl: file.type.startsWith('image/') ? fileUrl : undefined,
        });

        // Update progress
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }

      return uploadedFiles;
    } catch (error) {
      console.error('Upload failed:', error);
      throw new Error('Failed to upload files');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const uploadSingle = async (file: File) => {
    const result = await uploadFiles([file]);
    return result[0];
  };

  return {
    uploadFiles,
    uploadSingle,
    isUploading,
    uploadProgress,
  };
}
