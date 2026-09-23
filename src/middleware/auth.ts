import type { NextFunction, Request, Response } from 'express';
import { supabaseAuth } from '../lib/supabase.js';
import { AppError } from '../lib/errors.js';

/**
 * 可选鉴权：带 Bearer Token 就解析，不带也放行。
 * 适用于"登录用户走幂等路径、匿名用户走降级路径"的接口（如点赞）。
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  req.user = null;

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  const token = header.slice('Bearer '.length).trim();
  if (!token) return next();

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (!error && data.user) {
      req.user = { id: data.user.id, email: data.user.email ?? null };
    }
  } catch {
    // 令牌无效不应导致 500；按匿名处理，由 requireAuth 决定是否拦截
  }

  next();
}

/** 强制鉴权：必须在 optionalAuth 之后使用 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.id) return next(AppError.unauthorized());
  next();
}
