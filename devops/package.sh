#!/usr/bin/env bash
# Polaris Flow 离线安装包打包脚本（维护者侧）。
#
# 产出 release-<version>-<YYYYMMDD>/ 目录（安装介质），可整体 zip 后分发给内网用户：
#   release-<version>-<YYYYMMDD>/
#   ├─ install.sh            # 与仓库根同源（构建时拷入，不 fork）
#   ├─ install.ps1
#   ├─ config.ini            # 扁平 KEY=VALUE（用户可编辑）
#   ├─ bundle-manifest.json  # 组件版本清单（install.sh 记录 plugins 段用）
#   ├─ 安装手册-*.md/.pdf     # 使用者文档：从 docs/releases/ 拷入
#   ├─ 命令使用说明.md
#   ├─ 使用帮助.md
#   ├─ CHANGELOG.md          # 变更记录：从仓库根拷入，便于使用者核对版本变更
#   ├─ 使用者速查卡.pdf
#   └─ components/
#      ├─ openspec-<ver>.tgz      # npm pack 产物（离线免构建）
#      ├─ codegraph-<ver>.tgz     # npm pack 产物
#      ├─ superpowers-<ver>.tgz   # 源码目录 tar 产物（安装时由 preseed 解包）
#      └─ bundled-skills/         # 附带技能（archify / diagram-design），随包分发给用户
#
# 适用边界：内网可达 Nexus、公网 GitHub 不可达。.tgz 的第三方依赖仍走 config.ini
# 里的 npm registry，所以 bundle 不是纯离线件。
#
# ⚠️ 与 `src/core/deps/registry.ts` 的依赖登记表保持同步：
#   - `github-copy` 类依赖（附带技能）：把源放进 devops/vendor/bundled-skills/<id>/ 即可，
#     本脚本整目录拷贝，**无需改代码**；registry 里的 fallback.relPath 应指向它
#   - `npm-cli` 类依赖（openspec / codegraph）：新增一条时必须在下面加一次 pack_cli 调用
#     并产出 components/<relPath>-<ver>.tgz，否则离线安装拿不到保底（声明了 fallback 却是空的）
#   - `npx-skills` 类依赖（superpowers）：tgz 由源码目录 tar 出来，preseed 解包成目录供 installSource 消费
#
# 组件来源（本地 vendor 优先，避免频繁打包反复从 GitHub/npm 拉取）：
#   devops/vendor/components/*.tgz   三包 tgz 缓存（唯一持久形态）
#   devops/vendor/superpowers/       superpowers 源码构建中间态（仅在缓存未命中时 clone，不入包）
#   devops/vendor/bundled-skills/    附带技能（图表工具），缺则由 init 从 GitHub 补齐
#   ⚠️ 三者都**不提交 git**（.gitignore: `devops/vendor/*`）：它们是后备副本，
#      优先从 GitHub 下载，本地副本只为网络慢/超时时保住一次安装成功率。
#
# 用法:
#   bash devops/package.sh                     # 全默认：superpowers 用内置 vendor，CLI 取 latest
#   bash devops/package.sh --openspec 1.14.3 --codegraph 1.6.2
#   bash devops/package.sh --refresh           # 忽略 vendor 缓存，强制重新拉取组件
#   bash devops/package.sh --zip               # 额外打 release-<version>-<YYYYMMDD>.zip
#
# 可选参数:
#   --openspec <ver>     钉 OpenSpec 版本（默认 latest）
#   --codegraph <ver>    钉 Codegraph 版本（默认 latest）
#   --superpowers <ref>  superpowers 的 tag/分支（默认自动取 >= minVersion 的最新 tag）
#   --registry <url>     npm pack 拉包源，同时作为 config.ini 的默认 npm-registry
#   --out <dir>          输出目录（默认 release-<version>-<YYYYMMDD>/）
#   --refresh            忽略 vendor 缓存，强制重新 clone superpowers + npm pack
#   --zip                打包完成后生成 <out>.zip

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SUPERPOWERS_REPO="https://github.com/obra/superpowers"
SUPERPOWERS_MIN_VERSION="4.0.0"
OPENSPEC_PACKAGE="@fission-ai/openspec"
CODEGRAPH_PACKAGE="@colbymchenry/codegraph"
DEFAULT_REGISTRY="http://192.168.103.96:8081/repository/npm-group/"

