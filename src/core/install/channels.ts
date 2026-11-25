/**
 * 组件安装通道配置（npm → git 镜像 → 本地目录）的统一解析层。
 *
 * 三层来源，优先级从高到低：CLI flag → 环境变量 → `~/.polaris/polaris.yaml` 的 install: 段。
 * 离线安装包的 config.ini 不在本层语义内：它由 install.sh/ps1 消费并转译写入 polaris.yaml
 * （config.ini 是运输格式，运行时配置源只有本层这三层，唯一源原则）。
 */
import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';

import { getGlobalPolarisConfigPath } from '../assets/polaris-paths.js';
import { POLARIS_NPM_REGISTRY_ENV } from '../config/polaris-constants.js';
import { localPathComponentIds } from '../deps/registry.js';

/** 可配置本地源码目录的组件 id（取自依赖登记表，勿在此另立名单） */
export type ChannelComponentId = string;

/**
 * 支持 `install.local-paths.<id>` 的组件 id：登记表里所有有外部获取通道的依赖。
 *
 * 原先这里是硬编码的 `['openspec','superpowers','codegraph']`，漏了附带技能，
 * 导致 archify / diagram-design 无法按组件指定本地目录（只能整批覆盖源根）。
 */
export const CHANNEL_COMPONENT_IDS: readonly ChannelComponentId[] = localPathComponentIds();

function isChannelComponentId(value: string): value is ChannelComponentId {
  return CHANNEL_COMPONENT_IDS.includes(value);
}

/** 解析后的三通道配置 */
export type InstallChannelConfig = {
  /** GitHub 镜像基址（git clone 通道）；未配置 = 直连 github.com */
  githubMirror?: string;
  /** npm registry 覆盖（npm 通道 --registry）；未配置 = 机器默认（~/.npmrc） */
  npmRegistry?: string;
  /** 各组件本机源码目录（本地目录通道）；未配置的组件跳过该通道 */
  localPaths: Record<ChannelComponentId, string | undefined>;
};

/** CLI 层最高优先级覆盖（--github-mirror / --npm-registry / --local-path） */
export type InstallChannelOverrides = {
  githubMirror?: string;
  npmRegistry?: string;
  localPaths?: Record<ChannelComponentId, string | undefined>;
};

/** 组件本地目录的环境变量名：`POLARIS_<ID>_PATH`（连字符转下划线） */
function localPathEnvKey(id: string): string {
  return `POLARIS_${id.toUpperCase().replace(/-/g, '_')}_PATH`;
}

/** 环境变量名（与离线安装包 config.ini 键名保持一致） */
export const CHANNEL_ENV_KEYS: {
  githubMirror: string;
  npmRegistry: string;
  localPaths: Record<string, string>;
} = {
  githubMirror: 'POLARIS_GITHUB_MIRROR',
  npmRegistry: POLARIS_NPM_REGISTRY_ENV,
  localPaths: Object.fromEntries(CHANNEL_COMPONENT_IDS.map((id) => [id, localPathEnvKey(id)])),
};

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** 解析 `--local-path` 单值（`<组件>=<目录>`）；非法输入返回 null */
export function parseLocalPathPair(raw: string): [ChannelComponentId, string] | null {
  const eq = raw.indexOf('=');
  if (eq <= 0) return null;
  const id = raw.slice(0, eq).trim();
  const dir = nonEmpty(raw.slice(eq + 1));
  if (!dir || !isChannelComponentId(id)) return null;
  return [id, dir];
}

/** 批量解析 `--local-path` 值；非法项归入 invalid，供 CLI 层报错而不是静默丢弃 */
export function parseLocalPathPairs(raws: string[]): {
  localPaths: Partial<Record<ChannelComponentId, string>>;
  invalid: string[];
} {
  const localPaths: Partial<Record<ChannelComponentId, string>> = {};
  const invalid: string[] = [];
  for (const raw of raws) {
    const pair = parseLocalPathPair(raw);
    if (pair) {
      localPaths[pair[0]] = pair[1];
    } else {
      invalid.push(raw);
    }
  }
  return { localPaths, invalid };
}

/**
 * 读取 `~/.polaris/polaris.yaml` 的 install: 段。
 * 文件缺失或格式损坏按「未配置」处理，不让 init 因用户手改坏配置而崩溃。
 */
export async function readInstallSectionFromFile(
  configPath: string = getGlobalPolarisConfigPath(),
): Promise<InstallChannelConfig> {
  const empty: InstallChannelConfig = { localPaths: {} };

  let text: string;
  try {
    text = await readFile(configPath, 'utf-8');
  } catch {
    return empty;
  }

  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    return empty;
  }

  const install = (doc as Record<string, unknown> | null)?.install;
  if (!install || typeof install !== 'object') {
    return empty;
  }

  const section = install as Record<string, unknown>;
  const localPaths: Partial<Record<ChannelComponentId, string>> = {};
  const rawPaths = section['local-paths'];
  if (rawPaths && typeof rawPaths === 'object') {
    for (const id of CHANNEL_COMPONENT_IDS) {
      const dir = nonEmpty((rawPaths as Record<string, unknown>)[id] as string | undefined);
      if (dir) localPaths[id] = dir;
    }
  }

  return {
    githubMirror: nonEmpty(section['github-mirror'] as string | undefined),
    npmRegistry: nonEmpty(section['npm-registry'] as string | undefined),
    localPaths,
  };
}

function readEnvLayer(env: NodeJS.ProcessEnv = process.env): InstallChannelConfig {
  const localPaths: Partial<Record<ChannelComponentId, string>> = {};
  for (const id of CHANNEL_COMPONENT_IDS) {
    const dir = nonEmpty(env[CHANNEL_ENV_KEYS.localPaths[id]]);
    if (dir) localPaths[id] = dir;
  }
  return {
    githubMirror: nonEmpty(env[CHANNEL_ENV_KEYS.githubMirror]),
    npmRegistry: nonEmpty(env[CHANNEL_ENV_KEYS.npmRegistry]),
    localPaths,
  };
}

function mergeLayer(
  base: InstallChannelConfig,
  override: InstallChannelConfig,
): InstallChannelConfig {
  const localPaths = { ...base.localPaths };
  for (const id of CHANNEL_COMPONENT_IDS) {
    const dir = override.localPaths[id];
    if (dir) localPaths[id] = dir;
  }
  return {
    githubMirror: override.githubMirror ?? base.githubMirror,
    npmRegistry: override.npmRegistry ?? base.npmRegistry,
    localPaths,
  };
}

/**
 * 解析三通道配置：CLI flag > 环境变量 > polaris.yaml install: 段。
 * @param overrides CLI flag 层
 * @param configPath 全局配置路径（默认 ~/.polaris/polaris.yaml；测试注入用）
 */
export async function resolveInstallChannelConfig(
  overrides?: InstallChannelOverrides,
  configPath?: string,
): Promise<InstallChannelConfig> {
  const fileLayer = await readInstallSectionFromFile(configPath ?? getGlobalPolarisConfigPath());
  const envLayer = readEnvLayer();
  const flagLayer: InstallChannelConfig = {
    githubMirror: nonEmpty(overrides?.githubMirror),
    npmRegistry: nonEmpty(overrides?.npmRegistry),
    localPaths: overrides?.localPaths ?? {},
  };
  return mergeLayer(mergeLayer(fileLayer, envLayer), flagLayer);
}
