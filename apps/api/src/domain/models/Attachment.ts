import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

export interface AttachmentDoc {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  size: number;
  mimeType: string;
  /** Object key in the bucket. */
  key: string;
  url: string;
  status: 'pending' | 'ready';
  createdAt: Date;
  updatedAt: Date;
}

export type AttachmentDocument = HydratedDocument<AttachmentDoc>;

const attachmentSchema = new Schema<AttachmentDoc>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    key: { type: String, required: true },
    url: { type: String, required: true },
    status: { type: String, enum: ['pending', 'ready'], default: 'pending' },
  },
  { timestamps: true, versionKey: false },
);

attachmentSchema.index({ ownerId: 1, createdAt: -1 });

export const AttachmentModel = model<AttachmentDoc>('Attachment', attachmentSchema);
