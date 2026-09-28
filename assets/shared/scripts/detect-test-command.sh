#!/usr/bin/env bash
# detect-test-command.sh — 探测项目的构建 / 测试命令（build / unit / contract / integration / smoke 五槽）
#
# 形态：**自包含 POSIX bash**，不做 `_polaris-cli.sh` 薄包装（有意例外，理由见下）。
#   探测逻辑无法预先知道用户项目的技术栈；且脚本随技能资产分发，须在任意项目里独立
#   可跑。若走薄包装，逻辑会落到 `src/core/`，用户项目必须先升级全局 CLI 才能用上
#   新脚本 —— 版本耦合不可接受。故本脚本对齐 `../scorers/test-coverage-scorer.sh`
#   的自包含形态。（同目录 14 个脚本走薄包装，属另一约定，见 scripts/README.md。）
#
# 槽位 ↔ verify 步骤（一一对应；改一处须核另一处）：
#   build       → Step 3  编译 / 构建闸门（**模式无关**，不过即停）
#   unit        → Step 6  单元测试（**总是跑**）
#   contract    → Step 10 契约测试（静态校验，有契约源才跑）
#   integration → Step 11 集成测试（跨模块边界才跑）
#   smoke       → Step 12 主干功能 / E2E（`verify_mode=full` 才跑）
#   build + unit 由 **Step 2** 一次性探测（模式无关）；
#   contract / integration / smoke 由 **Step 9** 按 `verify_mode` 决定探哪些。
#
# 用法：
#   bash detect-test-command.sh --repo-root <path> [--slot build|unit|contract|integration|smoke]
#
# stdout（机器可解析的 key: value 行）：
#   framework:  <框架名>
#   command:    <建议执行的命令>
#   evidence:   <判定依据，含 文件:行>
#   confidence: high|medium|low
#   excluded:   <本档明确排除、不得执行者>
#   reason:     <仅退出码 1 / 2 出现：为什么探测不到 / 为什么不可执行>
#
# 退出码（本仓库原无显式脚本退出码约定 —— constitution-validity.sh 等零 exit 语句
# —— 故此处新定）：
#   0 = 探测到可用命令
#   1 = 探测不到（项目本来就没有这一层验证）→ `No-Verification` 合法触发
#   2 = 探测到了但不可执行（不在 PATH / 非可执行）→ Step 6 二级分叉第 2 级
#       （入参错误同用 2，属「外部命令不可用」同族）
#
# ⚠️ 0 / 1 / 2 **不得合并** —— 1 是「项目属性」，2 是「环境 / 基础设施问题」。
#    合并会把「项目没测试」与「环境坏了」混为一谈（Docker 没起被误判成代码缺陷），
#    正是 verify 三级分叉要防的那个坑。
#
# 目标边界：本脚本只解决「怎么找到命令」。
#   **unit 槽只返回单测命令**，不返回 `mvn verify` / `gradlew check` 等含集成的命令；
#   **build 槽只返回编译 / 打包命令**，不返回会连带跑测试的 `gradlew build`。
#
# 探测优先级（逐段降级）：
#   1. 项目显式声明 —— 项目根说明文件（README / CONTRIBUTING / CLAUDE.md）的
#      `## Testing` / `## 测试` / `## Building` / `## 构建` 章节（**权威来源**：作者写下来的）
#   2. Makefile 显式 target（同属「声明」，故排在「推断」之前）
#   3. 清单文件检测（pom.xml / package.json / go.mod / …）—— 属「推断」
#   4. 无 → 退出码 1
#
# 注 1：config 的历史确认值**不在本脚本职责内** —— verify 入口先行读取，
#      本脚本输出仅用于「与之冲突」的比对；运行时以 config 已确认值为准。
#
# 注 2：`## Testing` 章节的代码块里常**同时列多条**命令，如
#         npx vitest run test/ts/cli.test.ts   # 先跑这一个文件
#         npx vitest run                       # 全量
#       「单测命令」的本意是**跑全量单测**，故取**未限定范围**的那条（无测试文件路径 /
#       `-Dtest=` / `--grep` 等过滤参数）。全部都被限定时才退回第一条。
#
# 注 3：`build` / `contract` 两槽**只认显式入口**（说明文件章节 / Makefile target /
#       package.json script / Python 的 tests/contract 目录），**不做工具依赖推断** ——
#       有工具依赖但无脚本入口时宁返回 1（走 `No-Verification`），不替项目臆造命令。

