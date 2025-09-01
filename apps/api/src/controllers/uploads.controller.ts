// apps/api/src/controllers/uploads.controller.ts
import { Request, Response } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { UploadRequest, UploadResponse } from '@chatverse/types';

const s3Client = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY || '',
  },
});

export class UploadsController {
  async getPresignedUrl(req: Request<{}, UploadResponse, UploadRequest>, res: Response) {
    try {
      const { fileName, fileType, fileSize } = req.body;
      const userId = (req as any).user?.id;

      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (fileSize > maxSize) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'FILE_TOO_LARGE',
            message: 'File size exceeds 10MB limit',
          }
        } as any);
      }

      // Validate file type
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'audio/mp3',
        'audio/wav',
        'audio/ogg',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];

      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'File type not allowed',
          }
        } as any);
      }

      // Generate unique file key
      const fileExtension = fileName.split('.').pop();
      const fileKey = `uploads/${userId}/${uuidv4()}.${fileExtension}`;
      const fileId = uuidv4();

      // Create presigned URL for upload
      const command = new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: fileKey,
        ContentType: fileType,
        ContentLength: fileSize,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      const fileUrl = `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${fileKey}`;

      logger.info({
        userId,
        fileId,
        fileName,
        fileType,
        fileSize
      }, 'Presigned upload URL generated');

      res.json({
        success: true,
        data: {
          uploadUrl,
          fileUrl,
          fileId,
        }
      } as any);
    } catch (error) {
      logger.error({ error }, 'Failed to generate presigned URL');
      res.status(500).json({
        success: false,
        error: {
          code: 'UPLOAD_URL_GENERATION_FAILED',
          message: 'Failed to generate upload URL',
        }
      } as any);
    }
  }

  async getFile(req: Request, res: Response) {
    try {
      const { fileId } = req.params;

      // In a real implementation, you would:
      // 1. Validate file access permissions
      // 2. Get file metadata from database
      // 3. Return file stream or redirect to S3 URL

      res.json({
        success: true,
        data: {
          message: 'File endpoint - implement based on your needs'
        }
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get file');
      res.status(500).json({
        success: false,
        error: {
          code: 'FILE_ACCESS_FAILED',
          message: 'Failed to access file',
        }
      });
    }
  }

  async deleteFile(req: Request, res: Response) {
    try {
      const { fileId } = req.params;
      const userId = (req as any).user?.id;

      // In a real implementation, you would:
      // 1. Validate file ownership
      // 2. Delete file from S3
      // 3. Remove file record from database

      logger.info({ userId, fileId }, 'File deleted');

      res.json({
        success: true,
        data: {
          message: 'File deleted successfully'
        }
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete file');
      res.status(500).json({
        success: false,
        error: {
          code: 'FILE_DELETE_FAILED',
          message: 'Failed to delete file',
        }
      });
    }
  }
}
