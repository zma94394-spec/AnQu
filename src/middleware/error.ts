import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { isProd } from '../lib/env.js';

/** 未匹配到任何路由 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `接口不存在：${req.method} ${req.path}` },
  });
}

/** 统一错误出口 —— 必须是最后一个注册的中间件 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const appErr =
    err instanceof AppError
      ? err
      : new AppError(500, 'INTERNAL_ERROR', '服务器内部错误');

  if (appErr.status >= 500) {
    console.error('[error]', err);
  }

  res.status(appErr.status).json({
    success: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details !== undefined ? { details: appErr.details } : {}),
      // 仅非生产环境暴露堆栈，便于联调
      ...(!isProd && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}

/**
 * 异步路由包装器。
 * Express 4 不会自动捕获 async handler 的 rejection，必须显式 next(err)，
 * 否则请求会挂起直到超时。
 */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  fn: T,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}