OPENSPEC_VERSION=""
CODEGRAPH_VERSION=""
SUPERPOWERS_REF=""
REGISTRY="${NPM_REGISTRY:-$DEFAULT_REGISTRY}"
# 默认输出目录名带上版本号与生成日期（release-<version>-<YYYYMMDD>），`--out` 可显式覆盖
pkg_version="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"
build_date="$(date +%Y%m%d)"
OUT_DIR="release-${pkg_version}-${build_date}"
DO_ZIP=false
REFRESH=false

# 内置/缓存组件目录（均不提交 git，见 .gitignore 的 devops/vendor/*）
VENDOR_DIR="$ROOT/devops/vendor"
SUPERPOWERS_VENDOR="$VENDOR_DIR/superpowers"
COMPONENTS_VENDOR="$VENDOR_DIR/components"

info() { echo "==> $*"; }
warn() { echo "warn: $*" >&2; }
die() { echo "error: $*" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法: bash devops/package.sh [选项]

  --openspec <ver>      钉 OpenSpec 版本（默认 latest）
  --codegraph <ver>     钉 Codegraph 版本（默认 latest）
  --superpowers <ref>   superpowers 的 tag/分支（默认自动取 >= minVersion 的最新 tag）
  --registry <url>      npm pack 拉包源 + config.ini 默认 npm-registry
  --out <dir>           输出目录（默认 release-<version>-<YYYYMMDD>/）
  --refresh             忽略 vendor 缓存，强制重新拉取组件
  --zip                 打包完成后生成 <out>.zip
  -h|--help             显示帮助
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --openspec) OPENSPEC_VERSION="${2:?缺少版本号}"; shift 2 ;;
    --codegraph) CODEGRAPH_VERSION="${2:?缺少版本号}"; shift 2 ;;
    --superpowers) SUPERPOWERS_REF="${2:?缺少 ref}"; shift 2 ;;
    --registry) REGISTRY="${2:?缺少地址}"; shift 2 ;;
    --out) OUT_DIR="${2:?缺少目录}"; shift 2 ;;
    --refresh) REFRESH=true; shift ;;
    --zip) DO_ZIP=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1（--help 查看用法）" ;;
  esac
done

# 环境校验：git / npm / node 均为打包必需
command -v git >/dev/null 2>&1 || die "缺少 git"
command -v npm >/dev/null 2>&1 || die "缺少 npm"
command -v node >/dev/null 2>&1 || die "缺少 node"

# semver_ge a b → 退出码 0 表示 a >= b（用 node 做语义化比较，跨平台稳定）
semver_ge() {
  node -e '
    const [a, b] = process.argv.slice(1);
    const p = (s) => String(s).split(".").map((n) => parseInt(n, 10) || 0);
    const A = p(a), B = p(b);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const d = (A[i] || 0) - (B[i] || 0);
      if (d !== 0) process.exit(d > 0 ? 0 : 1);
    }
    process.exit(0);
  ' "$1" "$2"
}

# 解析 superpowers 版本：>= minVersion 的最新 tag；取不到则回退 HEAD
resolve_superpowers_version() {
  if [ -n "$SUPERPOWERS_REF" ]; then
    echo "$SUPERPOWERS_REF"
    return
  fi
  local latest
  latest="$(git ls-remote --tags --sort=-v:refname "$SUPERPOWERS_REPO" 2>/dev/null \
    | sed -nE 's#.*refs/tags/v?([0-9]+\.[0-9]+\.[0-9]+)$#\1#p' | head -n1)"
  if [ -n "$latest" ] && semver_ge "$latest" "$SUPERPOWERS_MIN_VERSION"; then
    echo "$latest"
  else
    echo ""
  fi
}

