-- ============================================================================
--  暗区突围 · 改枪码分享站  ——  RPC 函数 / 评分函数 / 聚合视图  (03_functions.sql)
--  执行   : psql "$DATABASE_URL" -f db/03_functions.sql   （在 01_schema.sql 之后）
-- ============================================================================

-- ============================================================ 1. 排序评分函数
-- 为什么用 SQL 函数而不是应用层计算：
--   ① 排序必须发生在数据库端，否则分页结果会错乱（先取 20 条再排序 = 错误）；
--   ② 保证 Supabase 直连客户端与 Express API 使用同一套排序口径。

-- 1.1 热度分（Hacker News 风格时间衰减）
--     点赞权重 3、复制权重 1；分母按"发布小时数 + 2"做 0.6 次幂衰减，
--     保证新方案有曝光机会，老方案不会永久霸榜。
CREATE OR REPLACE FUNCTION public.build_hot_score(
  p_likes   integer,
  p_copies  integer,
  p_created timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT round(
    (p_likes * 3 + p_copies)::numeric
    / power(
        greatest(extract(epoch FROM (now() - p_created)) / 3600.0, 0) + 2.0,
        0.6
      ),
    6
  );
$$;

COMMENT ON FUNCTION public.build_hot_score IS '热度分：点赞*3 + 复制，按小时龄做 0.6 次幂时间衰减';

-- 1.2 性价比分
--     定义：每 1 万柯恩币造价所换取的社区认可度。
--     造价越低、认可度越高 -> 分数越高。分母用 greatest(cost,1) 规避除零。
CREATE OR REPLACE FUNCTION public.build_cp_score(
  p_likes  integer,
  p_copies integer,
  p_cost   numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(
    ((p_likes * 2 + p_copies)::numeric * 10000.0) / greatest(p_cost, 1.0),
    4
  );
$$;

COMMENT ON FUNCTION public.build_cp_score IS '性价比分 = (点赞*2 + 复制) / 造价 * 10000';

-- ============================================================ 2. 鉴权辅助函数
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('moderator', 'admin')
  );
$$;

COMMENT ON FUNCTION public.is_staff IS '当前登录用户是否为版主/管理员（供 RLS 与 API 复用）';

-- ============================================================ 3. 写入型 RPC
-- 为什么用 RPC 而不是 REST PATCH：
--   likes_count = likes_count + 1 这类读改写操作若走应用层，
--   在并发下必然丢失更新（lost update）。RPC 在单条 UPDATE 语句内完成，天然原子。

-- 3.1 复制次数 +1  —— 对应 POST /api/builds/:id/copy
CREATE OR REPLACE FUNCTION public.increment_build_copies(p_build_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_copies integer;
BEGIN
  UPDATE public.builds
     SET copies_count = copies_count + 1
   WHERE id = p_build_id
     AND status = 'published'
  RETURNING copies_count INTO v_copies;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUILD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_copies;
END;
$$;

COMMENT ON FUNCTION public.increment_build_copies IS '原子递增复制次数，返回最新值；方案不存在时抛 P0002';

-- 3.2 匿名点赞（无去重）—— 对应 POST /api/builds/:id/like（未登录回退路径）
--     注意：与 3.3 互斥使用。若走本函数，则不要同时写 build_likes，
--           否则计数器会被触发器二次累加。
CREATE OR REPLACE FUNCTION public.increment_build_likes(
  p_build_id uuid,
  p_delta    integer DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_likes integer;
BEGIN
  IF p_delta NOT IN (1, -1) THEN
    RAISE EXCEPTION 'INVALID_DELTA' USING ERRCODE = '22023';
  END IF;

  UPDATE public.builds
     SET likes_count = greatest(likes_count + p_delta, 0)
   WHERE id = p_build_id
     AND status = 'published'
  RETURNING likes_count INTO v_likes;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BUILD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_likes;
END;
$$;

COMMENT ON FUNCTION public.increment_build_likes IS '匿名点赞/取消（不去重），返回最新点赞数';

-- 3.3 登录用户点赞开关（幂等）—— 对应 POST /api/builds/:id/like（已登录路径）
--     返回 (liked, likes_count)：liked=true 表示本次操作后处于"已点赞"状态。
--     likes_count 由 build_likes 上的触发器同步，本函数不直接改计数。
CREATE OR REPLACE FUNCTION public.toggle_build_like(p_build_id uuid)
RETURNS TABLE (liked boolean, likes_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_was_liked boolean;
  v_liked     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.builds b
    WHERE b.id = p_build_id AND b.status = 'published'
  ) THEN
    RAISE EXCEPTION 'BUILD_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 先尝试删除既有点赞记录
  DELETE FROM public.build_likes
   WHERE build_id = p_build_id AND user_id = v_uid
  RETURNING true INTO v_was_liked;

  IF v_was_liked THEN
    v_liked := false;                 -- 原本已点赞 -> 本次为取消
  ELSE
    INSERT INTO public.build_likes (build_id, user_id)
    VALUES (p_build_id, v_uid)
    ON CONFLICT DO NOTHING;
    v_liked := true;                  -- 原本未点赞 -> 本次为点赞
  END IF;

  RETURN QUERY
    SELECT v_liked, b.likes_count
    FROM public.builds b
    WHERE b.id = p_build_id;
END;
$$;

COMMENT ON FUNCTION public.toggle_build_like IS '登录用户点赞开关（幂等），返回 liked 与最新点赞数';

-- ============================================================ 4. 聚合视图
-- 一次性把"方案 + 枪械 + 分类中文名 + 两种评分"拼好，
-- 供列表接口与 Supabase 直连客户端复用，避免前端多次往返。
CREATE OR REPLACE VIEW public.v_builds_feed AS
SELECT
  b.id,
  b.gun_id,
  b.author_id,
  b.title,
  b.code,
  b.estimated_cost,
  b.platform,
  b.tags,
  b.description,
  b.likes_count,
  b.copies_count,
  b.comments_count,
  b.created_at,
  b.updated_at,
  g.name          AS gun_name,
  g.name_en       AS gun_name_en,
  g.icon_url      AS gun_icon_url,
  g.category      AS gun_category,
  c.name_zh       AS gun_category_name,
  public.build_hot_score(b.likes_count, b.copies_count, b.created_at) AS hot_score,
  public.build_cp_score(b.likes_count, b.copies_count, b.estimated_cost) AS cp_score
FROM public.builds b
JOIN public.guns          g ON g.id = b.gun_id
JOIN public.gun_categories c ON c.slug = g.category
WHERE b.status = 'published';

COMMENT ON VIEW public.v_builds_feed IS '方案聚合视图：含枪械信息、分类中文名与热度/性价比评分';

-- PG15+：让视图以调用者权限执行，从而继承底层表的 RLS，而非绕过它。
ALTER VIEW public.v_builds_feed SET (security_invoker = true);

-- ============================================================ 5. 便捷统计视图
-- 分类维度统计，直接支撑前端"枪械分类导航栏"上的方案数量角标。
--
-- ⚠️ 实现要点：必须用标量子查询，不能用
--      FROM gun_categories c LEFT JOIN guns g ... LEFT JOIN builds b ...
--    因为 guns 与 builds 是一对多，同时 JOIN 会产生笛卡尔放大，
--    导致 count(g.id) 被方案数量重复计数（枪械数被虚高）。
--    该缺陷已由 tests/integration.test.mjs 捕获并回归。
CREATE OR REPLACE VIEW public.v_category_stats AS
SELECT
  c.slug       AS category,
  c.name_zh    AS category_name,
  c.sort_order,
  (SELECT count(*) FROM public.guns g
    WHERE g.category = c.slug)::int AS gun_count,
  (SELECT count(*) FROM public.builds b
     JOIN public.guns g2 ON g2.id = b.gun_id
    WHERE g2.category = c.slug
      AND b.status = 'published')::int AS build_count
FROM public.gun_categories c;

ALTER VIEW public.v_category_stats SET (security_invoker = true);

-- ============================================================================
--  函数与视图层完成。
-- ============================================================================
