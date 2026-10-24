#!/usr/bin/env node
// get-language-name.mjs — 通过 polaris-flow 读取 config.language，并返回语言显示名称
//
// 用法:
//   node get-language-name.mjs [repo_root]
//
// 输出: 语言名称（stdout），如 English / 中文
// 退出: 0 成功；1 CLI 不可用或读取失败；2 未知语言 ID
//
// 形态：等价于被替换的 get-language-name.sh。定位全局 polaris-flow（复用
// `_polaris-cli.mjs` 的 resolvePolarisFlow，PATH → ~/.polaris/cli/bin），捕获
// `config get language` 的 stdout 首行并映射为显示名。node 天然免疫 CRLF，
// 原 `tr -d '\r'` 保留为无害兜底。
import { spawnSync } from 'node:child_process';

import { resolvePolarisFlow } from './_polaris-cli.mjs';

const repoRoot = process.argv[2] || process.env.REPO_ROOT || process.cwd();

function fail(msg) {
  console.error(`[get-language-name] ${msg}`);
  process.exit(1);
}

const cli = resolvePolarisFlow();
if (!cli) {
  console.error('[get-language-name] polaris-flow CLI not found');
  console.error('[get-language-name] Install: npm install -g polaris-flow');
  process.exit(1);
}

// Windows 上 npm 全局 bin 是 .cmd shim，必须经 shell 执行；POSIX 直接 spawn
const viaShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cli);
const result = spawnSync(cli, ['config', 'get', 'language', repoRoot], {
  encoding: 'utf-8',
  shell: viaShell,
});

if (result.error) {
  fail(`failed to read config.language: ${result.error.message}`);
}

const langId = (result.stdout || '').split('\n')[0].replace(/\r/g, '').trim();
if (!langId) {
  fail(`failed to read config.language from ${repoRoot}`);
}

if (langId === 'en') {
  console.log('English');
} else if (langId === 'zh') {
  console.log('中文');
} else {
  console.error(`[get-language-name] unknown language id: ${langId}`);
  process.exit(2);
}
