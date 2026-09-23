-- ============================================================================
--  暗区突围 · 改枪码分享站  ——  数据库架构  (01_schema.sql)
--  Target : PostgreSQL 15+  /  Supabase
--  特性   : 幂等可重复执行（IF NOT EXISTS + DO $$ 异常捕获）
--  执行   : psql "$DATABASE_URL" -f db/01_schema.sql
-- ============================================================================

-- ------------------------------------------------------------------ 0. 扩展
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- 方案标题 / 枪械名 模糊搜索
CREATE EXTENSION IF NOT EXISTS btree_gin;   -- 数组列(tags) 复合索引支持

-- ------------------------------------------------------------------ 1. 通用函数
-- 统一维护 updated_at，避免依赖应用层写入。
--
-- 关键设计：只比较「业务字段」的快照。若无条件 now()，点赞/复制导致的计数变更
-- 也会刷新 updated_at，使"方案最后更新时间"失去语义——用户会看到一篇两年前的
-- 攻略显示为"刚刚更新"，且该行会被高频点赞持续写热，加剧锁竞争。
--
-- ⚠️ 必须同时排除【生成列】，原因是一个容易踩坑的 PostgreSQL 行为：
--    在 BEFORE UPDATE 触发器中，STORED 生成列在 NEW 里是 NULL
--    （生成值在 BEFORE 触发器之后才计算），而 OLD 持有已落库的真实值。
--    因此整行快照比对必然判定"有变化"，updated_at 会被无条件刷新。
--    这里通过 pg_attribute.attgenerated 动态查出并排除，无需硬编码列名。
--
-- 需要忽略的计数列通过触发器参数传入，函数本身保持通用：
--   EXECUTE FUNCTION public.set_updated_at('likes_count', 'copies_count')
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_generated text[];
  v_exclude   text[];
  v_new       jsonb;
  v_old       jsonb;
BEGIN
  -- 动态识别本表的生成列（如 builds.code_hash）
  SELECT COALESCE(array_agg(a.attname::text), ARRAY[]::text[])
    INTO v_generated
  FROM pg_attribute a
  WHERE a.attrelid = TG_RELID
    AND a.attgenerated <> ''
    AND a.attnum > 0
    AND NOT a.attisdropped;

  v_exclude := COALESCE(TG_ARGV, ARRAY[]::text[])
               || v_generated
               || ARRAY['updated_at'];

  v_new := to_jsonb(NEW) - v_exclude;
  v_old := to_jsonb(OLD) - v_exclude;

  IF v_new IS DISTINCT FROM v_old THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at IS
  '仅在业务字段实际变更时刷新 updated_at；自动忽略生成列，并通过触发器参数忽略计数列';

