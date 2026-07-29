/**
 * Polaris hooks 安装：按平台写入/合并宿主 hooks 配置。
 * Trae → 独立 hooks.json；Claude/Cursor → settings*.json 的 hooks 字段。
 */
import path from 'path';

import { readJsonObjectOrEmpty, writeJsonPretty } from '../../utils/json-io.js';
import { fileExists } from '../../utils/file-system.js';
import { getSharedDir } from '../assets/manifest.js';
import type { Assets } from '../assets/manifest.js';
import type { InstallScope } from '../config/polaris-project-config.js';
import type { Platform } from '../platforms.js';

/** 模板 hooks.json 源路径：`assets/shared/hooks.json` */
export function getHooksJsonSrc(): string {
  return path.join(getSharedDir(), 'hooks.json');
}

/**
 * 解析宿主 hooks 配置落盘路径。
 * Trae：独立 hooks.json；其余 claude-code：project→settings.local.json，global→settings.json。
 * @param baseDir 平台 context 根（如 project/.claude）
 */
export function resolveHooksConfigPath(
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
): string {
  if (platform.id === 'trae') {
    return path.join(baseDir, platform.hooksConfigFile || 'hooks.json');
  }
  const fileName = scope === 'project' ? 'settings.local.json' : 'settings.json';
  return path.join(baseDir, fileName);
}

/**
 * 按平台安装 Polaris hooks。
 * - 目标不存在：写入模板
 * - overwrite：Trae 整文件覆盖；settings 仅替换 hooks 字段
 * - 非 overwrite：按事件/matcher/command 合并
 */
export async function installPolarisHooksForPlatform(
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  asset: Assets,
  overwrite: boolean = false,
): Promise<{ installed: boolean; reason?: string }> {
  if (!platform.supportsHooks || !platform.hookFormat) {
    return { installed: false, reason: 'platform does not support hooks' };
  }

  const fromAsset = asset.langFileAssets.find((a) => a.shortPath === 'hooks.json');
  const candidates = [fromAsset?.fullPath, getHooksJsonSrc()].filter((p): p is string =>
    Boolean(p),
  );

  let templatePath: string | undefined;
  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      templatePath = candidate;
      break;
    }
  }
  if (!templatePath) {
    return { installed: false, reason: 'hooks config file not found' };
  }

  const destPath = resolveHooksConfigPath(baseDir, platform, scope);
  const isStandaloneHooksFile = platform.id === 'trae';

  try {
    const template = await readJsonObjectOrEmpty(templatePath);
    const templateHooks = asHooksMap(template.hooks);

    if (!(await fileExists(destPath))) {
      if (isStandaloneHooksFile) {
        await writeJsonPretty(destPath, template);
      } else {
        await writeJsonPretty(destPath, { hooks: templateHooks });
      }
      return { installed: true };
    }

    if (overwrite) {
      if (isStandaloneHooksFile) {
        await writeJsonPretty(destPath, template);
      } else {
        const settings = await readJsonObjectOrEmpty(destPath);
        settings.hooks = templateHooks;
        await writeJsonPretty(destPath, settings);
      }
      return { installed: true };
    }

    // 合并：保留用户其它配置，合入模板 hooks
    const existing = await readJsonObjectOrEmpty(destPath);
    if (isStandaloneHooksFile) {
      const mergedHooks = mergeHooksMaps(asHooksMap(existing.hooks), templateHooks);
      const next: Record<string, unknown> = {
        ...existing,
        hooks: mergedHooks,
      };
      if (existing.$schema === undefined && template.$schema !== undefined) {
        next.$schema = template.$schema;
      }
      await writeJsonPretty(destPath, next);
    } else {
      const existingHooks = asHooksMap(existing.hooks);
      existing.hooks = mergeHooksMaps(existingHooks, templateHooks);
      await writeJsonPretty(destPath, existing);
    }
    return { installed: true };
  } catch (err) {
    return { installed: false, reason: (err as Error).message };
  }
}

/** 是否为 Polaris 已管的 hook command（合并前剔除以免重复） */
function isManagedHookCommand(command: unknown): boolean {
  if (typeof command !== 'string') return false;
  return (
    command.includes('polaris-flow/hooks') ||
    command.includes('/hooks/session-start.sh') ||
    command.includes('${CLAUDE_PLUGIN_ROOT}/hooks/')
  );
}

/** 从分组中剔除 Polaris 已管 hooks；组内 hooks 清空且原有 hooks 非空则去掉该组 */
function stripManagedHookCommands(
  groups: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return groups.flatMap((group) => {
    if (!Array.isArray(group.hooks)) return [group];
    const hooks = (group.hooks as Array<Record<string, unknown>>).filter(
      (hook) => !isManagedHookCommand(hook.command),
    );
    if (hooks.length === 0 && (group.hooks as unknown[]).length > 0) return [];
    return [{ ...group, hooks }];
  });
}

function asHooksMap(value: unknown): Record<string, Array<Record<string, unknown>>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const [event, groups] of Object.entries(value as Record<string, unknown>)) {
    out[event] = asHookGroup(groups);
  }
  return out;
}

/** 将解析出的 hooks 分组规范为数组。非数组一律视为空以免下游抛错 */
function asHookGroup(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

/**
 * 合并两个 hooks 事件表：对每个事件做 mergeHookGroups。
 * 合并前剔除 Polaris 已管 command，再写入模板条目，避免重复。
 */
function mergeHooksMaps(
  existing: Record<string, Array<Record<string, unknown>>>,
  incoming: Record<string, Array<Record<string, unknown>>>,
): Record<string, Array<Record<string, unknown>>> {
  const result: Record<string, Array<Record<string, unknown>>> = { ...existing };

  for (const [event, incomingGroups] of Object.entries(incoming)) {
    const cleanedExisting = stripManagedHookCommands(asHookGroup(result[event]));
    result[event] = mergeHookGroups(cleanedExisting, incomingGroups);
  }

  return result;
}

/**
 * 合并 hooks 分组：以 matcher 对齐；同 matcher 按 command 去重追加。
 */
function mergeHookGroups(
  existingGroups: Array<Record<string, unknown>>,
  incomingGroups: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const merged: Array<Record<string, unknown>> = existingGroups.map((g) => ({
    ...g,
    hooks: Array.isArray(g.hooks) ? [...(g.hooks as unknown[])] : [],
  }));

  for (const newGroup of incomingGroups) {
    const matcher = newGroup.matcher;
    const existingGroup = merged.find(
      (group) => group.matcher === matcher && Array.isArray(group.hooks),
    );
    const newHooks = Array.isArray(newGroup.hooks)
      ? (newGroup.hooks as Array<Record<string, unknown>>)
      : [];

    if (existingGroup) {
      const hooks = existingGroup.hooks as Array<Record<string, unknown>>;
      const existingCommands = new Set(
        hooks.map((h) => String((h as Record<string, unknown>).command ?? '')),
      );
      for (const hook of newHooks) {
        const cmd = String(hook.command ?? '');
        if (!existingCommands.has(cmd)) {
          hooks.push(hook);
          existingCommands.add(cmd);
        }
      }
    } else {
      merged.push({
        ...newGroup,
        hooks: [...newHooks],
      });
    }
  }

  return merged;
}
