#!/usr/bin/env bash
# plugin-check.sh — 按指定平台检测单个 plugin 是否已安装
#
# 用法：
#   bash plugin-check.sh --platform <id> --plugin <name> [--json] [--quiet] [<repo_root>]
#
# 平台：claude | trae | qoder | codebuddy
# 插件：openspec | superpowers
# 检测顺序：先全局，全局未命中再查项目
#
# 退出码：0=通过；1=缺失/告警；2=参数错误

# === BEGIN CRLF self-heal（必须放在 set -euo pipefail 之前）===
case "$(head -c 200 "${BASH_SOURCE[0]}" 2>/dev/null)" in
  *$'\r'*)
    _selfheal_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    _selfheal_root="$(cd "$_selfheal_dir/.." && pwd)"
    for _f in $(find "$_selfheal_root/hooks" "$_selfheal_root/scorers" -type f -name '*.sh' 2>/dev/null); do
      tr -d '\r' < "$_f" > "$_f.lftmp" 2>/dev/null && mv "$_f.lftmp" "$_f" 2>/dev/null
    done
    echo "[polaris-flow] CRLF detected in shell scripts — self-healed to LF and re-exec'd" >&2
    exec bash "${BASH_SOURCE[0]}" "$@"
    ;;
esac
# === END CRLF self-heal ===

set -euo pipefail

SUPERPOWERS_MARKERS=(
  brainstorming
  using-superpowers
  writing-plans
  test-driven-development
  subagent-driven-development
  request-code-review
)

SUPPORTED_PLATFORMS=(claude trae qoder codebuddy)
SUPPORTED_PLUGINS=(openspec superpowers)

REPO_ROOT=""
PLATFORM_ID=""
PLUGIN_NAME=""
OUTPUT_JSON=0
QUIET=0
WARN_COUNT=0

# ---------------------------------------------------------------------------
# 输出辅助
# ---------------------------------------------------------------------------

_tty() {
  if { true > /dev/tty; } 2>/dev/null; then
    printf '%s\n' "$*" > /dev/tty
  else
    printf '%s\n' "$*" >&2
  fi
}

_log_ok() {
  [ "$QUIET" -eq 1 ] && return 0
  [ "$OUTPUT_JSON" -eq 1 ] && return 0
  printf '[OK] %s\n' "$*"
}

_log_warn() {
  WARN_COUNT=$((WARN_COUNT + 1))
  [ "$QUIET" -eq 1 ] && return 0
  [ "$OUTPUT_JSON" -eq 1 ] && return 0
  _tty "[polaris-flow][WARN] $*"
}

_log_hint() {
  [ "$QUIET" -eq 1 ] && return 0
  [ "$OUTPUT_JSON" -eq 1 ] && return 0
  _tty "                  $*"
}

_json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  printf '%s' "$s"
}

# ---------------------------------------------------------------------------
# 平台 / 插件元数据
# ---------------------------------------------------------------------------

platform_display_name() {
  case "$1" in
    claude) printf '%s' 'Claude Code' ;;
    trae) printf '%s' 'Trae' ;;
    qoder) printf '%s' 'Qoder' ;;
    codebuddy) printf '%s' 'CodeBuddy' ;;
    *) printf '%s' "$1" ;;
  esac
}

platform_config_dir() {
  case "$1" in
    claude) printf '%s' '.claude' ;;
    trae) printf '%s' '.trae' ;;
    qoder) printf '%s' '.qoder' ;;
    codebuddy) printf '%s' '.codebuddy' ;;
    *) return 1 ;;
  esac
}

is_supported_platform() {
  local id="$1" p
  for p in "${SUPPORTED_PLATFORMS[@]}"; do
    [ "$p" = "$id" ] && return 0
  done
  return 1
}

is_supported_plugin() {
  local name="$1" p
  for p in "${SUPPORTED_PLUGINS[@]}"; do
    [ "$p" = "$name" ] && return 0
  done
  return 1
}

# ---------------------------------------------------------------------------
# 目录探测工具
# ---------------------------------------------------------------------------

_has_superpowers_skills_in_dir() {
  local skills_dir="$1" marker hit=""
  [ -d "$skills_dir" ] || return 1
  for marker in "${SUPERPOWERS_MARKERS[@]}"; do
    if [ -d "$skills_dir/$marker" ] || [ -f "$skills_dir/$marker/SKILL.md" ]; then
      hit="$skills_dir/$marker"
      break
    fi
  done
  [ -n "$hit" ] || return 1
  printf '%s' "$hit"
}

