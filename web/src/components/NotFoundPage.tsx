import { Link } from 'react-router-dom';
import { PackageOpen } from 'lucide-react';

import { cn } from '../lib/cn';
import { EASE } from '../lib/styles';

export interface NotFoundPageProps {
  /** 返回链接的目标，默认回首页 */
  backTo?: string;
  /** 返回链接文案，默认「回到改枪库首页」 */
  backLabel?: string;
  /** 说明文案。枪械详情用它区分"路径错了"和"没有这把枪" */
  description?: string;
}

/**
 * 404 兜底页。
 *
 * 从 `App.tsx` 提出来是因为 `/weapons/:slug` 也要用 ——
 * 但那里的原因不是"地址失效"，而是"字典里没有这把枪"，
 * 措辞必须能分开，所以留了 `description` 入口。
 */
export function NotFoundPage({
  backTo = '/',
  backLabel = '回到改枪库首页',
  description = '你访问的地址没有对应的内容，可能是链接已经失效。',
}: NotFoundPageProps) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-32 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-glass">
        <PackageOpen className="h-8 w-8 text-ink-3" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.026em] text-ink">页面不存在</h1>
      <p className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{description}</p>
      <Link
        to={backTo}
        className={cn(
          'press mt-7 rounded-chip bg-accent px-5 py-2.5 text-[13px] font-semibold text-black',
          `transition-all duration-300 ${EASE} hover:bg-accent-2`,
        )}
      >
        {backLabel}
      </Link>
    </main>
  );
}
