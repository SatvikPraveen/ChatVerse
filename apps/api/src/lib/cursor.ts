import { ErrorCode } from '@chatverse/protocol';
import { AppError } from './errors.js';

/**
 * Opaque pagination cursors. Encoding the sort key (and tie-breaker id) keeps pagination stable
 * under concurrent inserts, unlike offset/limit.
 */
export interface Cursor {
  t: string; // ISO timestamp of the sort key
  id: string; // tie-breaker
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<Cursor>;
    if (typeof parsed.t !== 'string' || typeof parsed.id !== 'string' || Number.isNaN(Date.parse(parsed.t))) throw new Error();
    return { t: parsed.t, id: parsed.id };
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Malformed cursor', { cursor: 'invalid' });
  }
}