set -uo pipefail

REPO_ROOT=""
SLOT="unit"

_usage() {
  cat <<'EOF'
用法: detect-test-command.sh --repo-root <path> [--slot build|unit|contract|integration|smoke]

  --repo-root <path>   项目根目录（必填）
  --slot <name>        槽位：unit（默认）| build | contract | integration | smoke

退出码: 0=探测到可用命令 · 1=项目无此层验证 · 2=探测到但不可执行 / 入参错误
EOF
}

_argerr() {
  printf 'detect-test-command: %s\n' "$1" >&2
  _usage >&2
  exit 2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --repo-root)
      [ $# -ge 2 ] || _argerr "--repo-root 缺少取值"
      REPO_ROOT="$2"; shift 2 ;;
    --repo-root=*)
      REPO_ROOT="${1#*=}"; shift ;;
    --slot)
      [ $# -ge 2 ] || _argerr "--slot 缺少取值"
      SLOT="$2"; shift 2 ;;
    --slot=*)
      SLOT="${1#*=}"; shift ;;
    -h|--help)
      _usage; exit 0 ;;
    *)
      _argerr "未知参数: $1" ;;
  esac
done

case "$SLOT" in
  build|unit|contract|integration|smoke) ;;
  *) _argerr "--slot 取值非法: ${SLOT}（须为 build | unit | contract | integration | smoke）" ;;
esac

[ -n "$REPO_ROOT" ] || _argerr "--repo-root 必填"
[ -d "$REPO_ROOT" ] || _argerr "--repo-root 不是目录: $REPO_ROOT"
cd "$REPO_ROOT" || _argerr "无法进入 --repo-root: $REPO_ROOT"

# ============================== 输出 ==============================

emit() {   # framework command evidence confidence excluded
  printf 'framework: %s\n'  "$1"
  printf 'command: %s\n'    "$2"
  printf 'evidence: %s\n'   "$3"
  printf 'confidence: %s\n' "$4"
  printf 'excluded: %s\n'   "$5"
}

emit_absent() {   # reason
  printf 'framework: —\n'
  printf 'command: —\n'
  printf 'evidence: —\n'
  printf 'confidence: —\n'
  printf 'excluded: —\n'
  printf 'reason: %s\n' "$1"
  exit 1
}

emit_unavailable() {   # framework command evidence confidence excluded reason
  emit "$1" "$2" "$3" "$4" "$5"
  printf 'reason: %s\n' "$6"
  exit 2
}

# ============================== 工具 ==============================

_strip_env() {   # 剥掉 `VAR=value` 前缀（如 CI=true npm test）
  printf '%s\n' "$1" | awk '{
    out = ""
    for (i = 1; i <= NF; i++) {
      if (out == "" && $i ~ /^[A-Za-z_][A-Za-z0-9_]*=/) continue
      out = (out == "" ? $i : out " " $i)
    }
    print out
  }'
}

_head_of() {
  _strip_env "$1" | awk '{ print $1 }'
}

