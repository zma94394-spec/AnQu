/**
 * 枪谱品牌标记：一张折角「谱页」+ 三行记录线。
 *
 * 原创几何符号，刻意避开准星/十字线这类射击模板；
 * 单色描边，16px 下仍能读出轮廓。颜色继承 currentColor。
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <path
        d="M8 6h12l4 4v16H8V6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M20 6v4h4M12 14h8M12 18h8M12 22h5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
