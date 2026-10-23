#!/usr/bin/env node

/**
 * 发布前安全检查，扫描待发布文件中的常见密钥模式。
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const SECRET_PATTERNS = [
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/i, name: 'API key' },
  {
    pattern: /(?:secret|token|password|passwd|pwd)\s*[:=]\s*['"][^\s'"]{8,}['"]/i,
    name: 'Secret/token',
  },
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/, name: 'Private key' },
  { pattern: /ghp_[A-Za-z0-9]{36}/, name: 'GitHub token' },
  { pattern: /sk-[A-Za-z0-9]{20,}/, name: 'OpenAI key' },
  { pattern: /xoxb-[0-9]+-[A-Za-z0-9]+/, name: 'Slack token' },
  { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS access key' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
// 按相对路径整体跳过的目录（相对仓库根，用 / 分隔）：
//   devops/vendor/  第三方 vendored 副本（superpowers / bundled-skills / tgz），.gitignore 排除、
//                   不进 npm files；里面命中的都是上游测试夹具里的假 token，属噪声
//   release/        package.sh 的构建产物，内容就是 vendor 的副本，再扫一遍纯属重复
//   .workbuddy/     AI 工作记忆（git 跟踪、不进 npm files）。它按设计会记录「什么写法规避密钥
//                   扫描」，天然带 token 字面样例 → 必然误报；dev.sh / publish.sh 的脏检查同样排除它
const SKIP_PATHS = new Set(['devops/vendor', 'release', '.workbuddy']);
// .vue 也要扫：Dashboard 前端（dashboard/）的组件是 .vue，不纳入即为密钥扫描盲点
const TEXT_EXTENSIONS = new Set([
  '.js',
  '.ts',
  '.json',
  '.md',
  '.txt',
  '.yml',
  '.yaml',
  '.toml',
  '.vue',
  '.html',
  '.css',
]);
const README_IMAGE_PATTERN = /\b(?:src|srcset)=["'](?:\.\/)?img\//;

function* walkFiles(dir, rel = '') {
  for (const entry of readdirSync(dir)) {
    const relPath = rel ? `${rel}/${entry}` : entry;
    if (SKIP_PATHS.has(relPath)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) {
        yield* walkFiles(full, relPath);
      }
    } else if (stat.isFile()) {
      yield full;
    }
  }
}

let found = 0;

for (const filePath of walkFiles('.')) {
  const ext = extname(filePath);
  if (!TEXT_EXTENSIONS.has(ext)) continue;

  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    continue;
  }

  for (const { pattern, name } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      console.error(`[SECURITY] Possible ${name} found in ${filePath}`);
      found++;
    }
  }

  if (/README(?:-zh)?\.md$/.test(filePath) && README_IMAGE_PATTERN.test(content)) {
    console.error(
      `[PACKAGE] npm README images must use absolute URLs, not local img/ paths: ${filePath}`,
    );
    found++;
  }
}

if (found > 0) {
  console.error(`\n[SECURITY] ${found} potential secret(s) detected. Aborting publish.`);
  console.error('Review the files above and remove any secrets before publishing.');
  process.exit(1);
}

console.log('[SECURITY] No secrets detected. Safe to publish.');
