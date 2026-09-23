/**
 * 统一错误模型。
 * 所有业务异常都抛 AppError，由 errorHandler 中间件序列化为统一响应体：
 *   { success: false, error: { code, message, details? } }
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(code: string, message: string, details?: unknown): AppError {
    return new AppError(400, code, message, details);
  }
  static unauthorized(message = '该操作需要登录'): AppError {
    return new AppError(401, 'AUTH_REQUIRED', message);
  }
  static forbidden(message = '没有操作权限'): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }
  static notFound(code: string, message: string): AppError {
    return new AppError(404, code, message);
  }
  static conflict(code: string, message: string, details?: unknown): AppError {
    return new AppError(409, code, message, details);
  }
}

/**
 * 把数据库 RPC 抛出的业务异常翻译为 HTTP 语义。
 *
 * 03_functions.sql 中的 RPC 使用 RAISE EXCEPTION '<CODE>' 抛出业务错误，
 * 经 Prisma $queryRaw 透传后，原始 SQL 错误信息位于 error.meta.message。
 */
const PG_ERROR_MAP: Array<{ match: string; build: () => AppError }> = [
  {
    match: 'BUILD_NOT_FOUND',
    build: () => AppError.notFound('BUILD_NOT_FOUND', '改枪方案不存在或已下架'),
  },
  {
    match: 'AUTH_REQUIRED',
    build: () => AppError.unauthorized(),
  },
  {
    match: 'INVALID_DELTA',
    build: () => AppError.badRequest('INVALID_DELTA', '非法的计数增量'),
  },
];

export function mapDbError(err: unknown): AppError {
  const meta = (err as { meta?: { message?: unknown; code?: unknown } })?.meta;
  const raw =
    (typeof meta?.message === 'string' && meta.message) ||
    (err instanceof Error ? err.message : '');

  for (const entry of PG_ERROR_MAP) {
    if (raw.includes(entry.match)) return entry.build();
  }

  // Prisma 唯一约束冲突
  const prismaCode = (err as { code?: string })?.code;
  if (prismaCode === 'P2002') {
    return AppError.conflict('DUPLICATE_RESOURCE', '该记录已存在');
  }
  if (prismaCode === 'P2003') {
    return AppError.badRequest('INVALID_REFERENCE', '关联的资源不存在');
  }

  return new AppError(500, 'DB_ERROR', '数据库操作失败，请稍后重试');
}