_executable_ok() {   # 命令首词是否可执行（复用 detect.ts 的 commandAvailable 语义）
  local head
  head=$(_head_of "$1")
  case "$head" in
    "") return 1 ;;
    ./*|/*) [ -x "$head" ] ;;
    *) command -v "$head" >/dev/null 2>&1 ;;
  esac
}

_framework_of() {
  # 先认**显式测试运行器**（`npx vitest run` 比「Node (npx)」更有信息量），
  # 再退回**包管理器脚本**（`npm test` 本身不体现框架，只能报到包管理器）。
  case "$1" in
    *mvn*)       echo "Maven (Surefire)" ;;
    *gradlew*|*gradle*) echo "Gradle" ;;
    *buf*)       echo "buf" ;;
    *pact*)      echo "Pact" ;;
    *schemathesis*) echo "Schemathesis" ;;
    *spectral*)  echo "Spectral" ;;
    *dredd*)     echo "Dredd" ;;
    *vitest*)    echo "Vitest" ;;
    *jest*)      echo "Jest" ;;
    *mocha*)     echo "Mocha" ;;
    *pytest*)    echo "pytest" ;;
    *tsc*)       echo "TypeScript (tsc)" ;;
    *"go test"*) echo "go test" ;;
    *"go build"*) echo "go build" ;;
    *"cargo build"*) echo "cargo build" ;;
    *cargo*)     echo "cargo test" ;;
    *rspec*)     echo "RSpec" ;;
    *phpunit*)   echo "PHPUnit" ;;
    *"dotnet build"*) echo ".NET" ;;
    *"dotnet test"*) echo ".NET" ;;
    *make*)      echo "Makefile" ;;
    *pnpm*)      echo "Node (pnpm)" ;;
    *yarn*)      echo "Node (yarn)" ;;
    *bun*)       echo "Node (bun)" ;;
    *npm*)       echo "Node (npm)" ;;
    *npx*)       echo "Node (npx)" ;;
    *)           echo "—" ;;
  esac
}

_excluded_for_cmd() {   # 本档「明确排除项」——对应设计文档清单表的右列
  case "$1" in
    *mvn*)      echo "mvn verify（Failsafe *IT.java = 集成）" ;;
    *gradle*)   echo "check（含集成 / 静态分析）" ;;
    *vitest*|*jest*|*mocha*) echo "e2e / integration 套件（--project / *.e2e.*）" ;;
    *pnpm*|*yarn*|*bun*|*npm*) echo "e2e 脚本（test:e2e）" ;;
    *pytest*)   echo "tox / nox 的集成环境" ;;
    *"go test"*) echo "-tags integration" ;;
    *cargo*)    echo "--features integration" ;;
    *rspec*)    echo "spec/features（Capybara 系统测试）" ;;
    *phpunit*)  echo "--testsuite integration" ;;
    *)          echo "—" ;;
  esac
}

# ============ 第 1 序：项目显式声明（`## Testing` 章节） ============

_pick_cmd() {   # stdin = 章节正文；$1 = slot
  # 「fenced code block 内」优先；块内无候选才退化到「行内反引号」。
  # 两道闸缺一不可：
  #   ① 含测试语义词（否则 CHANGELOG 模板的「…, Tests, …」散文会被当成命令）
  #   ② **首词像命令**（否则「单元测试放在 `test/ts/`」这种路径说明会被当成命令）
  awk -v slot="$1" '
    function strip_comment(s,   i) {
      # 行尾 `# 说明` 不是命令的一部分（`npx vitest run  # 全量测试`）→ 截掉再输出
      i = index(s, " #")
      if (i > 0) s = substr(s, 1, i - 1)
      sub(/[[:space:]]+$/, "", s)
      return s
    }
    function scoped(s,   n, i, a, t) {
      # 该命令是否把范围限到子集（指定测试文件 / 过滤参数）。
      # 代码块里常同列「先跑这一个文件」与「跑全量」→ 单测命令要的是后者。
      n = split(s, a, /[[:space:]]+/)
      for (i = 2; i <= n; i++) {
        t = a[i]
        if (t ~ /\.(test|spec)\.[A-Za-z0-9]+$/) return 1
        if (t ~ /^(tests?|specs?)\//) return 1
        if (t == "-t" || t == "-run" || t ~ /^-Dtest=/) return 1
        if (t ~ /^--(grep|testNamePattern|filter|testsuite|project)=/) return 1
      }
      return 0
    }
    function ok(line,   low, h, rest, known, pathlike) {
      low = tolower(line)
      if (low ~ /(install|uninstall|--save)/) return 0
      h = low
      sub(/[[:space:]].*$/, "", h)
      # 允许 `VAR=value` 前缀（如 CI=true npm test）
      if (h ~ /^[a-z_][a-z0-9_]*=$/) {
        rest = low
        sub(/^[^[:space:]]+[[:space:]]+/, "", rest)
        sub(/[[:space:]].*$/, "", rest)
        h = rest
      }
      known = (h ~ /^(npm|pnpm|yarn|bun|npx|mvn|gradle|gradlew|pytest|python|python3|tox|nox|poetry|pdm|uv|go|cargo|bundle|rake|rspec|phpunit|php|dotnet|make|mix|swift|dart|ctest|cmake|jest|vitest|mocha|ava|bash|sh|zsh|buf)$/)
      pathlike = (h ~ /^\.\// || h ~ /\/bin\// || h ~ /\.sh$/)
      if (!known && !pathlike) return 0
      if (slot == "build") {
        # 编译闸门只要「编译 / 打包」命令。**不按 test 词排除** ——
        # `mvn -B package -DskipTests` 本身就含 "Tests" 字样，排掉它等于排掉正解。
        if (low !~ /(build|compile|assemble|package|tsc|dist)/) return 0
      } else if (slot == "unit") {
        if (low !~ /(test|spec|pytest|junit|phpunit|rspec|check)/) return 0
        # `verify` 也排除：`mvn verify` 是集成档，unit 档不得取它（设计文档「unit 只跑单测」）
        if (low ~ /(e2e|end-to-end|integration|smoke|acceptance|contract|pact|verify)/) return 0
      } else if (slot == "contract") {
        if (low !~ /(contract|pact|openapi|swagger|proto|schema|spectral|buf)/) return 0
      } else if (slot == "integration") {
        if (low !~ /(integration|verify|failsafe)/) return 0
      } else if (slot == "smoke") {
        if (low !~ /(e2e|end-to-end|smoke)/) return 0
      }
      return 1
    }
    /^[[:space:]]*```/ { fence = !fence; next }
    {
      line = $0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+$/, "", line)
      if (line == "") next
      if (line ~ /^#/) next
      sub(/^[$>][[:space:]]*/, "", line)
      if (fence) {
        if (ok(line)) {
          cand = strip_comment(line)
          if (block == "" ) block = cand
          if (unscoped == "" && scoped(cand) == 0) unscoped = cand
        }
      } else if (inline == "" && index(line, "`") > 0) {
        n = split(line, parts, "`")
        for (i = 2; i <= n; i += 2) {
          c = parts[i]
          sub(/^[[:space:]]+/, "", c)
          sub(/[[:space:]]+$/, "", c)
          if (ok(c)) { inline = c; break }
        }
      }
    }
    END {
      if (unscoped != "") print unscoped
      else if (block != "") print block
      else if (inline != "") print inline
    }
  '
}

