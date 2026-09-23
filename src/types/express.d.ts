/**
 * Express Request 的类型增强。
 *
 * 注意：Express 4 把 req.query 定义为原型上的 getter，
 * 直接赋值会在严格模式下抛错，因此校验后的数据统一挂载到 req.validated。
 */

export interface AuthUser {
  id: string;
  email: string | null;
}

declare global {
  namespace Express {
    interface Request {
      /** 由 optionalAuth / requireAuth 中间件注入；未登录为 null */
      user?: AuthUser | null;
      /** 由 validate() 中间件注入的 zod 校验产物 */
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}
