import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { AppError } from '../lib/errors.js';

interface ValidateSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * 请求校验中间件。
 *
 * 设计要点：
 *  · 校验产物写入 req.validated，而非覆盖 req.query（Express 4 的 query 是只读 getter）；
 *  · 校验失败统一抛 400 + 字段级 details，便于前端表单逐项标红。
 */
export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const validated: NonNullable<Request['validated']> = {};

    try {
      if (schemas.params) validated.params = schemas.params.parse(req.params);
      if (schemas.query) validated.query = schemas.query.parse(req.query);
      if (schemas.body) validated.body = schemas.body.parse(req.body ?? {});
    } catch (err) {
      if (err instanceof ZodError) {
        return next(
          AppError.badRequest(
            'VALIDATION_ERROR',
            '请求参数校验失败',
            err.issues.map((i) => ({
              field: i.path.join('.') || '(root)',
              message: i.message,
            })),
          ),
        );
      }
      return next(err);
    }

    req.validated = validated;
    next();
  };
}
