import { useCallback, useRef, useState } from 'react';

import { likeBuild } from '../lib/api';

export interface UseLikeBuildParams {
  buildId: string;
  likesCount: number;
  onPatch: (id: string, patch: { likes_count: number }) => void;
}

export interface UseLikeBuildResult {
  /** 当前用户是否已点赞。未登录时后端恒返回 true（仅累加语义） */
  liked: boolean;
  pending: boolean;
  failed: boolean;
  like: () => Promise<void>;
}

/**
 * 点赞交互，带乐观更新与失败回滚。
 *
 * 与 `useCopyCode` 抽出来的理由相同：列表卡片和详情页都要用，
 * 而"先 +1、以服务端返回值为准、失败回滚"这套逻辑只要有一处写错，
 * 就会出现"点了数字不动"或"数字虚高不回落"的问题。
 */
export function useLikeBuild({
  buildId,
  likesCount,
  onPatch,
}: UseLikeBuildParams): UseLikeBuildResult {
  const [liked, setLiked] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const likesRef = useRef(likesCount);
  likesRef.current = likesCount;

  const like = useCallback(async () => {
    if (pending) return;

    setPending(true);
    setFailed(false);

    const previousLikes = likesRef.current;
    // 乐观更新：先加 1，失败再回滚。点赞是高频操作，等接口返回再变会显得迟钝
    onPatch(buildId, { likes_count: previousLikes + 1 });

    try {
      const result = await likeBuild(buildId);
      // 以服务端返回值为准 —— 可能因并发或幂等开关而与本地推算不同
      onPatch(buildId, { likes_count: result.likes_count });
      setLiked(result.liked);
    } catch {
      onPatch(buildId, { likes_count: previousLikes });
      setFailed(true);
    } finally {
      setPending(false);
    }
  }, [buildId, onPatch, pending]);

  return { liked, pending, failed, like };
}
