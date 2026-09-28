#!/usr/bin/env bash
# detect-test-command.sh 夹具自测（回归场景）
# 用法: bash test/shell/detect-test-command.sh [被测脚本的绝对路径]
# 退出码: 0 = 全绿 / 1 = 有失败用例（供 vitest 集成测试断言）
set -uo pipefail

# 自定位：本文件在 <repo>/test/shell/ 下 → 仓库根 = ../..
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd "$HERE/../.." && pwd)
SCRIPT="${1:-$REPO_ROOT/assets/shared/scripts/detect-test-command.sh}"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/detect-fixtures.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

PASS=0; FAIL=0
declare -a FAILED

check() {   # name expected actual
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); printf '  \033[32m✓\033[0m %s\n' "$1"
  else
    FAIL=$((FAIL + 1)); FAILED+=("$1")
    printf '  \033[31m✗\033[0m %s\n      期望 = [%s]\n      实际 = [%s]\n' "$1" "$2" "$3"
  fi
}

OUT=""; RC=0
run() {   # run <dir> [args...]  —— 有意从 /tmp 运行，顺带验证脚本不依赖 CWD
  local d="$1"; shift
  OUT=$(cd /tmp && bash "$SCRIPT" --repo-root "$d" "$@" 2>/dev/null); RC=$?
}
kv() { printf '%s\n' "$OUT" | awk -v k="$1" 'index($0, k ": ") == 1 { sub(k ": ", ""); print; exit }'; }

fixture() {   # fixture <name> → 建目录并 echo 路径
  local d="$WORK/$1"; mkdir -p "$d"; printf '%s\n' "$d"
}

echo "脚本: $SCRIPT"
echo "夹具: $WORK"
echo

# ---- 1. Maven + surefire（unit） ----
d=$(fixture maven-surefire)
cat >"$d/pom.xml" <<'EOF'
<project>
  <build><plugins>
    <plugin><artifactId>maven-surefire-plugin</artifactId><version>3.2.5</version></plugin>
  </plugins></build>
</project>
EOF
run "$d" --slot unit
check "Maven+surefire unit 退出码" 0 "$RC"
check "Maven+surefire unit 命令" "mvn -B test" "$(kv command)"
check "Maven+surefire unit 框架" "Maven (Surefire)" "$(kv framework)"
check "Maven+surefire excluded 排除 mvn verify" \
  "mvn verify（Failsafe *IT.java = 集成）" "$(kv excluded)"

# ---- 2. Maven + failsafe（integration） ----
d=$(fixture maven-failsafe)
cat >"$d/pom.xml" <<'EOF'
<project>
  <build><plugins>
    <plugin><artifactId>maven-failsafe-plugin</artifactId><version>3.2.5</version></plugin>
  </plugins></build>
</project>
EOF
run "$d" --slot integration
check "Maven+failsafe integration 退出码" 0 "$RC"
check "Maven+failsafe integration 命令" "mvn -B verify" "$(kv command)"

# ---- 3. Maven 无 failsafe / 无 *IT.java（integration → 探测不到） ----
d=$(fixture maven-no-it)
cat >"$d/pom.xml" <<'EOF'
<project><build><plugins>
  <plugin><artifactId>maven-surefire-plugin</artifactId></plugin>
</plugins></build></project>
EOF
run "$d" --slot integration
check "Maven 无集成入口 integration 退出码" 1 "$RC"

# ---- 4. README 声明块（权威来源） ----
d=$(fixture readme-block)
cat >"$d/README.md" <<'EOF'
## Testing

```bash
make test
```
EOF
run "$d" --slot unit
check "README 代码块 unit 退出码" 0 "$RC"
check "README 代码块 unit 命令" "make test" "$(kv command)"
check "README 代码块 evidence 指向 README.md:1" "README.md:1 命中 Testing 章节（权威来源）" "$(kv evidence)"

# ---- 5/6. Makefile 显式 target ----
d=$(fixture makefile)
printf 'test:\n\t@echo ok\n' >"$d/Makefile"
run "$d" --slot unit
check "Makefile unit 退出码" 0 "$RC"
check "Makefile unit 命令" "make test" "$(kv command)"

d=$(fixture makefile-smoke)
printf 'smoke:\n\t@echo ok\n' >"$d/Makefile"
run "$d" --slot smoke
check "Makefile smoke 退出码" 0 "$RC"
check "Makefile smoke 命令" "make smoke" "$(kv command)"

# ---- 7. 空目录 ----
d=$(fixture empty)
run "$d" --slot unit
check "空目录 unit 退出码" 1 "$RC"
check "空目录不输出 command" "—" "$(kv command)"
check "空目录有 reason" "未探测到 unit 档测试入口（项目无此层验证）" "$(kv reason)"

# ---- 8/9. Node 有 test:e2e 无 test ----
d=$(fixture node-e2e-only)
cat >"$d/package.json" <<'EOF'
{ "name": "x", "scripts": { "test:e2e": "playwright test" } }
EOF
run "$d" --slot unit
check "Node 仅 test:e2e 的 unit 退出码" 1 "$RC"
run "$d" --slot smoke
check "Node 仅 test:e2e 的 smoke 退出码" 0 "$RC"
check "Node 仅 test:e2e 的 smoke 命令" "npm run test:e2e" "$(kv command)"