_declared_cmd() {   # $1 = slot；成功打印 "cmd\nfile:line"
  # 标题必须是**测试语义**。`### Tests` 这类 CHANGELOG 分类**不算**（故三级标题
  # 只认 Testing / 测试 这类明确措辞，不含 Test(s)）。一个文件里可能有多个候选
  # 标题（如 CHANGELOG 模板 + 真正的 Testing 章节）→ 逐个试，提不出命令就继续。
  local slot="$1" f ln sec cmd
  for f in README.md README.MD readme.md CONTRIBUTING.md CLAUDE.md AGENTS.md \
           .github/CONTRIBUTING.md docs/CONTRIBUTING.md docs/README.md; do
    [ -f "$f" ] || continue
    while IFS= read -r ln; do
      [ -n "$ln" ] || continue
      sec=$(awk -v start="$ln" '
        NR <= start { next }
        /^#{1,2}[[:space:]]/ { exit }
        { print }
      ' "$f")
      [ -n "$sec" ] || continue
      cmd=$(printf '%s\n' "$sec" | _pick_cmd "$slot")
      if [ -n "$cmd" ]; then
        printf '%s\n%s:%s\n' "$cmd" "$f" "$ln"
        return 0
      fi
    done <<EOF
$(awk '/^##[[:space:]]+(Testing|Tests|Test|How to [Rr]un [Tt]ests|Running [Tt]ests|Building|Build|How to [Bb]uild|测试|运行测试|如何测试|构建|编译|如何构建)([[:space:]]|$)/ { print NR }
        /^###[[:space:]]+(Testing|How to [Rr]un [Tt]ests|Running [Tt]ests|Building|How to [Bb]uild|测试|运行测试|如何测试|构建|编译|如何构建)([[:space:]]|$)/ { print NR }' "$f")
EOF
  done
  return 1
}

# ============ 第 2 序：Makefile 显式 target ============

_makefile_hit() {   # $1 = slot；成功打印 "target\nfile:line"
  local f="Makefile" pat target ln
  if [ ! -f Makefile ]; then
    if [ -f makefile ]; then f="makefile"; else return 1; fi
  fi
  case "$1" in
    build)       pat='^(build|compile|all|dist|package):' ;;
    unit)        pat='^(test|tests|unit):' ;;
    contract)    pat='^(contract|contracts|contract-test|test-contract|api-contract):' ;;
    integration) pat='^(test-integration|integration|integration-test|it):' ;;
    smoke)       pat='^(test-e2e|e2e|smoke|acceptance|functional|test-functional):' ;;
  esac
  ln=$(awk -v pat="$pat" '$0 ~ pat { print NR; exit }' "$f")
  [ -n "$ln" ] || return 1
  target=$(awk -v n="$ln" 'NR == n { sub(/:.*/, ""); print }' "$f")
  printf '%s\n%s:%s\n' "$target" "$f" "$ln"
}