# 从组件缓存里选出指定前缀的最高版本（点分数字比较，避免字典序把 1.9.0 排在 1.16.1 前面）
latest_cached_version() {
  COMPONENTS_DIR="$COMPONENTS_VENDOR" PREFIX="$1" node -e '
    const fs = require("fs");
    const dir = process.env.COMPONENTS_DIR;
    if (!fs.existsSync(dir)) process.exit(0);
    const re = new RegExp("^" + process.env.PREFIX + "-([0-9]+\\.[0-9]+\\.[0-9]+)\\.tgz$");
    const versions = fs.readdirSync(dir)
      .map((name) => (re.exec(name) || [])[1])
      .filter(Boolean);
    const parts = (v) => v.split(".").map((n) => parseInt(n, 10) || 0);
    versions.sort((a, b) => {
      const A = parts(a), B = parts(b);
      for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i];
      return 0;
    });
    if (versions.length) process.stdout.write(versions[versions.length - 1]);
  '
}

# npm pack 一个 CLI 包：优先用 vendor/components 缓存，无则 pack 并回填缓存；返回实际版本号
pack_cli() {
  local pkg="$1" pinned="$2" out_dir="$3" shortname="$4"
  local version="$pinned"
  if [ -z "$version" ]; then
    version="$(npm view "$pkg" version --registry "$REGISTRY" 2>/dev/null)" \
      || die "无法解析 $pkg 的 latest 版本（registry: ${REGISTRY}）"
  fi
  local cached="$COMPONENTS_VENDOR/${shortname}-${version}.tgz"
  if [ -f "$cached" ] && [ "$REFRESH" != true ]; then
    info "复用缓存 ${shortname}-${version}.tgz" >&2
    cp "$cached" "$out_dir/"
  else
    info "npm pack ${pkg}@${version} ..." >&2
    mkdir -p "$COMPONENTS_VENDOR"
    local packed
    packed="$(npm pack "$pkg@$version" --pack-destination "$COMPONENTS_VENDOR" --registry "$REGISTRY" 2>/dev/null | tail -1)"
    [ -n "$packed" ] || die "npm pack $pkg 失败"
    mv "$COMPONENTS_VENDOR/$packed" "$cached"
    cp "$cached" "$out_dir/"
  fi
  echo "$version"
}

# 主流程
info "输出目录: $OUT_DIR"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/components"

# --- 1. superpowers tgz（缓存优先；源码目录仅作构建中间态） ---
# 版本来源优先级：--superpowers 钉值 > 缓存中最高版本 > 源码中间态标记/package.json > 联网 latest
superpowers_version=""
if [ -n "$SUPERPOWERS_REF" ]; then
  superpowers_version="$SUPERPOWERS_REF"
elif [ "$REFRESH" != true ]; then
  superpowers_version="$(latest_cached_version superpowers)"
fi
if [ -z "$superpowers_version" ] && [ -d "$SUPERPOWERS_VENDOR/skills" ]; then
  superpowers_version="$(cat "$SUPERPOWERS_VENDOR/.polaris-version" 2>/dev/null || true)"
  if [ -z "$superpowers_version" ]; then
    superpowers_version="$(node -e 'try{const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(p.version||"")}catch(e){}' "$SUPERPOWERS_VENDOR/package.json" 2>/dev/null || true)"
  fi
fi
if [ -z "$superpowers_version" ]; then
  superpowers_version="$(resolve_superpowers_version)"
fi

sp_cached="$COMPONENTS_VENDOR/superpowers-${superpowers_version}.tgz"
if [ -f "$sp_cached" ] && [ "$REFRESH" != true ]; then
  info "复用缓存 superpowers-${superpowers_version}.tgz"
