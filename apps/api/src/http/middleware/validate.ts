import type { RequestHandler } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Part = 'body' | 'query' | 'params';

/**
 * Validate and *replace* a request part with its parsed value, so handlers only ever see data
 * that satisfies the shared protocol schema (coercions and defaults applied).
 */
export function validate<S extends ZodTypeAny>(part: Part, schema: S): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) return next(result.error);
    (req as unknown as Record<Part, z.infer<S>>)[part] = result.data;
    next();
  };
}
