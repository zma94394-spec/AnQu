import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';
import { CircleAlert, Info, Loader2, Lock, LogIn, Mail, ShieldCheck, UserPlus } from 'lucide-react';

import { ModalShell } from './ModalShell';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';

export interface AuthDialogProps {
  onClose: () => void;
  /** 登录/注册成功后的回调，由父组件负责关闭弹窗并给出轻提示 */
  onSuccess: (message: string) => void;
}

type Mode = 'signin' | 'signup';

export function AuthDialog({ onClose, onSuccess }: AuthDialogProps) {
  const { signIn, signUp, isDemo } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 需要邮箱确认这类"不是错误但需要告知"的信息 */
  const [info, setInfo] = useState<string | null>(null);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (submitting) return;

      setError(null);
      setInfo(null);

      if (email.trim().length === 0) {
        setError('请输入邮箱');
        return;
      }
      if (password.length === 0) {
        setError('请输入密码');
        return;
      }

      setSubmitting(true);
      try {
        if (mode === 'signin') {
          await signIn(email, password);
          onSuccess('登录成功。');
          return;
        }

        const result = await signUp(email, password);
        if (result.needsEmailConfirm) {
          // 不是失败：Supabase 开启了邮箱确认，此时还没有会话
          setInfo('注册成功。请到邮箱里点击确认链接，然后回来登录。');
          setMode('signin');
          setPassword('');
          return;
        }
        onSuccess('注册成功，已自动登录。');
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作失败，请稍后重试');
      } finally {
        setSubmitting(false);
      }
    },
    [email, mode, onSuccess, password, signIn, signUp, submitting],
  );

  const isSignUp = mode === 'signup';

  return (
    <ModalShell
      title={isSignUp ? '注册账号' : '登录'}
      description={
        isSignUp
          ? '注册后即可发表评论、点赞与发布改枪方案。'
          : '登录后可发表评论，点赞也会变成可取消的幂等开关。'
      }
      icon={ShieldCheck}
      busy={submitting}
      onClose={onClose}
      maxWidthClass="max-w-md"
      bodyMaxHeightClass="max-h-[calc(100dvh-16rem)]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={cn(
              'rounded-md border border-line bg-raised px-4 py-2 text-xs font-semibold',
              'text-muted transition-colors hover:border-line-strong hover:text-ink',
              'disabled:opacity-40',
            )}
          >
            取消
          </button>

          <button
            type="submit"
            form="auth-form"
            disabled={submitting}
            className={cn(
              'flex items-center gap-1.5 rounded-md bg-tactical px-4 py-2 text-xs font-bold',
              'text-void transition-colors hover:bg-tactical-deep hover:text-ink',
              'disabled:cursor-wait disabled:opacity-60',
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                处理中…
              </>
            ) : (
              <>
                {isSignUp ? (
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isSignUp ? '注册并登录' : '登录'}
              </>
            )}
          </button>
        </>
      }
    >
      {/* 提交按钮在 footer 里，用 form 属性关联到这里的表单 */}
      <form id="auth-form" onSubmit={handleSubmit} noValidate className="space-y-3.5">
        <div>
          <label htmlFor="auth-email" className="mb-1.5 block text-xs font-semibold text-muted">
            邮箱
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim"
              aria-hidden="true"
            />
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              className={cn(
                'w-full rounded-lg border border-line bg-void/60 py-2 pl-9 pr-3',
                'text-sm text-ink placeholder:text-dim',
                'transition-colors hover:border-line-strong focus:border-tactical/60 focus:outline-none',
              )}
            />
          </div>
        </div>

        <div>
          <label htmlFor="auth-password" className="mb-1.5 block text-xs font-semibold text-muted">
            密码
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dim"
              aria-hidden="true"
            />
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder="至少 6 位"
              className={cn(
                'w-full rounded-lg border border-line bg-void/60 py-2 pl-9 pr-3',
                'text-sm text-ink placeholder:text-dim',
                'transition-colors hover:border-line-strong focus:border-tactical/60 focus:outline-none',
              )}
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-1.5 rounded-lg border border-danger/35 bg-danger/8 px-3 py-2 text-[11px] leading-relaxed text-muted"
          >
            <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-danger" aria-hidden="true" />
            {error}
          </p>
        )}

        {info && (
          <p
            role="status"
            className="flex items-start gap-1.5 rounded-lg border border-tactical/40 bg-tactical/8 px-3 py-2 text-[11px] leading-relaxed text-muted"
          >
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-tactical" aria-hidden="true" />
            {info}
          </p>
        )}

        <button
          type="button"
          onClick={() => switchMode(isSignUp ? 'signin' : 'signup')}
          className="text-[11px] font-semibold text-tactical transition-colors hover:text-tactical-deep"
        >
          {isSignUp ? '已有账号？去登录' : '还没有账号？去注册'}
        </button>

        {isDemo && (
          <p className="flex items-start gap-1.5 rounded-lg border border-line bg-void/50 px-3 py-2 text-[11px] leading-relaxed text-dim">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong className="text-muted">演示模式</strong>：未配置
              <code className="mx-1 font-mono">VITE_SUPABASE_URL</code>/
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>，
              当前使用本地演示会话（任意合法邮箱 + 6 位以上密码即可登录，
              仅保存在本机浏览器，不会发送到任何服务器）。
            </span>
          </p>
        )}
      </form>
    </ModalShell>
  );
}