# ============ build 槽：编译 / 构建入口 ============
# 「只编译、不跑测试」。设计理由：编译闸门（verify Step 3）在单测之前，
# 用 `gradlew build` / `npm test` 会把测试提前拉进闸门，闸门就不再是闸门。

_probe_build() {   # 命中即 emit 并 return 0；未命中 return 1
  local f ln bin pm sln
  if [ -f pom.xml ]; then
    bin="mvn"; [ -x ./mvnw ] && bin="./mvnw"
    emit "Maven" "$bin -B package -DskipTests" "pom.xml:1 为 Maven 工程（package 生命周期）" "high" "test 生命周期（编译闸门不跑测试）"
    return 0
  fi
  if [ -f build.gradle ] || [ -f build.gradle.kts ]; then
    f="build.gradle"; [ -f build.gradle.kts ] && f="build.gradle.kts"
    bin="gradle"; [ -x ./gradlew ] && bin="./gradlew"
    emit "Gradle" "$bin assemble" "$f:1 为 Gradle 工程（assemble 只编译打包）" "high" "build / check（会连带跑测试，不属编译闸门）"
    return 0
  fi
  if [ -f package.json ]; then
    pm="npm"
    [ -f pnpm-lock.yaml ] && pm="pnpm"
    [ -f yarn.lock ] && pm="yarn"
    if [ -f bun.lockb ] || [ -f bun.lock ]; then pm="bun"; fi
    ln=$(awk '/"build"[[:space:]]*:/ { print NR; exit }' package.json)
    if [ -n "$ln" ]; then
      emit "Node ($pm)" "$pm run build" "package.json:$ln 命中 scripts.build" "high" "test 脚本（编译闸门不跑测试）"
      return 0
    fi
    if [ -f tsconfig.json ]; then
      emit "TypeScript (tsc)" "npx tsc --noEmit" "tsconfig.json 存在（无 build 脚本，退化为类型检查）" "medium" "test 脚本"
      return 0
    fi
    return 1
  fi
  if [ -f go.mod ]; then
    emit "go build" "go build ./..." "go.mod 为 Go module" "high" "go test"
    return 0
  fi
  if [ -f Cargo.toml ]; then
    emit "cargo build" "cargo build" "Cargo.toml 为 Rust 工程" "high" "cargo test"
    return 0
  fi
  sln=$(find . -maxdepth 1 \( -name '*.sln' -o -name '*.csproj' \) 2>/dev/null | awk 'NR == 1 { print; exit }')
  if [ -n "$sln" ]; then
    emit ".NET" "dotnet build" "$sln 为 .NET 工程" "high" "dotnet test"
    return 0
  fi
  # Python / Ruby / PHP 无编译步骤 → 调用方记 `No-Verification`（不阻断）
  return 1
}

