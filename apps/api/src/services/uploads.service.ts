import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ErrorCode, type PresignUploadInput, type PresignUploadResponse } from '@chatverse/protocol';
import { isS3Configured } from '../config/env.js';
import type { Deps } from '../deps.js';
import { AttachmentModel } from '../domain/models/index.js';
import { AppError, notFound } from '../lib/errors.js';
import { newObjectId, toObjectId } from '../lib/ids.js';

const PRESIGN_TTL_SEC = 15 * 60;

/**
 * Direct-to-storage uploads: the API only signs a PUT URL, the browser uploads straight to S3
 * (or MinIO), then confirms. Attachment bytes never transit the API.
 */
export function createUploadsService(deps: Pick<Deps, 'env'>) {
  const { env } = deps;
  const enabled = isS3Configured(env);
  const client = enabled
    ? new S3Client({
        region: env.S3_REGION,
        credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! },
        ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, forcePathStyle: true } : {}),
      })
    : null;

  function publicUrl(key: string): string {
    const base = env.S3_PUBLIC_URL ?? `https://${env.S3_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
    return `${base.replace(/\/$/, '')}/${key}`;
  }

  return {
    enabled,

    async presign(ownerId: string, input: PresignUploadInput): Promise<PresignUploadResponse> {
      if (!client || !env.S3_BUCKET) throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'File uploads are not configured on this server');
      const id = newObjectId();
      const safeName = input.fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
      const key = `uploads/${ownerId}/${id.toString()}/${safeName}`;
      const url = publicUrl(key);
      await AttachmentModel.create({ _id: id, ownerId: toObjectId(ownerId), name: input.fileName, size: input.size, mimeType: input.mimeType, key, url, status: 'pending' });
      const uploadUrl = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: input.mimeType, ContentLength: input.size }),
        { expiresIn: PRESIGN_TTL_SEC },
      );
      return {
        attachmentId: id.toString(),
        uploadUrl,
        headers: { 'Content-Type': input.mimeType },
        publicUrl: url,
        expiresAt: new Date(Date.now() + PRESIGN_TTL_SEC * 1000).toISOString(),
      };
    },

    async complete(ownerId: string, attachmentId: string): Promise<{ attachmentId: string; url: string }> {
      const doc = await AttachmentModel.findOneAndUpdate(
        { _id: toObjectId(attachmentId), ownerId: toObjectId(ownerId) },
        { $set: { status: 'ready' } },
        { new: true },
      );
      if (!doc) throw notFound('Attachment');
      return { attachmentId, url: doc.url };
    },
  };
}

export type UploadsService = ReturnType<typeof createUploadsService>;
