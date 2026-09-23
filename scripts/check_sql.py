"""
SQL 语法校验：使用 pglast（libpg_query 绑定，PostgreSQL 官方解析器）解析 db/*.sql，
捕获语法错误并定位到具体语句。

用途：CI 中无需真实数据库即可拦截 DDL 语法错误。
用法：python scripts/check_sql.py   （需 pip install pglast）
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    from pglast import parse_sql
    from pglast.parser import ParseError
except ImportError:  # pragma: no cover
    print("缺少依赖：pip install pglast", file=sys.stderr)
    raise SystemExit(2)

DB_DIR = Path(__file__).resolve().parent.parent / "db"

# 必须与实际部署顺序一致：垫片 -> 表结构 -> 函数 -> RLS -> 种子数据
EXECUTION_ORDER = [
    "00_auth_shim.sql",
    "01_schema.sql",
    "03_functions.sql",
    "02_rls.sql",
    "04_seed.sql",
]

DOLLAR_TAG = re.compile(r"\$([A-Za-z_][A-Za-z0-9_]*)?\$")


def split_statements(sql: str) -> list[tuple[int, str]]:
    """
    按分号切分顶层语句，返回 (起始行号, 语句文本)。

    必须实现一个最小 SQL 词法状态机，否则以下四种情况都会误切分：
      ① 行注释  -- ...        （本项目注释里就出现了 $$ 字样）
      ② 块注释  /* ... */
      ③ 单引号字符串 '...'    （'' 为转义）
      ④ 美元引用 $$ ... $$ / $tag$ ... $tag$
    plpgsql 函数体内部含大量分号，只有正确处理 ④ 才能不被拆散。
    """
    statements: list[tuple[int, str]] = []
    buf: list[str] = []
    line = 1
    start_line = 1
    i = 0
    n = len(sql)
    dollar_tag: str | None = None

    def flush() -> None:
        nonlocal buf, start_line
        text = "".join(buf).strip()
        if text:
            statements.append((start_line, text))
        buf = []
        start_line = line

    while i < n:
        ch = sql[i]

        # ---- 美元引用内部：只寻找配对的结束标签 ----
        if dollar_tag is not None:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
                continue
            if ch == "\n":
                line += 1
            buf.append(ch)
            i += 1
            continue

        # ---- 行注释 ----
        if sql.startswith("--", i):
            end = sql.find("\n", i)
            if end == -1:
                buf.append(sql[i:])
                i = n
            else:
                buf.append(sql[i : end + 1])
                line += 1
                i = end + 1
            continue

        # ---- 块注释（支持嵌套，PostgreSQL 语义） ----
        if sql.startswith("/*", i):
            depth = 1
            j = i + 2
            while j < n and depth > 0:
                if sql.startswith("/*", j):
                    depth += 1
                    j += 2
                elif sql.startswith("*/", j):
                    depth -= 1
                    j += 2
                else:
                    if sql[j] == "\n":
                        line += 1
                    j += 1
            buf.append(sql[i:j])
            i = j
            continue

        # ---- 单引号字符串（含 E'' 与 '' 转义） ----
        if ch == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'":
                        j += 2
                        continue
                    j += 1
                    break
                if sql[j] == "\n":
                    line += 1
                j += 1
            buf.append(sql[i:j])
            i = j
            continue

        # ---- 双引号标识符 ----
        if ch == '"':
            j = sql.find('"', i + 1)
            j = n if j == -1 else j + 1
            buf.append(sql[i:j])
            i = j
            continue

        # ---- 美元引用起始 ----
        if ch == "$":
            m = DOLLAR_TAG.match(sql, i)
            if m:
                dollar_tag = m.group(0)
                buf.append(dollar_tag)
                i = m.end()
                continue

        # ---- 顶层分号：语句边界 ----
        if ch == ";":
            buf.append(";")
            i += 1
            flush()
            continue

        if ch == "\n":
            line += 1
        buf.append(ch)
        i += 1

    flush()
    return statements


def main() -> int:
    total_errors = 0
    total_statements = 0

    for name in EXECUTION_ORDER:
        path = DB_DIR / name
        if not path.exists():
            print(f"[SKIP] {name} 不存在")
            continue

        raw = path.read_text(encoding="utf-8")
        statements = split_statements(raw)
        total_statements += len(statements)

        errors: list[str] = []
        for start_line, stmt in statements:
            try:
                parse_sql(stmt)
            except ParseError as exc:
                head = stmt.strip().splitlines()[0][:72]
                errors.append(f"    L{start_line}: {head}\n      -> {exc}")
            except Exception as exc:  # noqa: BLE001
                errors.append(f"    L{start_line}: 未知错误 {exc}")

        status = "OK  " if not errors else "FAIL"
        print(f"[{status}] {name}  ({len(statements)} 条顶层语句)")
        for e in errors:
            print(e)
        total_errors += len(errors)

    print("-" * 64)
    print(f"合计 {total_statements} 条语句，{total_errors} 处语法问题")
    return 1 if total_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