# ============ contract 槽：契约测试入口 ============
# 见文件头「注 3」：**只认显式入口**，不做工具依赖推断。有契约工具依赖但无脚本
# 入口时返回 1 走 `No-Verification` —— 替项目臆造 `npx <tool>` 会引入下载与版本风险。

_probe_contract() {   # 命中即 emit 并 return 0；未命中 return 1
  local ln key pm d
  if [ -f package.json ]; then
    pm="npm"
    [ -f pnpm-lock.yaml ] && pm="pnpm"
    [ -f yarn.lock ] && pm="yarn"
    if [ -f bun.lockb ] || [ -f bun.lock ]; then pm="bun"; fi
    for key in test:contract test:contracts test:pact contract pact; do
      ln=$(awk -v k="\"$key\"" 'index($0, k) { print NR; exit }' package.json)
      if [ -n "$ln" ]; then
        emit "Node ($pm)" "$pm run $key" "package.json:$ln 命中 scripts.$key" "high" "unit / integration 档（本档只跑契约测试）"
        return 0
      fi
    done
  fi
  if [ -d tests/contract ] || [ -d tests/contracts ]; then
    d="tests/contract"; [ -d tests/contracts ] && d="tests/contracts"
    emit "pytest" "pytest $d" "$d/ 目录存在（契约测试目录约定）" "medium" "unit / integration 档（本档只跑契约测试）"
    return 0
  fi
  return 1
}

# ============ 第 3 序：清单文件检测 ============