_has_openspec_skills_in_dir() {
  local skills_dir="$1" entry hit=""
  [ -d "$skills_dir" ] || return 1
  for entry in "$skills_dir"/openspec-*; do
    if [ -e "$entry" ]; then
      hit="$entry"
      break
    fi
  done
  [ -n "$hit" ] || return 1
  printf '%s' "$hit"
}

_first_existing_dir() {
  local pattern path
  for pattern in "$@"; do
    for path in $pattern; do
      if [ -d "$path" ]; then
        printf '%s' "$path"
        return 0
      fi
    done
  done
  return 1
}

_find_superpowers_in_plugin_cache() {
  local cache_root="$1"
  local marketplace superpowers_dir version_dir skills_dir hit=""
  [ -d "$cache_root" ] || return 1
  for marketplace in "$cache_root"/*; do
    [ -d "$marketplace" ] || continue
    superpowers_dir="$marketplace/superpowers"
    [ -d "$superpowers_dir" ] || continue
    for version_dir in "$superpowers_dir"/*; do
      [ -d "$version_dir" ] || continue
      skills_dir="$version_dir/skills"
      hit="$(_has_superpowers_skills_in_dir "$skills_dir" || true)"
      if [ -n "$hit" ]; then
        printf '%s' "$hit"
        return 0
      fi
    done
  done
  return 1
}

# ---------------------------------------------------------------------------
# 回落检测（global → project）
# 成功时 stdout 输出：scope|kind|path[|variant|version]
# ---------------------------------------------------------------------------

_find_superpowers_global() {
  local platform_id="$1"
  local config_dir hit="" plugin_path="" cache_root=""

  case "$platform_id" in
    claude)
      plugin_path="$(_first_existing_dir \
        "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/superpowers" \
        "$HOME/.claude/plugins/superpowers" \
        || true)"
      if [ -n "$plugin_path" ]; then
        printf 'global|plugin|%s' "$plugin_path"
        return 0
      fi
      cache_root="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/cache"
      hit="$(_find_superpowers_in_plugin_cache "$cache_root" || true)"
      if [ -n "$hit" ]; then
        printf 'global|plugin-cache|%s' "$hit"
        return 0
      fi
      ;;
    codebuddy)
      plugin_path="$(_first_existing_dir \
        "$HOME/.codebuddy/plugins/marketplaces"/*/external_plugins/superpowers \
        || true)"
      if [ -n "$plugin_path" ]; then
        printf 'global|plugin|%s' "$plugin_path"
        return 0
      fi
      ;;
  esac

  config_dir="$(platform_config_dir "$platform_id")"
  hit="$(_has_superpowers_skills_in_dir "$HOME/$config_dir/skills" || true)"
  if [ -n "$hit" ]; then
    printf 'global|skills|%s' "$hit"
    return 0
  fi

  return 1
}

_find_superpowers_project() {
  local platform_id="$1"
  local config_dir hit=""

  config_dir="$(platform_config_dir "$platform_id")"
  hit="$(_has_superpowers_skills_in_dir "$REPO_ROOT/$config_dir/skills" || true)"
  if [ -n "$hit" ]; then
    printf 'project|skills|%s' "$hit"
    return 0
  fi

  return 1
}

_find_openspec_global() {
  local platform_id="$1"
  local config_dir path="" version="" hit=""

  if command -v openspec >/dev/null 2>&1; then
    path="$(command -v openspec)"
    version="$(openspec --version 2>/dev/null | head -n1 || echo 'unknown')"
    printf 'global|cli|%s|openspec|%s' "$path" "$version"
    return 0
  fi

  if command -v openspec-cn >/dev/null 2>&1; then
    path="$(command -v openspec-cn)"
    version="$(openspec-cn --version 2>/dev/null | head -n1 || echo 'unknown')"
    printf 'global|cli|%s|openspec-cn|%s' "$path" "$version"
    return 0
  fi

  config_dir="$(platform_config_dir "$platform_id")"
  hit="$(_has_openspec_skills_in_dir "$HOME/$config_dir/skills" || true)"
  if [ -n "$hit" ]; then
    printf 'global|skills|%s' "$hit"
    return 0
  fi

  return 1
}

