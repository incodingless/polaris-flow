/**
 * `.polaris/config.yaml` 的类型定义与读写逻辑。
 * 供 init 写入初始配置，后续命令可读取/更新工作流状态。
 */
import path from 'path';
import { writeFile, readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';

import { fileExists, ensureDir } from '../../utils/file-system.js';
import type { Language } from '../types.js';

/** 上下文压缩开关 */
export type ContextCompression = 'off' | 'beta';
/** 审查模式 */
export type ReviewMode = 'off' | 'standard' | 'thorough';

/** init 写入 config 时的可选平台字段 */
export type PolarisConfigWriteOptions = {
  platform?: string;
  plugin_root?: string;
};

/** `.polaris/config.yaml` 的结构 */
export interface PolarisConfig {
  lang: Language;
  created_at: string;
  workflow: string;
  phase: string;
  auto_transition: boolean;
  context_compression: ContextCompression;
  review_mode: ReviewMode;
  /** 主平台 id（如 trae / claude） */
  platform?: string;
  /** 插件根目录，相对仓库根，如 .claude/skills/polaris-flow */
  plugin_root?: string;
}

/** 生成 init 阶段的默认配置 */
export function createDefaultPolarisConfig(
  lang: Language,
  options: PolarisConfigWriteOptions = {},
): PolarisConfig {
  return {
    lang,
    created_at: new Date().toISOString(),
    workflow: '',
    phase: '',
    auto_transition: true,
    context_compression: 'off',
    review_mode: 'off',
    ...(options.platform ? { platform: options.platform } : {}),
    ...(options.plugin_root ? { plugin_root: options.plugin_root } : {}),
  };
}

/** 将配置格式化为带分区注释的 YAML 文本 */
function formatPolarisConfigYaml(config: PolarisConfig): string {
  const lines = ['# 基础', `lang: ${config.lang}`, `created_at: '${config.created_at}'`];

  if (config.platform) {
    lines.push(`platform: ${config.platform}`);
  }
  if (config.plugin_root) {
    lines.push(`plugin_root: ${config.plugin_root}`);
  }

  lines.push(
    '',
    '# 工作流状态',
    `workflow: '${config.workflow}'`,
    `phase: '${config.phase}'`,
    `auto_transition: ${config.auto_transition}`,
    '',
    '# 功能开关',
    '# context_compression: off | beta',
    `context_compression: ${config.context_compression}`,
    '# review_mode: off | standard | thorough',
    `review_mode: ${config.review_mode}`,
    '',
  );

  return lines.join('\n');
}

/** 返回项目内 config.yaml 的路径 */
export function getPolarisConfigPath(projectPath: string): string {
  return path.join(projectPath, '.polaris', 'config.yaml');
}

/** 若 config.yaml 不存在则写入默认配置 */
export async function writePolarisConfigIfMissing(
  projectPath: string,
  lang: Language,
  options: PolarisConfigWriteOptions = {},
): Promise<boolean> {
  const polarisDir = path.join(projectPath, '.polaris');
  await ensureDir(polarisDir);

  const configPath = getPolarisConfigPath(projectPath);
  if (await fileExists(configPath)) {
    return false;
  }

  const config = createDefaultPolarisConfig(lang, options);
  await writeFile(configPath, formatPolarisConfigYaml(config), 'utf-8');
  return true;
}

/** 读取 `.polaris/config.yaml`；不存在或解析失败时返回 null */
export async function loadPolarisConfig(projectPath: string): Promise<PolarisConfig | null> {
  const configPath = getPolarisConfigPath(projectPath);
  if (!(await fileExists(configPath))) {
    return null;
  }

  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as Partial<PolarisConfig>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as PolarisConfig;
  } catch {
    return null;
  }
}
