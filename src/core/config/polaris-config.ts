/**
 * `.polaris/config.yaml` 的类型定义与读写逻辑。
 * 供 init、hooks、CLI 统一 load / save / patch。
 */
import path from 'path';
import { writeFile, readFile } from 'fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { fileExists, ensureDir } from '../../utils/file-system.js';
import {
  getPolarisConfigPath,
  getPluginRoot,
  getPluginRootRelPath,
  getPolarisDir,
  getWorktreeRoot,
} from './polaris-paths.js';

export { getPolarisConfigPath } from './polaris-paths.js';

/** 上下文压缩开关，可选值: off-不压缩 | beta-压缩 */
export type ContextCompression = 'off' | 'beta';
/** 审查模式，可选值: off-不审查 | standard-标准审查 | thorough-彻底审查 */
export type ReviewMode = 'off' | 'standard' | 'thorough';
/** 隔离模式，可选值: worktree-工作树隔离 | branch-分支隔离 */
export type IsolationMode = 'worktree' | 'branch';
/** 验证模式，可选值: light-轻量验证 | heavy-重量验证 */
export type VerifyMode = 'light' | 'heavy';
/** 自动过渡，可选值: auto-自动过渡 | off-手动过渡 */
export type AutoTransition = 'auto' | 'off';
/** 开发模式，可选值: tdd-测试驱动开发 | none-非测试驱动开发 */
export type BuildMode = 'tdd' | 'none';
/** 工作流类型，可选值: sdd | tweak | bugfix | full */
export type WorkflowType = 'sdd' | 'tweak' | 'bugfix' | 'full';
/** 任务阶段 */
export type TaskPhase =
  'idle' | 'clarify' | 'propose' | 'design' | 'plan' | 'build' | 'verify' | 'delivery' | string;
/** 语言, 可选值: en-英文 | zh-中文 */
export type Language = 'en' | 'zh';
/** 安装作用域，可选值: global-全局用户目录 | project-当前项目 */
export type InstallScope = 'global' | 'project';

/** init 写入 config 时的可选平台字段 */
export type PolarisConfigWriteOptions = {
  platform?: string;
  plugin_root?: string;
  repo_root?: string;
  scope?: InstallScope;
  plugins?: Record<string, string | number>;
  kind?: string;
  workflow?: WorkflowType;
  phase?: TaskPhase;
  auto_transition?: AutoTransition;
  context_compression?: ContextCompression;
  review_mode?: ReviewMode;
  build_mode?: BuildMode;
};

/** 模型槽位配置 */
export type PolarisModelSlots = {
  propose?: string;
  code?: string;
  review?: string;
  challenger?: string;
};

/** 评分权重等 */
export type PolarisScorerConfig = {
  model?: string;
  weights?: Record<string, number>;
};

/** 阈值 */
export type PolarisThresholds = {
  solo?: { warn_below?: number };
  team?: { block_below?: number };
};

/** triage 配置 */
export type PolarisTriageConfig = {
  mechanical_script?: string;
  sensitive_keywords_file?: string;
  default_tier_when_unclear?: string;
};

/** deepread 配置 */
export type PolarisDeepreadConfig = {
  default_action?: string;
  template_path?: string;
  output_dir?: string;
  token_threshold?: number;
};

/** 宪法配置 */
export type PolarisConstitutionConfig = {
  required?: boolean;
  path?: string;
};

/**
 * `.polaris/config.yaml` 归一化结构。
 */
export interface PolarisConfig {
  language?: Language | string;
  install_time?: string | Date;
  platform?: string;
  scope?: InstallScope | string;
  plugins?: Record<string, string | number>;
  main_repo_root?: string;
  plugin_root?: string;
  worktree_dir?: string;
  kind?: string;
  workflow?: WorkflowType | string;
  phase?: TaskPhase | string;
  verify_mode?: VerifyMode | string;
  auto_transition?: AutoTransition | string;
  isolation?: IsolationMode | string;
  context_compression?: ContextCompression | string;
  review_mode?: ReviewMode | string;
  build_mode?: BuildMode | string;
  models?: {
    high?: string[];
    medium?: string[];
    low?: string[];
  };
  model?: PolarisModelSlots;
  /** 旧版顶层 challenger.model */
  challenger?: { model?: string };
  scorer?: PolarisScorerConfig;
  thresholds?: PolarisThresholds;
  triage?: PolarisTriageConfig;
  tiers?: Record<string, { path?: string[] }>;
  deepread?: PolarisDeepreadConfig;
  constitution?: PolarisConstitutionConfig;
}

