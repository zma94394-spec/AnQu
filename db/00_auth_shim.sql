-- ============================================================================
--  暗区突围 · 改枪码分享站  ——  auth 基础设施垫片 (00_auth_shim.sql)
--
--  ⚠️ 执行范围：仅用于【自建 PostgreSQL / 本地开发 / 集成测试】环境。
--     Supabase 环境请【跳过本文件】——Supabase 已内置 auth schema、auth.users
--     表与 auth.uid() 函数，重复执行会覆盖官方实现。
--
--  目的：让 01~04 的 SQL 脚本在非 Supabase 环境下同样可直接落地，
--        消除 README「已知限制」中"auth.uid() 依赖 Supabase"的部署约束。
--
--  执行：psql "$DATABASE_URL" -f db/00_auth_shim.sql
--        （必须在 01_schema.sql 之前）
-- ============================================================================

-- ------------------------------------------------------------------ 1. auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- ------------------------------------------------------------------ 2. auth.users
-- 与 Supabase 的关键字段保持兼容：id / email / created_at
CREATE TABLE IF NOT EXISTS auth.users (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ 3. auth.uid()
-- 与 Supabase 官方实现语义一致：从 request.jwt.claims 这个 GUC 中取 sub。
--  · PostgREST 路径：由 PostgREST 在每次请求开始时注入该 GUC
--  · Express 直连路径：由 builds.service.ts 在事务内用 set_config(..., true) 注入
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

COMMENT ON FUNCTION auth.uid() IS '返回当前请求的登录用户 ID（自建环境的 Supabase 兼容实现）';

-- ------------------------------------------------------------------ 4. 角色
-- 与 Supabase 的角色模型对齐，使 02_rls.sql 可原样执行。
--   anon          —— 未登录访问者
--   authenticated —— 已登录用户
--   service_role  —— 服务端可信角色，绕过 RLS
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN NOINHERIT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth   TO anon, authenticated, service_role;

-- 允许客户端角色读取 auth.uid()（与 Supabase 默认授权一致）
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

-- ============================================================================
--  完成。接下来按序执行：
--    01_schema.sql -> 03_functions.sql -> 02_rls.sql -> 04_seed.sql
-- ============================================================================
