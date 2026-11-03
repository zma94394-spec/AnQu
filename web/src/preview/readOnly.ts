/**
 * UI020-005：Preview 专用只读策略。
 *
 * 该模块只被 Preview 入口/Preview 组件引用；正式 Production 入口不引用它。
 * 只读模式在 Preview 入口的 configure 模块里硬编码开启，不依赖任何 Vercel 环境变量。
 */

export const PREVIEW_READ_ONLY = true;
export const PREVIEW_READ_ONLY_MESSAGE = '预览环境暂不支持此操作';
export const PREVIEW_READONLY_EVENT = 'ui020:preview-readonly-blocked';

/**
 * Preview 数据源策略：
 * - 显式 `VITE_USE_MOCK=false`：只读 GET 允许访问真实 API；
 * - 缺失或其它值：一律使用 Mock，绝不自动回退真实 API。
 */
export const PREVIEW_DATA_MODE: 'mock' | 'remote-readonly' =
  import.meta.env.VITE_USE_MOCK === 'false' ? 'remote-readonly' : 'mock';

export interface PreviewReadOnlyEventDetail {
  action?: string;
}

export interface PreviewGuardStats {
  allowed: number;
  blocked: number;
  realCalls: number;
}

export interface PreviewFormGuardStats {
  allowed: number;
  blocked: number;
}

export interface PreviewGuardHandle {
  getStats: () => PreviewGuardStats;
  getFormStats: () => PreviewFormGuardStats;
}

export class PreviewReadOnlyError extends Error {
  readonly code = 'PREVIEW_READ_ONLY';
  readonly status = 403;

  constructor(action?: string) {
    super(action ? `${PREVIEW_READ_ONLY_MESSAGE}（${action}）` : PREVIEW_READ_ONLY_MESSAGE);
    this.name = 'PreviewReadOnlyError';
  }
}

export function isPreviewReadOnlyError(error: unknown): error is PreviewReadOnlyError {
  return (
    error instanceof PreviewReadOnlyError ||
    (typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'PREVIEW_READ_ONLY')
  );
}

export function isReadOnlyMethod(method: string | null | undefined): boolean {
  const normalized = (method ?? 'GET').toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD';
}

export function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const initMethod = init?.method;
  if (initMethod) return initMethod.toUpperCase();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method.toUpperCase();
  return 'GET';
}

export function notifyPreviewBlocked(action?: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PreviewReadOnlyEventDetail>(PREVIEW_READONLY_EVENT, {
      detail: { action },
    }),
  );
}

export function assertPreviewMethodAllowed(
  method: string | null | undefined,
  action?: string,
): void {
  if (isReadOnlyMethod(method)) return;
  notifyPreviewBlocked(action);
  throw new PreviewReadOnlyError(action);
}

/** 写操作在 API 层无条件拒绝；调用方在 Preview 模式下不可能走到网络。 */
export function assertPreviewWriteAllowed(action?: string): never {
  notifyPreviewBlocked(action);
  throw new PreviewReadOnlyError(action);
}

export function createPreviewGuardedFetch(
  fetchImpl: typeof fetch,
  stats: PreviewGuardStats = { allowed: 0, blocked: 0, realCalls: 0 },
): typeof fetch & { getStats: () => PreviewGuardStats } {
  const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = requestMethod(input, init);
    if (!isReadOnlyMethod(method)) {
      stats.blocked += 1;
      notifyPreviewBlocked(method);
      throw new PreviewReadOnlyError(method);
    }

    stats.allowed += 1;
    stats.realCalls += 1;
    return fetchImpl(input, init);
  };

  return Object.assign(guarded, { getStats: () => ({ ...stats }) });
}

/**
 * 在浏览器真正的网络层上再上一道锁：
 * - fetch：非 GET/HEAD 在调用底层 fetch 前拒绝；
 * - sendBeacon：一律拒绝并返回 false；
 * - XMLHttpRequest：非 GET/HEAD 在 open 阶段拒绝；
 * - 未知方法默认拒绝。
 */
/** 原生 form 的 effective method/action 可以被子提交按钮的 formmethod/formaction 覆盖。 */
function formMethod(form: HTMLFormElement, submitter?: HTMLElement | null): string {
  const submitterMethod = submitter?.getAttribute?.('formmethod');
  const raw = submitterMethod ?? form.getAttribute('method') ?? 'get';
  return raw.trim().toUpperCase();
}

function formAction(form: HTMLFormElement, submitter?: HTMLElement | null): string | null {
  const submitterAction = submitter?.getAttribute?.('formaction');
  return submitterAction ?? form.getAttribute('action');
}