_find_openspec_project() {
  local platform_id="$1"
  local config_dir path="" version="" hit=""

  if [ -x "$REPO_ROOT/node_modules/.bin/openspec" ]; then
    path="$REPO_ROOT/node_modules/.bin/openspec"
    version="$("$path" --version 2>/dev/null | head -n1 || echo 'unknown')"
    printf 'project|cli|%s|openspec|%s' "$path" "$version"
    return 0
  fi

  if [ -x "$REPO_ROOT/node_modules/.bin/openspec-cn" ]; then
    path="$REPO_ROOT/node_modules/.bin/openspec-cn"
    version="$("$path" --version 2>/dev/null | head -n1 || echo 'unknown')"
    printf 'project|cli|%s|openspec-cn|%s' "$path" "$version"
    return 0
  fi

  config_dir="$(platform_config_dir "$platform_id")"
  hit="$(_has_openspec_skills_in_dir "$REPO_ROOT/$config_dir/skills" || true)"
  if [ -n "$hit" ]; then
    printf 'project|skills|%s' "$hit"
    return 0
  fi

  return 1
}

find_plugin() {
  local platform_id="$1"
  local plugin_name="$2"

  case "$plugin_name" in
    superpowers)
      _find_superpowers_global "$platform_id" || _find_superpowers_project "$platform_id"
      ;;
    openspec)
      _find_openspec_global "$platform_id" || _find_openspec_project "$platform_id"
      ;;
    *)
      return 1
      ;;
  esac
}

print_install_hints() {
  local platform_id="$1"
  local plugin_name="$2"

  case "$plugin_name" in
    superpowers)
      case "$platform_id" in
        claude)
          _log_hint "  - Claude Code：Plugin 设置 → Add plugin → superpowers（要求 >= 4.0.0）"
          _log_hint "  - 或：npx skills add obra/superpowers -a claude-code"
          ;;
        codebuddy)
          _log_hint "  - CodeBuddy：Plugin Marketplace → 搜索 superpowers → Install"
          _log_hint "  - 或：npx skills add obra/superpowers -a codebuddy"
          ;;
        trae)
          _log_hint "  - Trae：npx skills add obra/superpowers -a trae"
          _log_hint "  - 全局：写入 ~/.trae/skills/；项目级：在项目根执行"
          ;;
        qoder)
          _log_hint "  - Qoder：npx skills add obra/superpowers -a qoder"
          _log_hint "  - 全局：写入 ~/.qoder/skills/；项目级：在项目根执行"
          ;;
      esac
      _log_hint "  - 详情：https://github.com/obra/superpowers"
      ;;
    openspec)
      _log_hint "  - 官方 CLI：npm install -g @fission-ai/openspec@latest"
      _log_hint "  - 社区 CLI：npm install -g @studyzy/openspec-cn（需别名为 openspec）"
      _log_hint "  - 验证：openspec --version"
      _log_hint "  - 详情：https://github.com/Fission-AI/OpenSpec"
      ;;
  esac
}

# ---------------------------------------------------------------------------
# 唯一主入口：按平台 + 插件名检测单个 plugin
# ---------------------------------------------------------------------------

check_platform_plugin() {
  local platform_id="$1"
  local plugin_name="$2"
  local display_name result=""
  local scope="" kind="" path="" variant="" version=""
  local ok=0 warn=0

  display_name="$(platform_display_name "$platform_id")"

  if [ "$OUTPUT_JSON" -eq 0 ] && [ "$QUIET" -eq 0 ]; then
    _tty "=== polaris-flow Plugin Check ==="
    _tty "platform: ${display_name} (${platform_id})"
    _tty "plugin: ${plugin_name}"
    _tty "repo_root: ${REPO_ROOT}"
  fi

  result="$(find_plugin "$platform_id" "$plugin_name" || true)"

  if [ -n "$result" ]; then
    scope="${result%%|*}"
    kind="$(printf '%s' "$result" | cut -d'|' -f2)"
    if [ "$kind" = "cli" ]; then
      path="$(printf '%s' "$result" | cut -d'|' -f3)"
      variant="$(printf '%s' "$result" | cut -d'|' -f4)"
      version="$(printf '%s' "$result" | cut -d'|' -f5)"
      ok=1
      if [ "$variant" = "openspec-cn" ]; then
        warn=1
        _log_ok "${plugin_name} (${scope}/cli): ${path} (${version})"
        _log_hint "注意：下游 skill 调用裸名 openspec；请将 openspec-cn 软链/别名为 openspec"
      else
        _log_ok "${plugin_name} (${scope}/cli): ${path} (${version})"
      fi
    else
      path="$(printf '%s' "$result" | cut -d'|' -f3-)"
      ok=1
      _log_ok "${plugin_name} (${scope}/${kind}): ${path}"
    fi
  else
    case "$plugin_name" in
      superpowers)
        _log_warn "superpowers 未找到 — ${display_name} 上多数 skill 依赖 subagent 派发能力"
        ;;
      openspec)
        _log_warn "openspec 未找到 — propose/design/build 等阶段依赖 openspec"
        ;;
    esac
    print_install_hints "$platform_id" "$plugin_name"
  fi

  if [ "$OUTPUT_JSON" -eq 1 ]; then
    local overall_ok=0
    if [ "$ok" -eq 1 ] && [ "$warn" -eq 0 ]; then
      overall_ok=1
    fi
    printf '{'
    printf '"ok":%s,' "$([ "$overall_ok" -eq 1 ] && printf 'true' || printf 'false')"
    printf '"platform":"%s",' "$(_json_escape "$platform_id")"
    printf '"plugin":"%s",' "$(_json_escape "$plugin_name")"
    printf '"repo_root":"%s",' "$(_json_escape "$REPO_ROOT")"
    if [ "$ok" -eq 1 ]; then
      if [ "$kind" = "cli" ]; then
        printf '"result":{"status":"%s","scope":"%s","kind":"cli","path":"%s","variant":"%s","version":"%s"}' \
          "$([ "$warn" -eq 1 ] && printf 'warn' || printf 'ok')" \
          "$(_json_escape "$scope")" "$(_json_escape "$path")" \
          "$(_json_escape "$variant")" "$(_json_escape "$version")"
      else
        printf '"result":{"status":"ok","scope":"%s","kind":"%s","path":"%s"}' \
          "$(_json_escape "$scope")" "$(_json_escape "$kind")" "$(_json_escape "$path")"
      fi
    else
      printf '"result":{"status":"missing"}'
    fi
    printf '}\n'
  fi

  if [ "$OUTPUT_JSON" -eq 0 ] && [ "$ok" -eq 1 ] && [ "$warn" -eq 0 ] && [ "$QUIET" -eq 0 ]; then
    _tty ""
    _tty "=== polaris-flow plugin ready ==="
  fi

  if [ "$ok" -eq 0 ] || [ "$warn" -eq 1 ]; then
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# 参数解析
# ---------------------------------------------------------------------------