# ---- 10. 陷阱：CHANGELOG 模板的 `### Tests` ----
d=$(fixture changelog-trap)
cat >"$d/CHANGELOG.md" <<'EOF'
## [Unreleased]

### Tests

- Group entries by module Tests
EOF
cat >"$d/package.json" <<'EOF'
{ "name": "x", "scripts": { "test": "vitest run" }, "devDependencies": { "vitest": "^1" } }
EOF
run "$d" --slot unit
check "CHANGELOG ### Tests 陷阱 退出码" 0 "$RC"
check "CHANGELOG ### Tests 陷阱 降级到 package.json" "npm test" "$(kv command)"
check "CHANGELOG ### Tests 陷阱 evidence" "package.json:1 命中 scripts.test" "$(kv evidence)"

# ---- 11. 陷阱：`## 测试` 里的路径说明 ----
d=$(fixture path-trap)
cat >"$d/README.md" <<'EOF'
## 测试

- 单元测试放在 `test/ts/`，文件命名 `*.test.ts`
EOF
cat >"$d/package.json" <<'EOF'
{ "name": "x", "scripts": { "test": "vitest run" } }
EOF
run "$d" --slot unit
check "路径说明陷阱 退出码" 0 "$RC"
check "路径说明陷阱 降级到 package.json" "npm test" "$(kv command)"

# ---- 12. 声明块不可执行 → 退出码 2（≠ 1） ----
d=$(fixture not-executable)
cat >"$d/README.md" <<'EOF'
## Testing

```bash
./gradlew test
```
EOF
run "$d" --slot unit
check "不可执行命令 退出码" 2 "$RC"
check "不可执行命令 stdout 仍有 command" "./gradlew test" "$(kv command)"

# ---- 13/14/15. 入参错误 ----
OUT=$(cd /tmp && bash "$SCRIPT" 2>/dev/null); RC=$?
check "无参数 退出码" 2 "$RC"
d=$(fixture argerr)
run "$d" --slot bogus
check "非法 --slot 退出码" 2 "$RC"
OUT=$(cd /tmp && bash "$SCRIPT" --repo-root /no/such/dir --slot unit 2>/dev/null); RC=$?
check "--repo-root 非目录 退出码" 2 "$RC"

# ---- 16. 块内多候选：限定范围的排在前面 ----
d=$(fixture multi-candidate)
cat >"$d/README.md" <<'EOF'
## Testing

```bash
npx vitest run test/ts/cli.test.ts   # 先跑这一个文件
npx vitest run                       # 全量测试
```
EOF
run "$d" --slot unit
check "多候选块 退出码" 0 "$RC"
check "多候选块取未限定范围的一条" "npx vitest run" "$(kv command)"
check "多候选块 行尾注释被截掉" "Vitest" "$(kv framework)"

# ---- 17. 块内只有限定范围的候选 → 退回第一条 ----
d=$(fixture all-scoped)
cat >"$d/README.md" <<'EOF'
## Testing

```bash
npx vitest run test/ts/cli.test.ts
pytest tests/unit
```
EOF
run "$d" --slot unit
check "全部限定范围 退回第一条" "npx vitest run test/ts/cli.test.ts" "$(kv command)"

# ---- 18. pytest ----
d=$(fixture python)
printf '[tool.pytest.ini_options]\ntestpaths = ["tests"]\n' >"$d/pyproject.toml"
run "$d" --slot unit
check "pytest unit 退出码" 0 "$RC"
check "pytest unit 命令" "pytest" "$(kv command)"
run "$d" --slot smoke
check "pytest smoke 退出码" 1 "$RC"

# ---- 19. Rust ----
d=$(fixture rust)
printf '[package]\nname = "x"\n' >"$d/Cargo.toml"
run "$d" --slot unit
check "cargo unit 退出码" 0 "$RC"
check "cargo unit 命令" "cargo test" "$(kv command)"

# ---- 20. Ruby ----
d=$(fixture ruby)
printf "source 'https://rubygems.org'\n" >"$d/Gemfile"
run "$d" --slot unit
check "Gemfile unit 退出码" 0 "$RC"
check "Gemfile unit 命令" "bundle exec rspec" "$(kv command)"

# ---- 21. 从任意 CWD 运行（--repo-root 生效） ----
d=$(fixture cwd-independence)
cat >"$d/package.json" <<'EOF'
{ "name": "x", "scripts": { "test": "vitest run" } }
EOF
OUT=$(cd / && bash "$SCRIPT" --repo-root "$d" --slot unit 2>/dev/null); RC=$?
check "从 / 运行 --repo-root 生效" "npm test" "$(kv command)"

# ---- 22. 行内反引号（非代码块路径，回归确认未被二轮改动破坏） ----
d=$(fixture inline-backtick)
printf '## Testing\n\n跑 `make test` 即可。\n' >"$d/README.md"
run "$d" --slot unit
check "行内反引号 unit 退出码" 0 "$RC"
check "行内反引号 命令" "make test" "$(kv command)"

echo
printf '通过 %d / 失败 %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '失败用例:\n'; for f in "${FAILED[@]}"; do printf '  - %s\n' "$f"; done
  exit 1
fi
exit 0