_probe_manifest() {   # $1 = slot；命中即 emit 并 return 0
  local slot="$1" bin pm f ln itf sig sln
  # build / contract 两槽各有独立探测（见上），不走下方的语言清单链
  if [ "$slot" = "build" ]; then _probe_build; return $?; fi
  if [ "$slot" = "contract" ]; then _probe_contract; return $?; fi

  # ---------- JVM: Maven ----------
  if [ -f pom.xml ]; then
    bin="mvn"; [ -x ./mvnw ] && bin="./mvnw"
    if [ "$slot" = "unit" ]; then
      ln=$(awk '/maven-surefire-plugin/ { print NR; exit }' pom.xml)
      if [ -n "$ln" ]; then
        emit "Maven (Surefire)" "$bin -B test" "pom.xml:$ln 命中 maven-surefire-plugin" "high" "$(_excluded_for_cmd "$bin")"
      else
        emit "Maven (Surefire)" "$bin -B test" "pom.xml:1 为 Maven 工程（未显式声明 surefire，走默认 test 生命周期）" "high" "$(_excluded_for_cmd "$bin")"
      fi
      return 0
    fi
    if [ "$slot" = "integration" ]; then
      ln=$(awk '/maven-failsafe-plugin/ { print NR; exit }' pom.xml)
      if [ -n "$ln" ]; then
        emit "Maven (Failsafe)" "$bin -B verify" "pom.xml:$ln 命中 maven-failsafe-plugin" "high" "mvn -B test（只跑单测，不含 *IT.java）"
        return 0
      fi
      itf=$(find . -maxdepth 4 -name '*IT.java' -not -path './target/*' 2>/dev/null | awk 'NR == 1 { print; exit }')
      if [ -n "$itf" ]; then
        emit "Maven (Failsafe)" "$bin -B verify" "$itf 存在（Failsafe *IT.java 约定）" "medium" "mvn -B test（只跑单测）"
        return 0
      fi
      return 1
    fi
    return 1
  fi

  # ---------- JVM: Gradle ----------
  if [ -f build.gradle ] || [ -f build.gradle.kts ]; then
    f="build.gradle"; [ -f build.gradle.kts ] && f="build.gradle.kts"
    bin="gradle"; [ -x ./gradlew ] && bin="./gradlew"
    if [ "$slot" = "unit" ]; then
      emit "Gradle" "$bin test" "$f:1 为 Gradle 工程（走 test task）" "high" "$(_excluded_for_cmd "$bin")"
      return 0
    fi
    if [ "$slot" = "integration" ]; then
      ln=$(awk '/integrationTest/ { print NR; exit }' "$f")
      [ -n "$ln" ] || return 1
      emit "Gradle (integrationTest)" "$bin integrationTest" "$f:$ln 声明 integrationTest task" "high" "unit 档（单测，不在本档执行）"
      return 0
    fi
    return 1
  fi

  # ---------- Node ----------
  if [ -f package.json ]; then
    pm="npm"
    [ -f pnpm-lock.yaml ] && pm="pnpm"
    [ -f yarn.lock ] && pm="yarn"
    if [ -f bun.lockb ] || [ -f bun.lock ]; then pm="bun"; fi
    case "$slot" in
      unit)
        ln=$(awk '/"test"[[:space:]]*:/ { print NR; exit }' package.json)
        if [ -n "$ln" ]; then
          emit "Node ($pm)" "$pm test" "package.json:$ln 命中 scripts.test" "high" "$(_excluded_for_cmd "$pm")"
          return 0
        fi
        return 1 ;;
      integration)
        for key in test:integration test:it test:int; do
          ln=$(awk -v k="\"$key\"" 'index($0, k) { print NR; exit }' package.json)
          if [ -n "$ln" ]; then
            emit "Node ($pm)" "$pm run $key" "package.json:$ln 命中 scripts.$key" "high" "unit 档（单测，不在本档执行）"
            return 0
          fi
        done
        return 1 ;;
      smoke)
        for key in test:e2e e2e test:smoke smoke; do
          ln=$(awk -v k="\"$key\"" 'index($0, k) { print NR; exit }' package.json)
          if [ -n "$ln" ]; then
            emit "Node ($pm)" "$pm run $key" "package.json:$ln 命中 scripts.$key" "high" "unit 档（单测，不在本档执行）"
            return 0
          fi
        done
        return 1 ;;
    esac
  fi

  # ---------- Python ----------
  if [ -f pytest.ini ] || [ -f pyproject.toml ] || [ -f setup.py ] || [ -f setup.cfg ] \
     || [ -f tox.ini ] || [ -f requirements.txt ] || [ -f conftest.py ] \
     || [ -n "$(find tests -maxdepth 2 -name '*.py' 2>/dev/null | awk 'NR == 1 { print; exit }')" ]; then
    if [ "$slot" = "smoke" ]; then
      return 1
    fi
    if [ "$slot" = "integration" ]; then
      if [ -d tests/integration ]; then
        emit "pytest" "pytest tests/integration" "tests/integration/ 存在" "medium" "pytest（单测全集）"
        return 0
      fi
      return 1
    fi
    sig=""
    for c in pytest.ini pyproject.toml tox.ini setup.cfg setup.py requirements.txt conftest.py; do
      if [ -f "$c" ]; then sig="$c"; break; fi
    done
    [ -n "$sig" ] || sig="tests/"
    emit "pytest" "pytest" "$sig 为 Python 工程测试信号" "medium" "$(_excluded_for_cmd pytest)"
    return 0
  fi

  # ---------- Go ----------
  if [ -f go.mod ]; then
    if [ "$slot" = "unit" ]; then
      emit "go test" "go test ./..." "go.mod 为 Go module" "high" "$(_excluded_for_cmd "go test")"
      return 0
    fi
    return 1
  fi

  # ---------- Rust ----------
  if [ -f Cargo.toml ]; then
    if [ "$slot" = "unit" ]; then
      emit "cargo test" "cargo test" "Cargo.toml 为 Rust 工程" "high" "$(_excluded_for_cmd cargo)"
      return 0
    fi
    return 1
  fi

  # ---------- Ruby ----------
  if [ -f Gemfile ]; then
    if [ "$slot" = "unit" ]; then
      emit "RSpec" "bundle exec rspec" "Gemfile 为 Ruby 工程" "medium" "$(_excluded_for_cmd rspec)"
      return 0
    fi
    return 1
  fi

  # ---------- PHP ----------
  if [ -f composer.json ]; then
    if [ "$slot" = "unit" ]; then
      emit "PHPUnit" "vendor/bin/phpunit" "composer.json 为 PHP 工程" "medium" "$(_excluded_for_cmd phpunit)"
      return 0
    fi
    return 1
  fi

  # ---------- .NET ----------
  sln=$(find . -maxdepth 1 \( -name '*.sln' -o -name '*.csproj' \) 2>/dev/null | awk 'NR == 1 { print; exit }')
  if [ -n "$sln" ]; then
    if [ "$slot" = "unit" ]; then
      emit ".NET" "dotnet test" "$sln 为 .NET 工程" "high" "—"
      return 0
    fi
    return 1
  fi

  return 1
}

