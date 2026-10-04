import { randomBytes, randomUUID } from 'node:crypto';
import { Types } from 'mongoose';

export const newObjectId = (): Types.ObjectId => new Types.ObjectId();
export const isObjectId = (value: string): boolean => /^[a-f0-9]{24}$/i.test(value);
export const toObjectId = (value: string): Types.ObjectId => new Types.ObjectId(value);
export const uuid = (): string => randomUUID();
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** Canonical key for a direct conversation between two users (order independent). */
export function directKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}
