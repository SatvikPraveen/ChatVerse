// apps/api/src/services/upload.service.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import sharp from 'sharp';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { AppMetrics } from '../telemetry/metrics.js';
import { FILE_UPLOAD, ERROR_CODES } from '../config/constants.js';

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

export interface PresignedUploadResult {
  uploadUrl: string;
  fileUrl: string;
  fileId: string;
  fields?: Record<string, string>;
}

export interface FileMetadata {
  id: string;
  originalName: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  userId: string;
  url: string;
  thumbnailUrl?: string;
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
  uploadedAt: Date;
}

export class UploadService {
  async generatePresignedUploadUrl(
    userId: string,
    fileName: string,
    fileType: string,
    fileSize: number
  ): Promise<PresignedUploadResult> {
    try {
      // Validate file
      this.validateFile(fileName, fileType, fileSize);

      // Generate unique file key
      const fileExtension = this.getFileExtension(fileName);
      const fileId = uuidv4();
      const sanitizedName = this.sanitizeFileName(fileName);
      const fileKey = `uploads/${userId}/${fileId}-${sanitizedName}`;

      // Generate presigned URL
      const command = new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: fileKey,
        ContentType: fileType,
        ContentLength: fileSize,
        Metadata: {
          'user-id': userId,
          'file-id': fileId,
          'original-name': fileName,
        },
        ServerSideEncryption: 'AES256',
      });

