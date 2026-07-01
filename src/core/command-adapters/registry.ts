/**
 * 命令适配器注册表 — 将 platformId 映射到对应 adapter。
 */

import type { CommandAdapter } from './types.js';
import { claudeAdapter } from './claude.js';
import { codexAdapter } from './codex.js';
import { windsurfAdapter } from './windsurf.js';
import { geminiAdapter } from './gemini.js';
import { piAdapter } from './pi.js';
import { defaultAdapter } from './default.js';

const ALL_ADAPTERS: CommandAdapter[] = [
  claudeAdapter,
  codexAdapter,
  windsurfAdapter,
  geminiAdapter,
  piAdapter,
  defaultAdapter,
];

const adapterMap = new Map<string, CommandAdapter>();

for (const adapter of ALL_ADAPTERS) {
  for (const id of adapter.platformIds) {
    adapterMap.set(id, adapter);
  }
}

/** 获取平台命令适配器；未命中时回退 defaultAdapter */
export function getCommandAdapter(platformId: string): CommandAdapter {
  return adapterMap.get(platformId) ?? defaultAdapter;
}
