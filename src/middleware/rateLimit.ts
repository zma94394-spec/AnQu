import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * 限流策略。
 *
 * 设计依据：
 *  · 读接口（GET）量大且幂等，不做限流，交由 CDN / 缓存层削峰；
 *  · 写接口（提交方案）是内容质量的主要风险点，按 IP 严格限制；
 *  · 互动接口（复制 / 点赞）高频但轻量，限制放宽，仅防脚本刷量。
 *
 * 注意：生产环境必须正确配置反向代理（app.set('trust proxy', 1)），
 *       否则所有请求会被识别为同一 IP，导致限流误伤全体用户。
 */

const jsonLimitHandler =
  (_code: string, message: string) => (_req: Request, res: Response) => {
    res.status(429).json({ success: false, error: { code: _code, message } });
  };

/** 提交内容：10 分钟 20 次 */
export const writeLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonLimitHandler('RATE_LIMITED', '提交过于频繁，请 10 分钟后再试'),
});

/** 互动（复制 / 点赞 / 评论）：1 分钟 60 次 */
export const interactLimiter: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: jsonLimitHandler('RATE_LIMITED', '操作过于频繁，请稍后再试'),
});
