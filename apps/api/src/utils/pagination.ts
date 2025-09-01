// apps/api/src/utils/pagination.ts
import { PAGINATION } from '../config/constants.js';

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
  total?: number;
}

export function validatePaginationParams(options: PaginationOptions) {
  const limit = Math.min(
    Math.max(Number(options.limit) || PAGINATION.DEFAULT_LIMIT, 1),
    PAGINATION.MAX_LIMIT
  );

  return {
    ...options,
    limit,
    sortField: options.sortField || 'createdAt',
    sortOrder: options.sortOrder || 'desc'
  };
}

export function buildCursorQuery(cursor?: string, sortField: string = 'createdAt', sortOrder: 'asc' | 'desc' = 'desc') {
  if (!cursor) return {};

  try {
    const cursorDate = new Date(cursor);
    return {
      [sortField]: sortOrder === 'desc' ? { $lt: cursorDate } : { $gt: cursorDate }
    };
  } catch (error) {
    return {};
  }
}

export function buildSortQuery(sortField: string = 'createdAt', sortOrder: 'asc' | 'desc' = 'desc') {
  return { [sortField]: sortOrder === 'desc' ? -1 : 1 };
}

export function createPaginationResult<T extends Record<string, any>>(
  data: T[],
  limit: number,
  sortField: string = 'createdAt',
  total?: number
): PaginationResult<T> {
  const hasMore = data.length === limit;
  const nextCursor = hasMore && data.length > 0
    ? data[data.length - 1][sortField]?.toISOString?.() || data[data.length - 1][sortField]
    : undefined;

  return {
    data,
    hasMore,
    nextCursor,
    total
  };
}

export class CursorPagination {
  constructor(
    private sortField: string = 'createdAt',
    private sortOrder: 'asc' | 'desc' = 'desc'
  ) {}

  buildQuery(cursor?: string) {
    return buildCursorQuery(cursor, this.sortField, this.sortOrder);
  }

  buildSort() {
    return buildSortQuery(this.sortField, this.sortOrder);
  }

  createResult<T extends Record<string, any>>(data: T[], limit: number, total?: number) {
    return createPaginationResult(data, limit, this.sortField, total);
  }
}

// Helper for offset-based pagination (if needed)
export interface OffsetPaginationOptions {
  page?: number;
  limit?: number;
}

export interface OffsetPaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function createOffsetPaginationResult<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): OffsetPaginationResult<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}
