import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  CircleAlert,
  Hash,
  Info,
  LayoutGrid,
  Loader2,
  Monitor,
  Plus,
  Search,
  Smartphone,
  Target,
} from 'lucide-react';

import {
  ApiError,
  USE_MOCK,
  createBuild,
  isPreviewReadOnly,
  isPreviewReadOnlyError,
  notifyPreviewBlocked,
  PREVIEW_READ_ONLY_MESSAGE,
  submitViaLegacyBuildsEndpoint,
} from '../lib/apiPublic';
import { cn } from '../lib/cn';
import { formatCoins } from '../lib/format';
import {
  EASE,
  FIELD_LABEL_CLASS,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../lib/styles';
import {
  EMPTY_FORM,
  FIELD_ORDER,
  toCreateBuildInput,
  validateField,
  validateForm,
} from '../lib/validation';
import type { FieldErrors, PublishFormValues } from '../lib/validation';
import { TAG_MAX_COUNT, TAG_VOCABULARY } from '../types/ui';
import type { BuildDTO, GunDTO, Platform, SubmissionQueueReceipt, ValidationIssue } from '../types/api';
import { ModalShell } from './ModalShell';

export interface PublishDialogProps {
  /** 枪械字典，来自 App 已加载的 GET /api/guns，避免弹窗内重复请求 */
  guns: GunDTO[];
  /** 从枪械详情打开时预选的枪械 id */
  initialGunId?: string | null;
  onClose: () => void;
  onCreated: (build: BuildDTO) => void;
}

const PLATFORM_OPTIONS: Array<{ value: Platform; label: string; icon: typeof Smartphone }> = [
  { value: 'mobile', label: '手游', icon: Smartphone },
  { value: 'pc', label: 'PC端游', icon: Monitor },
  { value: 'both', label: '全平台', icon: LayoutGrid },
];

/**
 * 发布方案弹窗。
 *
 * 由父组件**条件渲染**（`{open && <PublishDialog/>}`），
 * 因此每次打开都是全新挂载 —— 表单状态天然重置，不需要额外的 reset 逻辑。
 */
export function PublishDialog({ guns, initialGunId, onClose, onCreated }: PublishDialogProps) {
  const [values, setValues] = useState<PublishFormValues>(() => ({
    ...EMPTY_FORM,
    gun_id: initialGunId ?? '',
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof PublishFormValues, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [customTag, setCustomTag] = useState('');
  /** 真实后端下旧入口只做排队；null = 还没提交过 */
  const [queued, setQueued] = useState<SubmissionQueueReceipt | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  /* 弹窗通用行为（Esc 关闭、背景滚动锁定、Tab 焦点陷阱、首字段聚焦）
     由 <ModalShell> 统一提供，这里不再重复实现 ——
     两份实现必然漂移，而键盘可访问性是最先破的那一环。 */

  /* ------------------------------------------------------ 字段更新 */

  /**
   * 统一的写入入口：更新值，并对「已触碰过」的字段重校验。
   *
   * 刻意**不在 setValues 的更新函数里调 setErrors** ——
   * React 严格模式下更新函数会被调用两次，在里面做副作用不可靠。
   * 这里直接用闭包里的 `values` 计算新值，语义明确。
   */
  const applyValues = useCallback(
    (next: PublishFormValues, fieldsToValidate: Array<keyof PublishFormValues>) => {
      setValues(next);
      setErrors((prev) => {
        const updated = { ...prev };
        for (const field of fieldsToValidate) {
          // 未触碰过的字段不报错，避免用户还没填就被标红
          if (!touched[field]) continue;
          const message = validateField(field, next);
          if (message === undefined) delete updated[field];
          else updated[field] = message;
        }
        return updated;
      });
    },
    [touched],
  );

  const setField = useCallback(
    <K extends keyof PublishFormValues>(field: K, value: PublishFormValues[K]) => {
      applyValues({ ...values, [field]: value }, [field]);
    },
    [applyValues, values],
  );

  /** 失焦时强制校验该字段（即使之前没触碰过） */
  const markTouched = useCallback(
    (field: keyof PublishFormValues) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      setErrors((prev) => {
        const updated = { ...prev };
        const message = validateField(field, values);
        if (message === undefined) delete updated[field];
        else updated[field] = message;
        return updated;
      });
    },
    [values],
  );

  /* ---------------------------------------------------------- 标签 */

  const toggleTag = useCallback(
    (tag: string) => {
      const exists = values.tags.includes(tag);
      if (!exists && values.tags.length >= TAG_MAX_COUNT) return;

      const tags = exists ? values.tags.filter((t) => t !== tag) : [...values.tags, tag];
      // 必须把「计算后的新值」传给校验 —— 若沿用旧的 values，
      // 标签错误提示会滞后一次点击才更新
      applyValues({ ...values, tags }, ['tags']);
      setTouched((prev) => ({ ...prev, tags: true }));
    },
    [applyValues, values],
  );

  const addCustomTag = useCallback(() => {
    const tag = customTag.trim();
    if (tag.length === 0) return;

    if (values.tags.includes(tag) || values.tags.length >= TAG_MAX_COUNT) {
      setCustomTag('');
      return;
    }

    applyValues({ ...values, tags: [...values.tags, tag] }, ['tags']);
    setTouched((prev) => ({ ...prev, tags: true }));
    setCustomTag('');
  }, [applyValues, customTag, values]);

  /* ---------------------------------------------------------- 提交 */

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (submitting) return;

      if (isPreviewReadOnly()) {
        notifyPreviewBlocked('投稿');
        setSubmitError(PREVIEW_READ_ONLY_MESSAGE);
        return;
      }

      const nextErrors = validateForm(values);
      setErrors(nextErrors);
      setTouched(
        Object.fromEntries(FIELD_ORDER.map((f) => [f, true])) as Partial<
          Record<keyof PublishFormValues, boolean>
        >,
      );

      if (Object.keys(nextErrors).length > 0) {
        setSubmitError('还有字段未填写正确，请检查标红项。');
        // 把焦点移到第一个出错的字段，键盘用户不用自己找
        const firstBadField = FIELD_ORDER.find((f) => nextErrors[f] !== undefined);
        if (firstBadField) {
          panelRef.current
            ?.querySelector<HTMLElement>(`[data-field="${firstBadField}"]`)
            ?.focus();
        }
        return;
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        if (USE_MOCK) {
          // 演示数据没有后端也没有审核台，仍旧把内容插进本地列表 —— 这是 MOCK 的既有语义。
          onCreated(await createBuild(toCreateBuildInput(values)));
          return;
        }
        // 真实后端：旧入口自 P5D-B 起只做排队（202），不再产出 published 方案，
        // 所以这里不调用 onCreated（父组件的"发布成功/已加入改枪库"提示在新语义下是假话）。
        setQueued(await submitViaLegacyBuildsEndpoint(toCreateBuildInput(values)));
      } catch (err) {
        if (isPreviewReadOnlyError(err)) {
          setSubmitError(err.message);
        } else if (err instanceof ApiError) {
          // 服务端校验失败：把字段级 details 回填到对应输入框
          if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
            const serverErrors: FieldErrors = {};
            for (const issue of err.details as ValidationIssue[]) {
              const field = issue.field as keyof PublishFormValues;
              if (FIELD_ORDER.includes(field)) serverErrors[field] = issue.message;
            }
            setErrors((prev) => ({ ...prev, ...serverErrors }));
            setSubmitError('服务端校验未通过，请检查标红项。');
          } else if (err.code === 'DUPLICATE_BUILD_CODE') {
            setErrors((prev) => ({ ...prev, code: err.message }));
            setSubmitError('该枪械下已存在完全相同的改枪码，请确认是否重复提交。');
          } else if (err.code === 'INVALID_GUN_ID') {
            setErrors((prev) => ({ ...prev, gun_id: err.message }));
            setSubmitError(err.message);
          } else if (err.code === 'AUTH_REQUIRED') {
            setSubmitError('投稿需要先登录：待审的内容必须能追溯到提交人，否则无法回话与追责。');
          } else {
            setSubmitError(err.message);
          }
        } else {
          setSubmitError('提交失败，请稍后重试。');
        }
      } finally {
        setSubmitting(false);
      }
    },
    [onCreated, submitting, values],
  );

  const costPreview = useMemo(() => {
    const raw = values.estimated_cost.trim();
    if (!/^\d+$/.test(raw)) return null;
    return formatCoins(Number(raw));
  }, [values.estimated_cost]);

  const errorList = FIELD_ORDER.map((field) => errors[field]).filter(
    (message): message is string => message !== undefined,
  );

  /* ---------------------------------------------------------- 渲染 */

  // 排队成功后的诚实回执：只说"等待审核 / 尚未验证"，不出现发布、已验证、推荐这类结论。
  if (queued) {
    return (
      <ModalShell
        title="已进入人工审核队列"
        description="审核通过之前，这条内容不会出现在方案库或热门榜；能否在客户端导入仍未验证。"
        icon={Info}
        onClose={onClose}
        panelRef={panelRef}
        variant="drawer"
        footer={
          <button type="button" onClick={onClose} className={primaryButtonClass()}>知道了</button>
        }
      >
        <div className="space-y-3 text-sm leading-relaxed text-ink-2">
          <p className="break-all font-mono text-xs text-ink-1">{queued.submission.code}</p>
          <dl className="grid gap-1 text-xs text-ink-3 sm:grid-cols-2">
            <div><dt className="inline">审核状态：</dt><dd className="inline">等待人工审核</dd></div>
            <div><dt className="inline">客户端验证：</dt><dd className="inline">尚未验证</dd></div>
            <div><dt className="inline">公开库：</dt><dd className="inline">未入库</dd></div>
            <div><dt className="inline">跨区服兼容：</dt><dd className="inline">{queued.submission.cross_server_compatibility}（本站未测）</dd></div>
          </dl>
          {queued.duplicate
            && <p className="text-xs text-ink-3">这串字节你之前已经投过，未重复入队。</p>}
          {queued.next_step && <p className="text-xs text-ink-3">{queued.next_step}</p>}
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={USE_MOCK ? '投稿方案（演示）' : '投稿方案（先审核后公开）'}
      description="改枪码请从游戏内「改枪 → 分享」完整复制，不要手动输入以免出错。"
      icon={Target}
      busy={submitting}
      onClose={onClose}
      panelRef={panelRef}
      variant="drawer"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className={secondaryButtonClass()}>
            取消
          </button>

          {/* 按钮在 footer 里，通过 form 属性关联到内容区的表单 */}
          <button type="submit" form="publish-form" disabled={submitting} className={primaryButtonClass()}>
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                提交中…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                {USE_MOCK ? '确认发布' : '提交到人工审核'}
              </>
            )}
          </button>
        </>
      }
    >
      <form id="publish-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* ---------------------------------------- 枪械 */}
        <Field label="枪械" required error={errors.gun_id} hint="支持按名称或分类搜索">
          <GunPicker
            guns={guns}
            value={values.gun_id}
            invalid={Boolean(errors.gun_id)}
            onSelect={(gunId) => setField('gun_id', gunId)}
            onBlur={() => markTouched('gun_id')}
          />
        </Field>

        {/* ---------------------------------------- 标题 */}
        <Field
          label="方案标题"
          required
          error={errors.title}
          hint={`${values.title.trim().length}/80`}
        >
          <input
            data-field="title"
            type="text"
            value={values.title}
            onChange={(e) => setField('title', e.target.value)}
            onBlur={() => markTouched('title')}
            maxLength={120}
            placeholder="例如：【S4开荒】平民极简低后坐AK74N"
            className={inputClass(Boolean(errors.title))}
          />
        </Field>

        {/* ---------------------------------------- 改枪码 */}
        <Field
          label="改枪码"
          required
          error={errors.code}
          hint={`${values.code.trim().length}/2048`}
        >
          <textarea
            data-field="code"
            value={values.code}
            onChange={(e) => setField('code', e.target.value)}
            onBlur={() => markTouched('code')}
            rows={2}
            spellCheck={false}
            placeholder="粘贴游戏内复制的改枪码（8~2048 位可打印字符，不含空格）"
            className={cn(inputClass(Boolean(errors.code)), 'resize-y font-mono text-[13px]')}
          />
        </Field>

        {/* ---------------------------------------- 造价 + 平台 */}
        <div className="grid grid-cols-1 gap-4">
          <Field label="预估造价" required error={errors.estimated_cost}>
            <div className="relative">
              <input
                data-field="estimated_cost"
                type="text"
                inputMode="numeric"
                value={values.estimated_cost}
                onChange={(e) =>
                  // 只保留数字，避免用户粘贴 "32,000" 或 "32000 柯恩币" 后报错
                  setField('estimated_cost', e.target.value.replace(/[^\d]/g, ''))
                }
                onBlur={() => markTouched('estimated_cost')}
                placeholder="32000"
                className={cn(inputClass(Boolean(errors.estimated_cost)), 'pr-16 font-mono')}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-3">
                柯恩币
              </span>
            </div>
            {costPreview && (
              <p className="mt-1.5 text-[11px] text-accent">卡片将显示 ~{costPreview}</p>
            )}
          </Field>

          <Field label="适用平台" required>
            {/* iOS 分段控件 */}
            <div className="flex items-center gap-0.5 rounded-control bg-black/25 p-1">
              {PLATFORM_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = values.platform === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setField('platform', option.value)}
                    aria-pressed={active}
                    className={cn(
                      'press flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-control px-2 py-2',
                      'text-[12px] font-medium',
                      `transition-all duration-300 ${EASE}`,
                      active
                        ? 'bg-glass-3 text-ink shadow-[0_2px_8px_rgb(0_0_0_/_0.28)]'
                        : 'text-ink-2 hover:text-ink',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>

        <details className="rounded-hud border border-hairline px-3.5 py-2.5">
          <summary className="cursor-pointer list-none text-[12px] font-medium text-ink-2">
            更多信息（选填）：标签与方案说明
          </summary>

          <div className="mt-4 space-y-4">
        {/* ---------------------------------------- 标签 */}
        <Field label="标签" error={errors.tags} hint={`${values.tags.length}/${TAG_MAX_COUNT}`}>
          <div className="flex flex-wrap gap-1.5">
            {TAG_VOCABULARY.map((tag) => {
              const active = values.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  aria-pressed={active}
                  className={cn(
                    'press rounded-hud border px-2.5 py-1 text-[11px] font-medium',
                    `transition-colors duration-200 ${EASE}`,
                    active
                      ? 'border-accent-line bg-accent/[0.1] text-ink'
                      : 'border-hairline bg-transparent text-ink-2 hover:border-hairline-2 hover:text-ink',
                  )}
                >
                  #{tag}
                </button>
              );
            })}
          </div>

          {/* 自定义标签：后端 tags 只校验长度与个数，未限制词表，因此允许自由输入 */}
          <div className="mt-2.5 flex gap-2">
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomTag();
                }
              }}
              maxLength={16}
              placeholder="自定义标签，回车添加"
              className={cn(inputClass(), 'h-9 py-0 text-[13px]')}
            />
            <button
              type="button"
              onClick={addCustomTag}
              disabled={values.tags.length >= TAG_MAX_COUNT}
              aria-label="添加标签"
              className={cn(
                'press grid h-9 w-9 shrink-0 place-items-center rounded-control bg-glass text-ink-2',
                `transition-all duration-300 ${EASE} hover:bg-glass-2 hover:text-ink`,
                'disabled:cursor-not-allowed disabled:opacity-40',
              )}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {values.tags.length > 0 && (
            <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-ink-3">
              <Hash className="h-3 w-3" aria-hidden="true" />
              已选：{values.tags.join('、')}
            </p>
          )}
        </Field>

        {/* ---------------------------------------- 说明 */}
        <Field
          label="方案说明"
          error={errors.description}
          hint={`${values.description.length}/2000`}
        >
          <textarea
            data-field="description"
            value={values.description}
            onChange={(e) => setField('description', e.target.value)}
            onBlur={() => markTouched('description')}
            rows={4}
            placeholder={
              '改装思路、手感评价，以及最重要的——建议子弹类型。\n例如：轻型握把 + 基础消音，后坐力极好控制。建议子弹：5.45×39 PP 或 BP。'
            }
            className={cn(inputClass(Boolean(errors.description)), 'resize-y leading-relaxed')}
          />
        </Field>
          </div>
        </details>

        {/* ---------------------------------------- 错误汇总 */}
        {(submitError || errorList.length > 0) && (
          <div
            role="alert"
            className="flex gap-2.5 rounded-panel border border-danger/30 bg-danger/8 px-3.5 py-3"
          >
            <CircleAlert className="mt-px h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
            <div className="min-w-0 text-[12px] leading-relaxed">
              <p className="font-semibold text-ink">{submitError ?? '请修正以下问题：'}</p>
              {errorList.length > 0 && (
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-ink-2">
                  {errorList.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-3">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          点赞与复制由系统统计，不可填写。演示模式只写本地演示数据；真实后端提交后先进入
          人工审核队列，审核通过前不会公开。
        </p>
      </form>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ 子组件 */

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}

function Field({ label, required, error, hint, children }: FieldProps) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <label className={cn(FIELD_LABEL_CLASS, 'mb-0')}>
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        {hint && <span className="font-mono text-[10px] text-ink-3">{hint}</span>}
      </div>
      {children}
      {error && <p className="mt-1.5 text-[12px] font-medium text-danger">{error}</p>}
    </div>
  );
}

interface GunPickerProps {
  guns: GunDTO[];
  value: string;
  invalid: boolean;
  onSelect: (gunId: string) => void;
  onBlur: () => void;
}

/**
 * 枪械选择器。
 *
 * 没有做成"输入框 + 联想"那种 combobox —— 那种模式要同时管理
 * 「输入的是搜索词还是已选值」，边界情况多且容易出错。
 * 这里用「按钮展开面板」：语义明确，键盘可达，实现可控。
 */
function GunPicker({ guns, value, invalid, onSelect, onBlur }: GunPickerProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = guns.find((gun) => gun.id === value) ?? null;

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (kw.length === 0) return guns;
    return guns.filter(
      (gun) =>
        gun.name.toLowerCase().includes(kw) ||
        (gun.name_en ?? '').toLowerCase().includes(kw) ||
        gun.category_name.includes(kw),
    );
  }, [guns, keyword]);

  // 点击外部收起
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        onBlur();
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, onBlur]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-field="gun_id"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-control border bg-black/25 px-3.5 py-2.5',
          'text-left text-[14px]',
          `transition-all duration-300 ${EASE} focus:outline-none`,
          invalid
            ? 'border-danger/60 focus:border-danger'
            : 'border-hairline hover:border-hairline-2 focus:border-hairline-2',
        )}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-mono font-semibold text-accent">{selected.name}</span>
            <span className="truncate text-[11px] text-ink-3">{selected.category_name}</span>
          </span>
        ) : (
          <span className="text-ink-3">请选择枪械</span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-ink-3 transition-transform duration-300',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className={cn(
            'animate-dropdown-in absolute left-0 right-0 top-full z-10 mt-2',
            'overflow-hidden rounded-panel border border-hairline-2 bg-[rgb(28_28_32_/_0.9)]',
            'shadow-[0_20px_50px_-12px_rgb(0_0_0_/_0.8)] backdrop-blur-2xl backdrop-saturate-150',
          )}
        >
          <div className="relative border-b border-hairline p-2.5">
            <Search
              className="pointer-events-none absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-3"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索枪械名称或分类…"
              className="h-9 w-full rounded-[10px] bg-black/30 pl-9 pr-3 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </div>

          <ul role="listbox" className="max-h-60 overflow-y-auto p-1.5">
            {filtered.length === 0 && (
              /* 优雅的无数据空状态：给出"下一步该做什么"而不是只说没有 */
              <li className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                <Search className="h-6 w-6 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
                <p className="text-[13px] font-medium text-ink-2">没有匹配的枪械</p>
                <p className="text-[11px] leading-relaxed text-ink-3">
                  换个关键字试试，或先切换到「全部」分类查看完整枪械库。
                </p>
              </li>
            )}
            {filtered.map((gun) => (
              <li key={gun.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={gun.id === value}
                  onClick={() => {
                    onSelect(gun.id);
                    setOpen(false);
                    setKeyword('');
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left',
                    'text-[13px]',
                    `transition-colors duration-200 ${EASE}`,
                    gun.id === value
                      ? 'bg-accent/18 text-accent'
                      : 'text-ink-2 hover:bg-glass hover:text-ink',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-mono font-semibold">{gun.name}</span>
                    <span className="truncate text-[11px] text-ink-3">{gun.category_name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-ink-3">
                    {gun.build_count} 方案
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
