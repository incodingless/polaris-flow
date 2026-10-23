#!/usr/bin/env node

/**
 * 安装后提示用户运行 polaris init。
 *
 * 以下情况跳过提示：
 * - CI=true 环境变量已设置
 * - POLARIS_FLOW_NO_HINTS=1 环境变量已设置
 * - dist/ 目录不存在（本地开发场景）
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function shouldSkip() {
  if (process.env.CI === 'true' || process.env.CI === '1') return true;
  if (process.env.POLARIS_FLOW_NO_HINTS === '1') return true;
  return false;
}

async function distExists() {
  try {
    const stat = await fs.stat(path.join(__dirname, '..', 'dist'));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function main() {
  try {
    if (shouldSkip()) return;
    if (!(await distExists())) return;
    console.log(`\nTip: Run 'polaris init' to set up Polaris Flow workflow in your project`);
  } catch {
    // 安装流程不应因提示失败而中断
  }
}

main().catch(() => process.exit(0));
