import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Search } from 'lucide-react';

import { cn } from '../../lib/cn';

export type HomeSearchScope = 'builds' | 'guns';

interface HomeSearchProps {
  initialQuery: string;
  onSearch: (query: string, scope: HomeSearchScope) => void;
}

/**
 * 首页唯一搜索框。
 *
 * 两个范围都复用现有结果页与 q 参数语义：
 *   方案 -> /?q=...（保留已有筛选）
 *   枪械 -> /guns?q=...
 * 输入只在提交时导航，避免切范围时把用户半截输入带去另一条路由。
 */
export function HomeSearch({ initialQuery, onSearch }: HomeSearchProps) {
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<HomeSearchScope>('builds');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = query.trim();
    if (!next) {
      inputRef.current?.focus();
      return;
    }
    onSearch(next, scope);
  };

  return (
    <form role="search" aria-label="站内搜索" onSubmit={handleSubmit} className="w-full max-w-[620px]">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label="搜索范围" className="flex items-center gap-1">
          <ScopeButton active={scope === 'builds'} onClick={() => setScope('builds')}>
            方案
          </ScopeButton>
          <span aria-hidden="true" className="h-3 w-px bg-hairline" />
          <ScopeButton active={scope === 'guns'} onClick={() => setScope('guns')}>
            枪械
          </ScopeButton>
        </div>
        <p className="hidden text-[11px] text-ink-3 sm:block">回车搜索 · Ctrl K 聚焦</p>
      </div>

      <div className="home-search mt-3 flex h-[52px] items-center gap-2 pl-4 pr-1.5">
        <Search className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={scope === 'builds' ? '搜索改枪方案' : '搜索枪械'}
          placeholder={scope === 'builds' ? '搜索方案标题或关键词' : '搜索枪械名、型号或简称'}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-full min-w-0 flex-1 bg-transparent px-1 text-[15px] text-ink outline-none placeholder:text-ink-3"
        />
        <kbd
          aria-hidden="true"
          className="hidden shrink-0 rounded-[5px] border border-hairline bg-black/25 px-1.5 py-0.5 font-mono text-[10px] text-ink-3 sm:block"
        >
          Ctrl K
        </kbd>
        <button
          type="submit"
          aria-label="搜索"
          className={cn(
            'press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5',
            'text-[13px] font-semibold text-[#0d1217] transition-colors duration-200 hover:bg-accent-2',
          )}
        >
          搜索
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors duration-200',
        active ? 'bg-accent/10 text-ink' : 'text-ink-3 hover:text-ink-2',
      )}
    >
      {children}
    </button>
  );
}