      const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: 3600 // 1 hour
      });

      const fileUrl = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${fileKey}`;

      // Track upload metrics
      AppMetrics.recordFileUpload(this.getFileCategory(fileType), fileSize);

      logger.info({
        userId,
        fileId,
        fileName,
        fileType,
        fileSize,
        fileKey
      }, 'Presigned upload URL generated');

      return {
        uploadUrl,
        fileUrl,
        fileId,
      };
    } catch (error) {
      logger.error({ error, userId, fileName, fileType, fileSize }, 'Failed to generate presigned URL');
      AppMetrics.recordError('upload', 'generate_presigned_url');
      throw error;
    }
  }

  async generateThumbnail(
    fileKey: string,
    fileType: string,
    options: { width?: number; height?: number; quality?: number } = {}
  ): Promise<string | null> {
    try {
      if (!fileType.startsWith('image/')) {
        return null;
      }

      // Get original image from S3
      const getCommand = new GetObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: fileKey,
      });

      const response = await s3Client.send(getCommand);
      if (!response.Body) {
        throw new Error('Failed to get file from S3');
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      const stream = response.Body as any;

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      // Generate thumbnail
      const thumbnailBuffer = await sharp(buffer)
        .resize(options.width || 300, options.height || 300, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: options.quality || 80 })
        .toBuffer();

      // Upload thumbnail to S3
      const thumbnailKey = fileKey.replace(/(\.[^.]+)$/, '_thumb$1');
      const putCommand = new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg',
        ServerSideEncryption: 'AES256',
      });

      await s3Client.send(putCommand);

      const thumbnailUrl = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${thumbnailKey}`;

      logger.info({ originalKey: fileKey, thumbnailKey }, 'Thumbnail generated');

      return thumbnailUrl;
    } catch (error) {
      logger.error({ error, fileKey }, 'Failed to generate thumbnail');
      return null;
    }
  }

  async deleteFile(fileKey: string, userId?: string): Promise<void> {
    try {
      // Verify ownership if userId provided
      if (userId && !fileKey.includes(`uploads/${userId}/`)) {
        throw new Error(ERROR_CODES.FORBIDDEN);
      }

      // Delete main file
      const deleteCommand = new DeleteObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: fileKey,
      });

      await s3Client.send(deleteCommand);

      // Try to delete thumbnail if it exists
      const thumbnailKey = fileKey.replace(/(\.[^.]+)$/, '_thumb$1');
      try {
        const deleteThumbnailCommand = new DeleteObjectCommand({
          Bucket: env.AWS_S3_BUCKET,
          Key: thumbnailKey,
        });
        await s3Client.send(deleteThumbnailCommand);
      } catch (error) {
        // Thumbnail might not exist, ignore error
      }

      logger.info({ fileKey, userId }, 'File deleted from S3');
    } catch (error) {
      logger.error({ error, fileKey, userId }, 'Failed to delete file from S3');
      throw error;
    }
  }

  async getFileMetadata(fileKey: string): Promise<any> {
    try {
      const command = new GetObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: fileKey,
      });

      const response = await s3Client.send(command);

      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        metadata: response.Metadata,
        etag: response.ETag
      };
    } catch (error) {
      logger.error({ error, fileKey }, 'Failed to get file metadata');
      throw error;
    }
  }

  async generateDownloadUrl(fileKey: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: fileKey,
      });

      const url = await getSignedUrl(s3Client, command, { expiresIn });

      logger.debug({ fileKey, expiresIn }, 'Download URL generated');

      return url;
    } catch (error) {
      logger.error({ error, fileKey }, 'Failed to generate download URL');
      throw error;
    }
  }

  async validateUploadedFile(fileKey: string, expectedSize?: number, expectedType?: string): Promise<boolean> {
    try {
      const metadata = await this.getFileMetadata(fileKey);

      if (expectedSize && metadata.contentLength !== expectedSize) {
        logger.warn({ fileKey, expectedSize, actualSize: metadata.contentLength }, 'File size mismatch');
        return false;
      }

      if (expectedType && metadata.contentType !== expectedType) {
        logger.warn({ fileKey, expectedType, actualType: metadata.contentType }, 'File type mismatch');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, fileKey }, 'Failed to validate uploaded file');
      return false;
    }
  }

  async scanFileForViruses(fileKey: string): Promise<{ clean: boolean; threats?: string[] }> {
    // Placeholder for virus scanning integration
    // In production, integrate with AWS GuardDuty, ClamAV, or similar service

    try {
      // Simulate virus scan
      logger.debug({ fileKey }, 'Virus scan completed (placeholder)');

      return { clean: true };
    } catch (error) {
      logger.error({ error, fileKey }, 'Virus scan failed');
      return { clean: false, threats: ['Scan failed'] };
    }
  }

  async getUploadStats(userId?: string): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByType: Record<string, number>;
    recentUploads: number;
  }> {
    try {
      // In a real implementation, you'd query a database of file metadata
      // For now, return placeholder stats

      const stats = {
        totalFiles: 0,
        totalSize: 0,
        filesByType: {},
        recentUploads: 0
      };

      logger.debug({ userId, stats }, 'Upload stats retrieved');

      return stats;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get upload stats');
      throw error;
    }
  }

  private validateFile(fileName: string, fileType: string, fileSize: number): void {
    // Check file size
    if (fileSize > FILE_UPLOAD.MAX_SIZE) {
      throw new Error('File size exceeds maximum allowed size');
    }

    if (fileSize <= 0) {
      throw new Error('Invalid file size');
    }

    // Check file type
    if (!FILE_UPLOAD.ALLOWED_TYPES.includes(fileType)) {
      throw new Error('File type not allowed');
    }

    // Check file name
    if (!fileName || fileName.length > 255) {
      throw new Error('Invalid file name');
    }

    // Check for suspicious file extensions
    const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com'];
    const fileExtension = this.getFileExtension(fileName).toLowerCase();

    if (suspiciousExtensions.includes(fileExtension)) {
      throw new Error('File type not allowed');
    }
  }

  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot !== -1 ? fileName.substring(lastDot) : '';
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100);
  }

  private getFileCategory(fileType: string): string {
    if (fileType.startsWith('image/')) return 'image';
    if (fileType.startsWith('video/')) return 'video';
    if (fileType.startsWith('audio/')) return 'audio';
    if (fileType.includes('pdf')) return 'pdf';
    if (fileType.includes('document')) return 'document';
    return 'other';
  }

  private generateFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