-- ------------------------------------------------------------------ 2. 枚举类型
-- 说明：平台与状态取值域封闭且稳定，用 ENUM 换取类型安全与存储效率；
--      枪械分类可能随版本更新扩展（如新增"轻机枪"），故用字典表而非 ENUM。
DO $$ BEGIN
  CREATE TYPE public.build_platform AS ENUM ('mobile', 'pc', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.build_status AS ENUM ('draft', 'published', 'hidden', 'removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('user', 'moderator', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------------ 3. 字典表：枪械分类
CREATE TABLE IF NOT EXISTS public.gun_categories (
  slug        text        PRIMARY KEY,
  name_zh     text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gun_categories_slug_format CHECK (slug ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT gun_categories_name_zh_not_blank CHECK (btrim(name_zh) <> '')
);

COMMENT ON TABLE public.gun_categories IS '枪械分类字典表（突击步枪/冲锋枪/狙击枪/射手步枪/手枪/霰弹枪…）';

-- ------------------------------------------------------------------ 4. 用户档案（Supabase: 扩展 auth.users）
-- 若在非 Supabase 环境部署，请将下方 auth.users 外键替换为本地用户表。
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname    text        NOT NULL DEFAULT '匿名指挥官',
  avatar_url  text,
  role        public.user_role NOT NULL DEFAULT 'user',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS '用户档案与角色（user / moderator / admin）';

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------ 5. 基础枪械表
CREATE TABLE IF NOT EXISTS public.guns (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  name_en     text,
  slug        text        NOT NULL UNIQUE,
  category    text        NOT NULL REFERENCES public.gun_categories(slug) ON UPDATE CASCADE,
  icon_url    text,
  sort_order  integer     NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guns_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT guns_slug_format    CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
);

COMMENT ON TABLE  public.guns           IS '基础枪械表';
COMMENT ON COLUMN public.guns.category  IS '外键 -> gun_categories.slug';
COMMENT ON COLUMN public.guns.icon_url  IS '枪械图标 CDN 链接';

-- 枪械名去重（大小写不敏感）
CREATE UNIQUE INDEX IF NOT EXISTS ux_guns_name_lower ON public.guns (lower(name));
-- 分类筛选
CREATE INDEX IF NOT EXISTS ix_guns_category ON public.guns (category, sort_order);
-- 枪名模糊搜索（GET /api/guns?q=）
CREATE INDEX IF NOT EXISTS ix_guns_name_trgm ON public.guns USING gin (name gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_guns_updated_at ON public.guns;
CREATE TRIGGER trg_guns_updated_at
  BEFORE UPDATE ON public.guns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------ 6. 改枪方案表
CREATE TABLE IF NOT EXISTS public.builds (
  id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
  gun_id          uuid                NOT NULL REFERENCES public.guns(id) ON DELETE CASCADE,
  author_id       uuid                REFERENCES auth.users(id) ON DELETE SET NULL,

  title           text                NOT NULL,
  code            text                NOT NULL,
  -- 生成列：改枪码指纹，用于同枪重复方案去重 / 反爬
  code_hash       text                GENERATED ALWAYS AS (md5(code)) STORED,
  estimated_cost  numeric(12,0)       NOT NULL DEFAULT 0,
  platform        public.build_platform NOT NULL DEFAULT 'both',
  tags            text[]              NOT NULL DEFAULT '{}',
  description     text,

  likes_count     integer             NOT NULL DEFAULT 0,
  copies_count    integer             NOT NULL DEFAULT 0,
  comments_count  integer             NOT NULL DEFAULT 0,

  status          public.build_status NOT NULL DEFAULT 'published',
  created_at      timestamptz         NOT NULL DEFAULT now(),
  updated_at      timestamptz         NOT NULL DEFAULT now(),

  CONSTRAINT builds_title_len       CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT builds_code_len        CHECK (char_length(code) BETWEEN 8 AND 2048),
  CONSTRAINT builds_code_no_space   CHECK (code !~ '\s'),
  CONSTRAINT builds_cost_non_neg    CHECK (estimated_cost >= 0),
  CONSTRAINT builds_tags_card       CHECK (cardinality(tags) <= 8),
  CONSTRAINT builds_counters_non_neg CHECK (
    likes_count >= 0 AND copies_count >= 0 AND comments_count >= 0
  )
);

COMMENT ON TABLE  public.builds                 IS '改枪方案表';
COMMENT ON COLUMN public.builds.code            IS '改枪码字符串（游戏内一键导入）';
COMMENT ON COLUMN public.builds.estimated_cost  IS '预估造价，单位：柯恩币';
COMMENT ON COLUMN public.builds.platform        IS 'mobile=手游 / pc=端游《无限》/ both=通用';
COMMENT ON COLUMN public.builds.tags            IS '标签数组，如 {性价比,低后坐,腰射}';
COMMENT ON COLUMN public.builds.description     IS '方案说明 + 建议子弹类型';

-- 排序 / 筛选核心索引（覆盖 GET /api/builds 的全部排序路径）
CREATE INDEX IF NOT EXISTS ix_builds_created       ON public.builds (status, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_builds_likes         ON public.builds (status, likes_count DESC);
CREATE INDEX IF NOT EXISTS ix_builds_cost          ON public.builds (status, estimated_cost);
CREATE INDEX IF NOT EXISTS ix_builds_gun_created   ON public.builds (gun_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_builds_gun_likes     ON public.builds (gun_id, likes_count DESC);
CREATE INDEX IF NOT EXISTS ix_builds_gun_platform  ON public.builds (gun_id, platform, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_builds_tags          ON public.builds USING gin (tags);
CREATE INDEX IF NOT EXISTS ix_builds_title_trgm    ON public.builds USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_builds_author        ON public.builds (author_id, created_at DESC);
-- 去重索引（非唯一）：用于查询同枪是否已存在相同改枪码
CREATE INDEX IF NOT EXISTS ix_builds_gun_codehash  ON public.builds (gun_id, code_hash);
-- 若需严格禁止"同枪同码"重复提交，改为唯一索引（注意需先清理历史重复数据）：
-- CREATE UNIQUE INDEX IF NOT EXISTS ux_builds_gun_codehash ON public.builds (gun_id, code_hash);

DROP TRIGGER IF EXISTS trg_builds_updated_at ON public.builds;
CREATE TRIGGER trg_builds_updated_at
  BEFORE UPDATE ON public.builds
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at('likes_count', 'copies_count', 'comments_count');

-- ------------------------------------------------------------------ 7. 评论表
CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id    uuid        NOT NULL REFERENCES public.builds(id) ON DELETE CASCADE,
  author_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  content     text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comments_content_len CHECK (char_length(btrim(content)) BETWEEN 1 AND 500)
);

COMMENT ON TABLE public.comments IS '改枪方案评论表';

CREATE INDEX IF NOT EXISTS ix_comments_build_created ON public.comments (build_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_comments_author        ON public.comments (author_id);

-- ------------------------------------------------------------------ 8. 点赞关系表（去重 + 幂等）
-- 作用：① 同一用户对同一方案只能点赞一次 ② 支撑 RLS 层面的点赞鉴权
--       likes_count 由触发器自动同步，杜绝计数漂移
CREATE TABLE IF NOT EXISTS public.build_likes (
  build_id    uuid        NOT NULL REFERENCES public.builds(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (build_id, user_id)
);

COMMENT ON TABLE public.build_likes IS '点赞关系表，PK(build_id,user_id) 保证幂等';

CREATE INDEX IF NOT EXISTS ix_build_likes_user ON public.build_likes (user_id, created_at DESC);

-- ------------------------------------------------------------------ 9. 计数器同步触发器
-- 说明：函数使用 SECURITY DEFINER，以便在 RLS 与列级授权收紧后仍能更新计数列。

-- 9.1 点赞数同步
CREATE OR REPLACE FUNCTION public.sync_build_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.builds SET likes_count = likes_count + 1 WHERE id = NEW.build_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.builds SET likes_count = greatest(likes_count - 1, 0) WHERE id = OLD.build_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_build_likes_count ON public.build_likes;
CREATE TRIGGER trg_build_likes_count
  AFTER INSERT OR DELETE ON public.build_likes
  FOR EACH ROW EXECUTE FUNCTION public.sync_build_likes_count();

-- 9.2 评论数同步
CREATE OR REPLACE FUNCTION public.sync_build_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.builds SET comments_count = comments_count + 1 WHERE id = NEW.build_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.builds SET comments_count = greatest(comments_count - 1, 0) WHERE id = OLD.build_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_build_comments_count ON public.comments;
CREATE TRIGGER trg_build_comments_count
  AFTER INSERT OR DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_build_comments_count();

-- 9.3 计数列防篡改
-- 防止方案作者经由 PostgREST/直连 UPDATE 接口刷高自己的 likes_count / copies_count。
-- 判定依据：触发器的 effective role（current_user）。
--   · 数据库表属主 / service_role  -> 可信写入通道（同步触发器、后台运维），放行
--   · anon / authenticated（PostgREST 客户端）-> 计数列强制回滚为旧值
CREATE OR REPLACE FUNCTION public.protect_build_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table_owner name;
BEGIN
  SELECT c.relowner::regrole::name INTO v_table_owner
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'builds';

  IF current_user = v_table_owner
     OR pg_has_role(current_user, 'service_role', 'member') THEN
    RETURN NEW;
  END IF;

  NEW.likes_count    := OLD.likes_count;
  NEW.copies_count   := OLD.copies_count;
  NEW.comments_count := OLD.comments_count;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_builds_protect_counters ON public.builds;
CREATE TRIGGER trg_builds_protect_counters
  BEFORE UPDATE ON public.builds
  FOR EACH ROW EXECUTE FUNCTION public.protect_build_counters();

-- ============================================================================
--  Schema 完成。下一步执行：
--    03_functions.sql  ->  02_rls.sql  ->  04_seed.sql
-- ============================================================================