else
  # 源码中间态版本不符或要求刷新时重新 clone，避免 tgz 文件名与内容版本错配
  sp_source_version="$(cat "$SUPERPOWERS_VENDOR/.polaris-version" 2>/dev/null || true)"
  if [ "$REFRESH" = true ] || [ ! -d "$SUPERPOWERS_VENDOR/skills" ] || [ "$sp_source_version" != "$superpowers_version" ]; then
    mkdir -p "$VENDOR_DIR"
    rm -rf "$SUPERPOWERS_VENDOR"
    if [ -n "$superpowers_version" ] && [[ "$superpowers_version" != HEAD* ]] && semver_ge "$superpowers_version" "$SUPERPOWERS_MIN_VERSION" 2>/dev/null; then
      info "git clone superpowers v${superpowers_version} ..."
      git clone --depth 1 --branch "v${superpowers_version}" "$SUPERPOWERS_REPO" "$SUPERPOWERS_VENDOR" >/dev/null 2>&1 \
        || git clone --depth 1 --branch "$superpowers_version" "$SUPERPOWERS_REPO" "$SUPERPOWERS_VENDOR" >/dev/null 2>&1 \
        || die "clone superpowers@$superpowers_version 失败"
    elif [ -n "$SUPERPOWERS_REF" ]; then
      info "git clone superpowers ${SUPERPOWERS_REF} ..."
      git clone --depth 1 --branch "$SUPERPOWERS_REF" "$SUPERPOWERS_REPO" "$SUPERPOWERS_VENDOR" >/dev/null 2>&1 \
        || die "clone superpowers@$SUPERPOWERS_REF 失败"
    else
      warn "未取到 >= ${SUPERPOWERS_MIN_VERSION} 的 tag，clone 默认分支"
      info "git clone superpowers (HEAD) ..."
      git clone --depth 1 "$SUPERPOWERS_REPO" "$SUPERPOWERS_VENDOR" >/dev/null 2>&1 \
        || die "clone superpowers 失败"
    fi
    rm -rf "$SUPERPOWERS_VENDOR/.git"
    echo "$superpowers_version" > "$SUPERPOWERS_VENDOR/.polaris-version"
  else
    info "复用内置 superpowers 源码（${superpowers_version}）"
  fi
  mkdir -p "$COMPONENTS_VENDOR"
  info "tar pack superpowers-${superpowers_version}.tgz ..."
  # COPYFILE_DISABLE=1 阻止 macOS bsdtar 把扩展属性写成 AppleDouble（._*）条目，
  # 否则解包目录会多出一套元数据文件；Linux 忽略此变量，无副作用。
  COPYFILE_DISABLE=1 tar -czf "$sp_cached" --exclude='.polaris-version' -C "$SUPERPOWERS_VENDOR" . \
    || die "打包 superpowers-${superpowers_version}.tgz 失败"
fi
cp "$sp_cached" "$OUT_DIR/components/"

# --- 1.5 附带技能（图表工具 archify / diagram-design）---
# 源与 superpowers 同性质：devops/vendor 下的本地副本，优先从 GitHub 拉、不提交 git。
# 运行时 init 也会把缺的拉到 ~/.polaris/components/bundled-skills，打包时若 vendor 已有则复用。
BUNDLED_VENDOR="$VENDOR_DIR/bundled-skills"
if [ -d "$BUNDLED_VENDOR" ]; then
  cp -R "$BUNDLED_VENDOR" "$OUT_DIR/components/bundled-skills"

  # 补齐版本标记 `.polaris-bundled-ref`：运行时 ensureBundledSkillsSource 靠它与钉值比对判齐备，
  # 缺标记会被当成历史副本，离线安装时白跑一次联网重拉并报「缺失」。vendor 里的技能有的是手工
  # 拷入的，而 sync-bundled-skills.mjs 只给「有新版」的技能写标记，缺标记会一路带进离线包。
  # 只补缺失、不覆盖已有值：标记与钉值不一致时应由运行时重拉纠正，打包不该抹平这种不一致。
  SPEC_FILE="$ROOT/src/core/integrations/bundled-skills.ts" \
  BUNDLED_DEST="$OUT_DIR/components/bundled-skills" \
  node - <<'NODE'
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(process.env.SPEC_FILE, 'utf8');
const start = source.indexOf('export const BUNDLED_SKILL_SPECS');
if (start === -1) throw new Error('找不到 BUNDLED_SKILL_SPECS，钉值源文件结构已变');
const block = source.slice(start);
const nameRe = /name:\s*'([^']+)'/g;
const entries = [];
let m;
while ((m = nameRe.exec(block)) !== null) entries.push({ name: m[1], from: m.index });
if (entries.length === 0) throw new Error('未解析到任何附带技能钉值');
for (let i = 0; i < entries.length; i++) {
  const chunk = block.slice(entries[i].from, entries[i + 1]?.from ?? block.length);
  const ref = (chunk.match(/commit:\s*'([^']+)'/) || [])[1]
    ?? (chunk.match(/version:\s*'([^']+)'/) || [])[1];
  const dir = path.join(process.env.BUNDLED_DEST, entries[i].name);
  const marker = path.join(dir, '.polaris-bundled-ref');
  if (!ref || !fs.existsSync(path.join(dir, 'SKILL.md')) || fs.existsSync(marker)) continue;
  fs.writeFileSync(marker, `${ref}\n`, 'utf8');
  console.log(`  补写版本标记: ${entries[i].name} -> ${ref}`);
}
NODE

  info "附带技能已打入: $(ls "$BUNDLED_VENDOR" 2>/dev/null | tr '\n' ' ')"
