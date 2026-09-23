/**
 * 复制到剪贴板，带降级方案。
 *
 * 为什么不直接 `navigator.clipboard.writeText`：
 *   异步 Clipboard API 只在**安全上下文**（https / localhost）可用。
 *   本项目很可能被部署在内网 http 环境或本地 LAN 调试，
 *   那种情况下 `navigator.clipboard` 是 undefined 或直接 reject，
 *   按钮会永久卡在"复制失败"。因此必须准备 textarea + execCommand 的降级路径。
 *
 * @returns 是否复制成功。调用方据此决定是否切换按钮状态、是否上报计数。
 */
export async function writeToClipboard(text: string): Promise<boolean> {
  // ---- 首选：异步 Clipboard API ----
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 用户拒绝授权、页面失焦等情况 —— 不直接失败，继续走降级
    }
  }

  // ---- 降级：隐藏 textarea + execCommand ----
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    // 必须留在文档流内才可选中，因此用绝对定位移出视口而不是 display:none
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);

    const selection = document.getSelection();
    const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;

    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand('copy');

    document.body.removeChild(textarea);

    // 还原用户原有的选区，避免复制操作"吃掉"用户正在选中的文本
    if (previousRange && selection) {
      selection.removeAllRanges();
      selection.addRange(previousRange);
    }

    return ok;
  } catch {
    return false;
  }
}
