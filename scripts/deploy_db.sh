#!/usr/bin/env bash
# ============================================================================
#  暗区突围 · 改枪码分享站  ——  生产数据库一键上线
#
#  用法：
#    bash scripts/deploy_db.sh              # 交互式，会二次确认
#    bash scripts/deploy_db.sh --yes        # CI 中跳过确认
#
#  依赖：psql（postgresql-client）、npx（node）
#
#  ⚠️ 执行顺序是本脚本存在的**唯一理由**，不要凭直觉调整：
#
#     01_schema.sql  ->  03_functions.sql  ->  02_rls.sql  ->  04_seed.sql
#                         ^^^^^^^^^^^^^^^      ^^^^^^^^^^^
#                         函数必须先于 RLS
#
#  因为 02_rls.sql 里引用了 03_functions.sql 定义的函数（共 10 处）：
#    · public.is_staff()                × 7   （管理员/版主的越权策略）
#    · public.increment_build_copies()  × 1
#    · public.increment_build_likes()   × 1
#    · public.toggle_build_like()       × 1
#  若按 01 → 02 → 03 执行，会在 02 直接报
#    ERROR: function public.is_staff() does not exist
#  且因为 RLS 是"部分创建成功"，排查起来比彻底失败更麻烦。
#
#  另外：生产 Supabase 不要执行 00_auth_shim.sql。
#  那是给自建 PostgreSQL 造 auth schema 与 anon/authenticated/service_role
#  角色的垫片；Supabase 上这些已存在，重复执行会干扰平台内置对象。
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# ---------------------------------------------------------------- 参数
ASSUME_YES=0
for arg in "$@"; do
  case "${arg}" in
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help)
      sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "未知参数：${arg}" >&2
      exit 2
      ;;
  esac
done

# ---------------------------------------------------------------- 前置检查
# 加载 .env（如果存在），让 DATABASE_URL / DIRECT_URL 自动可用
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  echo "已加载 .env"
fi

# dotenv 允许值带引号（DATABASE_URL="postgresql://..."），
# 但 shell 的 `source` **不会**剥掉它们 —— 直接拼进连接串会得到
# postgresql://"..."@host 这种非法值，报错还很难看懂。
# 必须显式去掉首尾引号。
strip_quotes() {
  local v="$1"
  v="${v%\"}"; v="${v#\"}"
  v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

# DDL 走直连/会话池。连接池的事务模式对 DDL 支持不完整，
# 且 schema 内省依赖会话态。
PSQL_URL="$(strip_quotes "${DIRECT_URL:-${DATABASE_URL:-}}")"

if [[ -z "${PSQL_URL}" ]]; then
  echo "❌ 未设置 DIRECT_URL 或 DATABASE_URL，无法连接数据库。" >&2
  echo "   请复制 .env.example 为 .env 并填入 Supabase 连接串。" >&2
  exit 1
fi

# 没有 psql 时自动改用 Node 执行器（同样按正确顺序、逐文件事务）。
# 这样在 Windows / 精简容器里也能跑，不必额外装 postgresql-client。
if ! command -v psql >/dev/null 2>&1; then
  echo "ℹ️  未找到 psql，改用 Node 迁移执行器（scripts/apply_migrations.mts）"
  if [[ "${ASSUME_YES}" -eq 1 ]]; then
    exec node --import tsx scripts/apply_migrations.mts --yes
  fi
  exec node --import tsx scripts/apply_migrations.mts
fi

# 从连接串里提取 host 用于展示，绝不回显密码
SAFE_TARGET="$(printf '%s' "${PSQL_URL}" | sed -E 's#://[^:]+:[^@]+@#://***:***@#')"

echo "================================================================"
echo " 目标数据库：${SAFE_TARGET}"
echo " 执行顺序  ：01_schema -> 03_functions -> 02_rls -> 04_seed"
echo "================================================================"

if [[ "${ASSUME_YES}" -ne 1 ]]; then
  echo
  echo "⚠️  该操作会创建/修改生产数据库对象，并写入种子数据。"
  read -r -p "确认继续？输入 yes 继续：" reply
  if [[ "${reply}" != "yes" ]]; then
    echo "已取消。"
    exit 0
  fi
fi

# ---------------------------------------------------------------- 执行
# --single-transaction：任一文件失败则整体回滚，避免留下"半套 schema"。
#                       本项目未使用 CREATE INDEX CONCURRENTLY（它不支持事务），
#                       因此整体包一个事务是安全的。
# ON_ERROR_STOP=1      ：psql 默认遇错继续执行，会把一次失败拖成一片混乱的报错。
run_sql() {
  local file="$1"
  echo
  echo ">>> 执行 ${file}"
  psql "${PSQL_URL}" \
    -v ON_ERROR_STOP=1 \
    --single-transaction \
    --quiet \
    -f "${file}"
  echo "    ✓ ${file} 完成"
}

run_sql db/01_schema.sql
run_sql db/03_functions.sql
run_sql db/02_rls.sql
run_sql db/04_seed.sql

# ---------------------------------------------------------------- 校验
echo
echo ">>> 校验对象数量"
psql "${PSQL_URL}" -v ON_ERROR_STOP=1 --quiet -c "
  SELECT
    (SELECT count(*) FROM public.gun_categories)                        AS categories,
    (SELECT count(*) FROM public.guns)                                  AS guns,
    (SELECT count(*) FROM public.builds)                                AS builds,
    (SELECT count(*) FROM public.comments)                              AS comments,
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public')      AS rls_policies,
    (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal)            AS triggers;
"

echo ">>> 校验 RLS 是否真的开启（relrowsecurity 必须全为 t）"
psql "${PSQL_URL}" -v ON_ERROR_STOP=1 --quiet -c "
  SELECT relname, relrowsecurity
  FROM pg_class
  WHERE relnamespace = 'public'::regnamespace
    AND relkind = 'r'
    AND relname IN ('guns','builds','comments','build_likes','profiles','gun_categories')
  ORDER BY relname;
"

# ---------------------------------------------------------------- Prisma
echo
echo ">>> 对齐 Prisma 模型（prisma db pull）"
# db pull 需要 DIRECT_URL，且会覆盖 prisma/schema.prisma —— 因此先备份
if [[ -f prisma/schema.prisma ]]; then
  cp prisma/schema.prisma "prisma/schema.prisma.bak.$(date +%Y%m%d%H%M%S)"
  echo "    已备份原 schema.prisma（.bak.时间戳）"
fi

DIRECT_URL="${DIRECT_URL:-${DATABASE_URL}}" npx prisma db pull

echo
echo ">>> 生成 Prisma Client"
npx prisma generate

echo
echo "================================================================"
echo " ✅ 数据库上线完成"
echo "================================================================"
echo
echo "下一步："
echo "  1. 检查 prisma/schema.prisma 的 diff —— db pull 会重写整个文件，"
echo "     确认 code_hash 仍是 @ignore（生成列不可写入，否则运行时报错）"
echo "  2. 启动后端：npm run build && npm start"
echo "  3. 冒烟：curl -sS \"\$API_BASE/api/guns\" | head -c 200"