else
  warn "未找到 ${BUNDLED_VENDOR}；离线包将不含 archify / diagram-design"
  warn "补法：在有网环境跑到这一步——polaris init 会把缺的技能拉到 ~/.polaris/components/bundled-skills，再整体拷进 devops/vendor/bundled-skills"
fi

# --- 2/3. openspec / codegraph tarball ---
openspec_version="$(pack_cli "$OPENSPEC_PACKAGE" "$OPENSPEC_VERSION" "$OUT_DIR/components" "openspec")"
codegraph_version="$(pack_cli "$CODEGRAPH_PACKAGE" "$CODEGRAPH_VERSION" "$OUT_DIR/components" "codegraph")"

# --- 4. 组装 install.sh / install.ps1 / 预种脚本 ---
cp "$ROOT/install.sh" "$OUT_DIR/install.sh"
cp "$ROOT/install.ps1" "$OUT_DIR/install.ps1"
cp "$ROOT/devops/polaris-preseed.cjs" "$OUT_DIR/polaris-preseed.cjs"

# --- 5. config.ini（扁平 KEY=VALUE，用户可编辑） ---
cat > "$OUT_DIR/config.ini" <<EOF
# Polaris 离线安装包配置（KEY = VALUE，# 开头为注释，留空 = 使用默认值）
# 用户可编辑；install.sh 会在安装时读取并写入 ~/.polaris/polaris.yaml 的 install: 段

# GitHub 镜像基址（git clone 通道用）；留空 = 直连 github.com
POLARIS_GITHUB_MIRROR =

# npm registry（npm 通道用）；留空 = 使用机器默认 ~/.npmrc
POLARIS_NPM_REGISTRY = $REGISTRY
EOF

# --- 6. bundle-manifest.json（版本清单） ---
# pkg_version 已在脚本头部读取（同时用于默认输出目录名），此处直接复用
MANIFEST="$OUT_DIR/bundle-manifest.json" \
PKG_VERSION="$pkg_version" \
OPENSPEC_VERSION="$openspec_version" \
CODEGRAPH_VERSION="$codegraph_version" \
SUPERPOWERS_VERSION="$superpowers_version" \
node -e '
const fs = require("fs");
const m = {
  generated: new Date().toISOString(),
  "polaris-flow": process.env.PKG_VERSION,
  components: {
    openspec: { version: process.env.OPENSPEC_VERSION, type: "tgz" },
    codegraph: { version: process.env.CODEGRAPH_VERSION, type: "tgz" },
    superpowers: { version: process.env.SUPERPOWERS_VERSION, type: "tgz" },
  },
};
fs.writeFileSync(process.env.MANIFEST, JSON.stringify(m, null, 2) + "\n");
'

