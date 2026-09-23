import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * 两个客户端，职责严格分离：
 *
 *  supabaseAuth  —— 使用 anon key，仅用于校验前端传来的 JWT（auth.getUser）。
 *                   它不会绕过 RLS，权限与普通登录用户一致。
 *
 *  supabaseAdmin —— 使用 service_role key，可绕过 RLS。
 *                   仅允许在服务端出现，用于后台管理、可信写入与统计。
 *                   绝对禁止把该 key 或其调用结果下发到前端。
 */

export const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const supabaseAdmin = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

/** 供 README / 调试使用：确认 service_role 是否已配置 */
export const hasServiceRole = supabaseAdmin !== null;