/**
 * Preview 原生表单策略：
 * - 只允许 GET；
 * - GET 只允许当前页（无 action/空 action）或同源、非 /api 的普通导航；
 * - 外部主机、/api*、非 GET、javascript: 等一律拒绝。
 *
 * 这不依赖 CSS/按钮状态；页面内注入的原生 form 也走同一判据。
 */
export function isAllowedPreviewFormSubmission(
  form: HTMLFormElement,
  submitter?: HTMLElement | null,
): boolean {
  if (formMethod(form, submitter) !== 'GET') return false;

  const action = formAction(form, submitter);
  if (action === null || action.trim() === '') return true;

  let url: URL;
  try {
    url = new URL(action, window.location.href);
  } catch {
    return false;
  }

  if (url.origin !== window.location.origin) return false;
  const path = url.pathname.toLowerCase();
  return path !== '/api' && !path.startsWith('/api/');
}

export function installPreviewReadOnlyGuard(): PreviewGuardHandle {
  const emptyStats = { allowed: 0, blocked: 0, realCalls: 0 };
  const emptyFormStats = { allowed: 0, blocked: 0 };
  if (typeof window === 'undefined') {
    return {
      getStats: () => ({ ...emptyStats }),
      getFormStats: () => ({ ...emptyFormStats }),
    };
  }

  const w = window as Window & {
    __ui020PreviewGuard?: PreviewGuardHandle;
    fetch: typeof fetch;
  };
  if (w.__ui020PreviewGuard) return w.__ui020PreviewGuard;

  const stats: PreviewGuardStats = { allowed: 0, blocked: 0, realCalls: 0 };
  const formStats: PreviewFormGuardStats = { allowed: 0, blocked: 0 };
  const originalFetch = w.fetch.bind(w);
  const guardedFetch = createPreviewGuardedFetch(originalFetch, stats);
  w.fetch = guardedFetch;

  const blockForm = (reason: string) => {
    formStats.blocked += 1;
    notifyPreviewBlocked(`表单提交 ${reason}`);
  };

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blockedBeacon = () => {
        stats.blocked += 1;
        notifyPreviewBlocked('sendBeacon');
        return false;
      };
      navigator.sendBeacon = blockedBeacon as Navigator['sendBeacon'];
    }
  } catch {
    // sendBeacon 在部分环境不可写；fetch/XHR 仍受保护
  }

  try {
    if (typeof XMLHttpRequest !== 'undefined') {
      const originalOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (
        this: XMLHttpRequest,
        method: string,
        url: string | URL,
        ...rest: unknown[]
      ) {
        if (!isReadOnlyMethod(method)) {
          stats.blocked += 1;
          notifyPreviewBlocked(method);
          throw new PreviewReadOnlyError(method);
        }
        return (originalOpen as (...args: unknown[]) => void).apply(this, [
          method,
          url,
          ...rest,
        ]);
      } as typeof XMLHttpRequest.prototype.open;
    }
  } catch {
    // XHR 在部分环境不可写；fetch/sendBeacon 仍受保护
  }

  try {
    if (typeof HTMLFormElement !== 'undefined' && typeof document !== 'undefined') {
      const originalSubmit = HTMLFormElement.prototype.submit;
      HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
        if (!isAllowedPreviewFormSubmission(this, null)) {
          blockForm('submit()');
          return;
        }
        formStats.allowed += 1;
        return originalSubmit.call(this);
      } as typeof HTMLFormElement.prototype.submit;

      const originalRequestSubmit = HTMLFormElement.prototype.requestSubmit;
      if (typeof originalRequestSubmit === 'function') {
        HTMLFormElement.prototype.requestSubmit = function (
          this: HTMLFormElement,
          submitter?: HTMLElement | null,
        ) {
          if (!isAllowedPreviewFormSubmission(this, submitter ?? null)) {
            blockForm('requestSubmit()');
            return;
          }
          return (
            originalRequestSubmit as (
              this: HTMLFormElement,
              submitter?: HTMLElement | null,
            ) => void
          ).call(this, submitter ?? null);
        } as typeof HTMLFormElement.prototype.requestSubmit;
      }

      const onSubmitCapture = (event: Event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;

        const submitter = (event as SubmitEvent).submitter ?? null;
        if (!isAllowedPreviewFormSubmission(form, submitter)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          blockForm('submit 事件');
          return;
        }

        formStats.allowed += 1;
      };
      document.addEventListener('submit', onSubmitCapture, true);
    }
  } catch {
    // 原生 form 保护不可用时不把页面打挂；fetch/XHR/sendBeacon 仍受保护
  }

  const handle: PreviewGuardHandle = {
    getStats: () => ({ ...stats }),
    getFormStats: () => ({ ...formStats }),
  };
  w.__ui020PreviewGuard = handle;
  return handle;
}
