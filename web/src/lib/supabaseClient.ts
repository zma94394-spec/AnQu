import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 浏览器端 Supabase 客户端（仅用 anon key）。
 *
 * ⚠️ 这里**只**允许出现 anon key。service_role key 能绕过 RLS，
 *    一旦进入前端产物就等于把数据库交出去 —— 它只应存在于后端环境变量里。
 *
 * 两个环境变量缺失时返回 null，认证层会自动切换到「演示会话」模式，
 * 保证界面在没有 Supabase 项目时也能完整走通登录流程。
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // 支持邮箱确认链接回跳后自动建立会话
          detectSessionInUrl: true,
        },
      })
    : null;