usage() {
  cat <<'EOF'
用法：bash plugin-check.sh --platform <id> --plugin <name> [--json] [--quiet] [<repo_root>]

平台（必填）：claude | trae | qoder | codebuddy
插件（必填）：openspec | superpowers
检测顺序：先全局，全局未命中再查项目

选项：
  --json     输出 JSON
  --quiet    仅在有缺失/告警时输出
  -h, --help 显示帮助

退出码：0=通过；1=缺失/告警；2=参数错误
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --json)
      OUTPUT_JSON=1
      shift
      ;;
    --quiet)
      QUIET=1
      shift
      ;;
    --platform)
      PLATFORM_ID="${2:-}"
      [ -n "${PLATFORM_ID}" ] || { echo "[plugin-check] --platform 需要参数" >&2; exit 2; }
      shift 2
      ;;
    --plugin)
      PLUGIN_NAME="${2:-}"
      [ -n "${PLUGIN_NAME}" ] || { echo "[plugin-check] --plugin 需要参数" >&2; exit 2; }
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "[plugin-check] 未知选项：$1" >&2
      exit 2
      ;;
    *)
      if [ -z "$REPO_ROOT" ]; then
        REPO_ROOT="$1"
      else
        echo "[plugin-check] 多余参数：$1" >&2
        exit 2
      fi
      shift
      ;;
  esac
done

if [ -z "${PLATFORM_ID}" ]; then
  echo "[plugin-check] 缺少必填参数 --platform（可选：${SUPPORTED_PLATFORMS[*]}）" >&2
  exit 2
fi

if [ -z "${PLUGIN_NAME}" ]; then
  echo "[plugin-check] 缺少必填参数 --plugin（可选：${SUPPORTED_PLUGINS[*]}）" >&2
  exit 2
fi

if ! is_supported_platform "${PLATFORM_ID}"; then
  echo "[plugin-check] 不支持的平台：${PLATFORM_ID}（可选：${SUPPORTED_PLATFORMS[*]}）" >&2
  exit 2
fi

if ! is_supported_plugin "${PLUGIN_NAME}"; then
  echo "[plugin-check] 不支持的插件：${PLUGIN_NAME}（可选：${SUPPORTED_PLUGINS[*]}）" >&2
  exit 2
fi

if [ -z "$REPO_ROOT" ]; then
  REPO_ROOT="$(pwd)"
fi

if [ ! -d "$REPO_ROOT" ]; then
  echo "[plugin-check] repo_root 不是目录：${REPO_ROOT}" >&2
  exit 2
fi

REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"

set +e
check_platform_plugin "${PLATFORM_ID}" "${PLUGIN_NAME}"
exit_code=$?
set -e

exit "$exit_code"