# ============================== 主流程 ==============================

# 第 1 序：项目显式声明
if decl=$(_declared_cmd "$SLOT"); then
  cmd=$(printf '%s\n' "$decl" | awk 'NR == 1')
  ev=$(printf '%s\n' "$decl" | awk 'NR == 2')
  if _executable_ok "$cmd"; then
    emit "$(_framework_of "$cmd")" "$cmd" "$ev 命中 Testing 章节（权威来源）" "high" "$(_excluded_for_cmd "$cmd")"
    exit 0
  fi
  emit_unavailable "$(_framework_of "$cmd")" "$cmd" "$ev 命中 Testing 章节（权威来源）" "high" \
    "$(_excluded_for_cmd "$cmd")" "命令首词不可执行（不在 PATH 或非可执行文件）: $(_head_of "$cmd")"
fi

# 第 2 序：Makefile 显式 target
if mf=$(_makefile_hit "$SLOT"); then
  target=$(printf '%s\n' "$mf" | awk 'NR == 1')
  ev=$(printf '%s\n' "$mf" | awk 'NR == 2')
  cmd="make $target"
  if _executable_ok "$cmd"; then
    emit "Makefile" "$cmd" "$ev 命中 $target target（项目显式声明）" "high" "—"
    exit 0
  fi
  emit_unavailable "Makefile" "$cmd" "$ev 命中 $target target（项目显式声明）" "high" "—" \
    "make 不在 PATH"
fi

# 第 3 序：清单文件检测
if _probe_manifest "$SLOT"; then
  exit 0
fi

# 无候选
case "$SLOT" in
  build)    emit_absent "未探测到构建入口（项目无编译 / 构建步骤，如纯脚本 / 文档项目）" ;;
  contract) emit_absent "未探测到契约测试入口（项目无接口契约源，或未声明契约测试命令）" ;;
  *)        emit_absent "未探测到 $SLOT 档测试入口（项目无此层验证）" ;;
esac