/** 生成 init 阶段的默认配置（最小集，保持既有落盘格式） */
export function createDefaultPolarisConfig(
  language: Language,
  options: PolarisConfigWriteOptions = {},
): PolarisConfig {
  return {
    language: language ?? 'zh',
    install_time: new Date().toISOString(),
    platform: options.platform ?? 'trae',
    scope: options.scope ?? 'project',
    plugins: options.plugins ?? {},
    main_repo_root: options.repo_root ?? '',
    plugin_root: options.plugin_root ?? getPluginRootRelPath(options.platform ?? 'trae'),
    worktree_dir: getWorktreeRoot(options.repo_root ?? ''),
    kind: options.kind ?? 'solo',
    workflow: options.workflow ?? 'sdd',
    phase: options.phase ?? 'clarify',
    auto_transition: options.auto_transition ?? 'auto',
    context_compression: options.context_compression ?? 'off',
    review_mode: options.review_mode ?? 'off',
    build_mode: options.build_mode ?? 'tdd',
    models: {
      high: [],
      medium: [],
      low: [],
    },
    model: {
      propose: '',
      code: '',
      review: '',
      challenger: '',
    },
  };
}

/** 将 init 最小配置格式化为带分区注释的 YAML 文本 */
function formatPolarisConfigYaml(config: PolarisConfig): string {
  const lines = [
    '# 基础',
    `language: ${config.language ?? 'zh'}`,
    `install_time: '${config.install_time ?? new Date().toISOString()}'`,
  ];

  if (config.platform) {
    lines.push(`platform: ${config.platform}`);
  }
  if (config.plugin_root) {
    lines.push(`plugin_root: ${config.plugin_root}`);
  }

  lines.push(
    '',
    '# 工作流状态',
    `workflow: '${config.workflow ?? ''}'`,
    `phase: '${config.phase ?? ''}'`,
    `auto_transition: ${config.auto_transition ?? true}`,
    '',
    '# 功能开关',
    '# context_compression: off | beta',
    `context_compression: ${config.context_compression ?? 'off'}`,
    '# review_mode: off | standard | thorough',
    `review_mode: ${config.review_mode ?? 'off'}`,
    '',
  );

  return lines.join('\n');
}

/**
 * 将 YAML 原始对象键归一为 snake_case，并回填 lang ↔ language。
 */
export function normalizePolarisConfig(raw: Record<string, unknown>): PolarisConfig {
  const flat = flattenKebabKeys(raw);
  const config = flat as PolarisConfig;

  if (!config.language) {
    config.language = 'zh' as Language;
  }
  if (!config.install_time) {
    config.install_time = new Date().toISOString();
  }

  return config;
}

/**
 * 递归把对象键从 kebab-case 转为 snake_case（已是 snake/camel 则保留）。
 */
function flattenKebabKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(flattenKebabKeys);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.includes('-') ? key.replace(/-/g, '_') : key;
    out[normalized] = flattenKebabKeys(child);
  }
  return out;
}

/**
 * 深度合并 plain object（数组直接覆盖，不按元素合并）。
 */
function deepMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMerge(
        existing as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result as T;
}

/** 若 config.yaml 不存在则写入默认配置 */
export async function writePolarisConfigIfMissing(
  projectPath: string,
  lang: Language,
  options: PolarisConfigWriteOptions = {},
): Promise<boolean> {
  await ensureDir(getPolarisDir(projectPath));

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
    const parsed = parseYaml(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return normalizePolarisConfig(parsed as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** 将配置整文件写回（YAML，无额外分区注释） */
export async function savePolarisConfig(projectPath: string, config: PolarisConfig): Promise<void> {
  await ensureDir(getPolarisDir(projectPath));
  const configPath = getPolarisConfigPath(projectPath);
  const text = stringifyYaml(config, { lineWidth: 0 });
  await writeFile(configPath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

/** 读-合并-写：partial 深度合并到现有配置；文件不存在时以 partial 为底新建 */
export async function patchPolarisConfig(
  projectPath: string,
  partial: Partial<PolarisConfig>,
): Promise<PolarisConfig> {
  const existing = (await loadPolarisConfig(projectPath)) ?? {};
  const merged = deepMerge(
    existing as Record<string, unknown>,
    partial as Record<string, unknown>,
  ) as PolarisConfig;
  await savePolarisConfig(projectPath, merged);
  return merged;
}

/**
 * 评审 agent 注入用 model：顶层 challenger.model → model.challenger → model.review → inherit。
 */
export function resolveReviewAgentModel(config: PolarisConfig | null | undefined): string {
  const legacyChallenger = config?.challenger?.model?.trim();
  if (legacyChallenger) return legacyChallenger;
  const slotChallenger = config?.model?.challenger?.trim();
  if (slotChallenger) return slotChallenger;
  const review = config?.model?.review?.trim();
  if (review) return review;
  return 'inherit';
}

/** 返回宪法相对/绝对路径；缺省 openspec/memory/constitution.md */
export function getConstitutionPath(config: PolarisConfig | null | undefined): string {
  const fromConfig = config?.constitution?.path?.trim();
  if (fromConfig) return fromConfig;
  return 'openspec/memory/constitution.md';
}

/** 创建 init 所需工作目录（.polaris、可选插件根、.worktrees） */
export async function createWorkingDirs(projectPath: string, platform?: string): Promise<void> {
  const dirs = [getPolarisDir(projectPath), getWorktreeRoot(projectPath)];
  if (platform) {
    dirs.push(getPluginRoot(projectPath, platform));
  }

  for (const dir of dirs) {
    await ensureDir(dir);
  }
}
