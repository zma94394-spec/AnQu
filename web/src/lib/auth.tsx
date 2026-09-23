import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { setAuthTokenProvider } from './api';
import { isSupabaseConfigured, supabase } from './supabaseClient';

/* ============================================================================
 *  认证层
 *
 *  两套实现，对外暴露同一组接口：
 *    · 配置了 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  ->  真实 Supabase Auth
 *    · 未配置                                              ->  本地演示会话
 *
 *  之所以要"演示会话"，是因为后端 `POST /api/builds/:id/comments` 挂了 requireAuth，
 *  没有登录态就没法验证评论、点赞开关、删除自己的内容这些流程。
 *  演示会话让整条链路在没有 Supabase 项目时也能走通，接上真实项目后无需改任何组件。
 * ========================================================================== */

export interface AuthUser {
  id: string;
  email: string | null;
  nickname: string | null;
}

export interface SignUpResult {
  /** 是否需要先完成邮箱确认才能登录（Supabase 开启邮箱确认时为 true） */
  needsEmailConfirm: boolean;
}

export interface AuthContextValue {
  user: AuthUser | null;
  /** 初始会话恢复中 —— 期间不要根据 user === null 就判定"未登录" */
  loading: boolean;
  /** 是否处于演示会话模式（未配置 Supabase） */
  isDemo: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth 必须在 <AuthProvider> 内使用');
  return value;
}

/* -------------------------------------------------- 演示会话的实现细节 */

const DEMO_SESSION_KEY = 'anqu:demo-session';

interface DemoSession {
  user: AuthUser;
  /** 演示用令牌。真实后端会拒绝它，因此演示模式下请求不应发出（见 USE_MOCK） */
  token: string;
}

/**
 * 由邮箱推导出稳定的用户 id。
 *
 * 用确定性哈希而不是随机 UUID：同一个邮箱在同一浏览器上重复登录会得到同一个 id，
 * 这样"退出再登录，我的评论/点赞还在"的体验才成立，调试时也更好对账。
 */
function demoUserId(email: string): string {
  const normalized = email.trim().toLowerCase();
  const seeds = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];

  const parts = seeds.map((seed) => {
    let hash = seed >>> 0;
    for (let i = 0; i < normalized.length; i += 1) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  });

  const [a = '00000000', b = '00000000', c = '00000000', d = '00000000'] = parts;

  // 拼成 UUID 形状，并按 v4 规则设置版本位(4)与变体位(8)
  return `${a}-${b.slice(0, 4)}-4${b.slice(4, 7)}-8${c.slice(1, 4)}-${c.slice(4)}${d.slice(0, 4)}`;
}

/** 与 Supabase 默认的密码策略保持一致，避免演示模式放行过弱的密码 */
const MIN_PASSWORD_LENGTH = 6;

function validateCredentials(email: string, password: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('请输入合法的邮箱地址');
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`密码至少 ${MIN_PASSWORD_LENGTH} 位`);
  }
}

/* ---------------------------------------------------------- Provider */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /** 供 api.ts 读取当前令牌，用 ref 避免闭包拿到过期值 */
  const tokenRef = useRef<string | null>(null);

  const applySession = useCallback((nextUser: AuthUser | null, token: string | null) => {
    tokenRef.current = token;
    setUser(nextUser);
  }, []);

  /* ---------------------------------------------- 注入令牌提供者 */
  useEffect(() => {
    // api.ts 不直接 import auth 模块（会形成循环依赖），改为这里反向注入
    setAuthTokenProvider(() => tokenRef.current);
    return () => setAuthTokenProvider(null);
  }, []);

  /* ---------------------------------------------- 恢复 / 订阅会话 */
  useEffect(() => {
    /* ---- 演示模式：从 localStorage 恢复 ---- */
    if (!supabase) {
      try {
        const raw = window.localStorage.getItem(DEMO_SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as DemoSession;
          if (parsed?.user?.id && parsed.token) {
            applySession(parsed.user, parsed.token);
          }
        }
      } catch {
        // 数据损坏就当没登录，不要让整个应用起不来
        window.localStorage.removeItem(DEMO_SESSION_KEY);
      }
      setLoading(false);
      return;
    }

    /* ---- 真实 Supabase ---- */
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        const session = data.session;
        applySession(
          session?.user
            ? {
                id: session.user.id,
                email: session.user.email ?? null,
                nickname:
                  (session.user.user_metadata?.nickname as string | undefined) ??
                  session.user.email?.split('@')[0] ??
                  null,
              }
            : null,
          session?.access_token ?? null,
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      applySession(
        session?.user
          ? {
              id: session.user.id,
              email: session.user.email ?? null,
              nickname:
                (session.user.user_metadata?.nickname as string | undefined) ??
                session.user.email?.split('@')[0] ??
                null,
            }
          : null,
        session?.access_token ?? null,
      );
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  /* ---------------------------------------------- 登录 / 注册 / 退出 */

  const signIn = useCallback(
    async (email: string, password: string) => {
      validateCredentials(email, password);

      if (!supabase) {
        const normalized = email.trim().toLowerCase();
        const demo: DemoSession = {
          user: {
            id: demoUserId(normalized),
            email: normalized,
            nickname: normalized.split('@')[0] ?? normalized,
          },
          token: `demo.${demoUserId(normalized)}`,
        };
        window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demo));
        applySession(demo.user, demo.token);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw new Error(translateAuthError(error.message));
    },
    [applySession],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<SignUpResult> => {
      validateCredentials(email, password);

      if (!supabase) {
        // 演示模式没有邮箱确认环节，注册即登录
        await signIn(email, password);
        return { needsEmailConfirm: false };
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { nickname: email.trim().split('@')[0] ?? null } },
      });
      if (error) throw new Error(translateAuthError(error.message));

      // 开启邮箱确认时，signUp 不会返回 session
      return { needsEmailConfirm: data.session === null };
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    if (!supabase) {
      window.localStorage.removeItem(DEMO_SESSION_KEY);
      applySession(null, null);
      return;
    }
    await supabase.auth.signOut();
    applySession(null, null);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, isDemo: !isSupabaseConfigured, signIn, signUp, signOut }),
    [user, loading, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ------------------------------------------------------------------ 工具 */

/**
 * Supabase 的报错文案是英文的，直接抛给中文用户很突兀。
 * 这里只翻译最常见的几条，未覆盖的原样返回 —— 保留原文比强行翻译成
 * 含糊的中文更有助于排查。
 */
function translateAuthError(message: string): string {
  const table: Array<[RegExp, string]> = [
    [/invalid login credentials/i, '邮箱或密码不正确'],
    [/email not confirmed/i, '邮箱尚未确认，请先到邮箱里点击确认链接'],
    [/user already registered/i, '该邮箱已注册，请直接登录'],
    [/password should be at least/i, `密码至少 ${MIN_PASSWORD_LENGTH} 位`],
    [/unable to validate email address/i, '邮箱格式不正确'],
    [/email rate limit exceeded/i, '发送过于频繁，请稍后再试'],
  ];

  for (const [pattern, translated] of table) {
    if (pattern.test(message)) return translated;
  }
  return message;
}