# --- 6.5 使用者文档与变更记录（拷入 docs/releases 成品 + 仓库根 CHANGELOG，随包分发）---
# 离线包自带「怎么装、怎么用」：安装手册（双平台）、命令使用说明、使用帮助、使用者速查卡。
# 缺失只告警不中断 —— PDF 是本地生成物（.gitignore 排除），没有源文件的人打不出来，
# 不应因此让整包打包失败。清单写死而非 glob：release-<version>-<YYYYMMDD>/ 里出现别的文档不该被自动带出去。
# 计数用标量而非 ${#arr[@]}：macOS 自带 bash 3.2 对空数组 + set -u 会报 unbound variable。
DOCS_SRC="$ROOT/docs/releases"
RELEASE_DOCS=(
  "安装手册-macOS.md"
  "安装手册-Windows.md"
  "安装手册-Windows.pdf"
  "命令使用说明.md"
  "使用帮助.md"
  "使用者速查卡.pdf"
)
docs_copied=""
docs_count=0
for doc in "${RELEASE_DOCS[@]}"; do
  if [ -f "$DOCS_SRC/$doc" ]; then
    cp "$DOCS_SRC/$doc" "$OUT_DIR/"
    docs_copied="${docs_copied}${doc} "
    docs_count=$((docs_count + 1))
  else
    # bash 3.2 在 UTF-8 locale 下会把 $doc 后的中文首字节吞进变量名，必须写 ${doc}
    warn "缺少使用者文档 docs/releases/${doc}（跳过）"
  fi
done
if [ "$docs_count" -eq 0 ]; then
  warn "一份使用者文档都没带上，离线包将不含安装手册"
fi

# CHANGELOG 在仓库根、不在 docs/releases，单独拷入：使用者据此了解本次离线包对应的版本变更。
# 与使用者文档同样：缺失只告警不中断，避免为一份可选文档让整包打包失败。
changelog_copied=false
if [ -f "$ROOT/CHANGELOG.md" ]; then
  cp "$ROOT/CHANGELOG.md" "$OUT_DIR/CHANGELOG.md"
  changelog_copied=true
else
  warn "缺少仓库根 CHANGELOG.md（跳过）"
fi

# --- 7. 可选 zip ---
if [ "$DO_ZIP" = true ]; then
  info "打包 ${OUT_DIR}.zip ..."
  rm -f "${OUT_DIR}.zip"
  # 必须用 bsdtar：macOS 自带 Info-ZIP 3.0 写中文文件名时不设 UTF-8 flag（0x800），
  # Windows 解压按本地代码页解释 → 文档名全成乱码。bsdtar 会正确打标。
  # 先取值再判断，不做 `tar --version | head -1 | grep -q`：head 提前退出会让上游 EPIPE，
  # pipefail 下整条管道恒为非零，判断失效。
  tar_flavor="$(tar --version 2>/dev/null | head -1 || true)"
  case "$tar_flavor" in
    *bsdtar*)
      (cd "$OUT_DIR" && tar -a -cf "../${OUT_DIR}.zip" .) || die "zip 打包失败"
      ;;
    *)
      warn "当前 tar 不是 bsdtar（GNU tar 不支持 -a 打 zip），回退到 zip"
      warn "中文文件名在 Windows 上解压可能乱码；建议在 macOS 上打 zip"
      (cd "$OUT_DIR" && zip -rq "../${OUT_DIR}.zip" .) || die "zip 打包失败"
      ;;
  esac
fi

info "完成:"
echo "  install.sh/install.ps1/polaris-preseed.cjs"
echo "  config.ini（npm-registry 默认 ${REGISTRY}）"
echo "  bundle-manifest.json"
echo "  使用者文档 ${docs_count} 份: ${docs_copied:-无}"
if [ "$changelog_copied" = true ]; then
  echo "  变更记录 CHANGELOG.md"
fi
echo "  components/superpowers@${superpowers_version}（tgz）"
echo "  components/openspec@${openspec_version}（tgz）"
echo "  components/codegraph@${codegraph_version}（tgz）"
if [ "$DO_ZIP" = true ]; then
  echo "  ${OUT_DIR}.zip"
fi
