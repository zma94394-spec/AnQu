-- ============================================================================
--  暗区突围 · 改枪码分享站  ——  行级安全策略 (02_rls.sql)
--  执行   : psql "$DATABASE_URL" -f db/02_rls.sql   （在 01_schema.sql 之后）
--  前提   : Supabase 环境（提供 anon / authenticated / service_role 角色与 auth.uid()）
--
--  设计要点：
--   ① 读开放、写收敛：枪械库与已发布方案对匿名用户可读，写入一律要求登录；
--   ② 行级 + 列级双重约束：RLS 管"能改哪些行"，列级 GRANT 管"能改哪些列"，
--      两者结合才能杜绝作者自行刷高 likes_count / copies_count；
--   ③ 计数器只能通过 SECURITY DEFINER 的 RPC 或触发器变更（见 03_functions.sql）。
-- ============================================================================

-- ------------------------------------------------------------------ 0. 启用 RLS
ALTER TABLE public.gun_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;

-- 注意：不要使用 FORCE ROW LEVEL SECURITY，
--       否则表属主（Express 后端使用的直连角色）也会被策略拦截，导致 RPC 失效。

-- ------------------------------------------------------------------ 1. 基础授权
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.gun_categories, public.guns, public.builds,
                public.comments, public.build_likes, public.profiles
      TO anon, authenticated;

GRANT SELECT ON public.v_builds_feed, public.v_category_stats TO anon, authenticated;

-- 函数执行权限（只暴露读写型 RPC，评分函数无需授权给客户端）
GRANT EXECUTE ON FUNCTION public.increment_build_copies(uuid)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_build_likes(uuid, int)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_build_like(uuid)           TO authenticated;

-- ------------------------------------------------------------------ 2. 列级写授权
-- 关键：先撤销整表写权限，再按列精确授予。
-- 这样即便作者命中"可更新自己方案"的 RLS 策略，也无法篡改计数列。
REVOKE INSERT, UPDATE, DELETE ON public.builds   FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.comments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.build_likes FROM anon, authenticated;

GRANT INSERT (gun_id, author_id, title, code, estimated_cost, platform, tags, description, status)
      ON public.builds TO authenticated;

GRANT UPDATE (title, code, estimated_cost, platform, tags, description, status)
      ON public.builds TO authenticated;

GRANT DELETE ON public.builds TO authenticated;

GRANT INSERT (build_id, author_id, content) ON public.comments   TO authenticated;
GRANT DELETE ON public.comments TO authenticated;

GRANT INSERT (build_id, user_id) ON public.build_likes TO authenticated;
GRANT DELETE ON public.build_likes TO authenticated;

-- ------------------------------------------------------------------ 3. 读策略
DROP POLICY IF EXISTS p_categories_read ON public.gun_categories;
CREATE POLICY p_categories_read ON public.gun_categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS p_guns_read ON public.guns;
CREATE POLICY p_guns_read ON public.guns
  FOR SELECT TO anon, authenticated USING (true);

-- 方案：已发布对所有人可见；草稿/隐藏仅作者本人与版主可见
DROP POLICY IF EXISTS p_builds_read ON public.builds;
CREATE POLICY p_builds_read ON public.builds
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    OR author_id = auth.uid()
    OR public.is_staff()
  );

DROP POLICY IF EXISTS p_comments_read ON public.comments;
CREATE POLICY p_comments_read ON public.comments
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS p_build_likes_read ON public.build_likes;
CREATE POLICY p_build_likes_read ON public.build_likes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS p_profiles_read ON public.profiles;
CREATE POLICY p_profiles_read ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);

-- ------------------------------------------------------------------ 4. 写策略：builds
-- 提交方案：author_id 必须等于当前登录用户，且初始状态只能为 draft / published
DROP POLICY IF EXISTS p_builds_insert ON public.builds;
CREATE POLICY p_builds_insert ON public.builds
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND status IN ('draft', 'published')
  );

-- 编辑方案：仅作者本人或版主；禁止把 author_id 转嫁给他人
DROP POLICY IF EXISTS p_builds_update ON public.builds;
CREATE POLICY p_builds_update ON public.builds
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff())
  WITH CHECK (author_id = auth.uid() OR public.is_staff());

-- 删除方案：仅作者本人或版主
DROP POLICY IF EXISTS p_builds_delete ON public.builds;
CREATE POLICY p_builds_delete ON public.builds
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff());

-- ------------------------------------------------------------------ 5. 写策略：comments
DROP POLICY IF EXISTS p_comments_insert ON public.comments;
CREATE POLICY p_comments_insert ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.builds b
      WHERE b.id = build_id AND b.status = 'published'
    )
  );

DROP POLICY IF EXISTS p_comments_delete ON public.comments;
CREATE POLICY p_comments_delete ON public.comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_staff());

-- ------------------------------------------------------------------ 6. 写策略：build_likes
-- 点赞记录只能由本人创建/删除；likes_count 由触发器自动同步，
-- 因此不存在"直接改计数"的旁路。
DROP POLICY IF EXISTS p_build_likes_insert ON public.build_likes;
CREATE POLICY p_build_likes_insert ON public.build_likes
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS p_build_likes_delete ON public.build_likes;
CREATE POLICY p_build_likes_delete ON public.build_likes
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ------------------------------------------------------------------ 7. 写策略：profiles
-- 用户可创建/更新自己的档案，但不得自行提升 role（列级授权已排除 role 列）
GRANT INSERT (id, nickname, avatar_url) ON public.profiles TO authenticated;
GRANT UPDATE (nickname, avatar_url)     ON public.profiles TO authenticated;

DROP POLICY IF EXISTS p_profiles_insert ON public.profiles;
CREATE POLICY p_profiles_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS p_profiles_update ON public.profiles;
CREATE POLICY p_profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_staff())
  WITH CHECK (id = auth.uid() OR public.is_staff());

-- ============================================================================
--  安全模型小结
--    · anon        ：只能读枪械库 + 已发布方案 + 评论；可调用复制计数 RPC
--    · authenticated：额外可提交/编辑/删除自己的方案、发评论、点赞（幂等）
--    · service_role / 表属主：Express 后端直连通道，绕过 RLS，用于后台与统计
-- ============================================================================
