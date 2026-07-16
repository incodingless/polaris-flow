/**
 * Hook 命令路径构建与合并工具。
 * 路径规范化复用 platform/layout.hookScriptPluginRel。
 */
import { hookScriptPluginRel } from '../../platform/layout.js';

/** 根据 manifest 相对路径与 skillsDir 生成 hook 可执行命令 */
export function buildHookCommand(skillsDir: string, scriptRelPath: string): string {
  const hookRel = hookScriptPluginRel(scriptRelPath);
  return `bash ${skillsDir}/skills/polaris-flow/${hookRel}`;
}

/** 判断 settings 中的 command 是否为本 manifest 管理的 Polaris hook */
export function isManagedHookCommand(command: unknown, scriptRelPaths: string[]): boolean {
  if (typeof command !== 'string') return false;

  const commandPath = command
    .trim()
    .match(/^bash\s+["']?([^"'\s]+)["']?(?:\s|$)/)?.[1]
    ?.replace(/\\/g, '/');
  if (!commandPath) return false;

  return scriptRelPaths.some((scriptRelPath) => {
    const hookRel = hookScriptPluginRel(scriptRelPath);
    const normalized = scriptRelPath.replace(/\\/g, '/');
    return (
      commandPath.endsWith(`/skills/polaris-flow/${hookRel}`) ||
      // 兼容旧路径 skills/hooks/...
      commandPath.endsWith(`/skills/${normalized}`)
    );
  });
}

/** 合并 hooks 分组：先剔除本 manifest 已管条目，再追加新组 */
export function mergeHookGroups<T extends { command: string }>(
  existingGroups: Array<Record<string, unknown>>,
  newGroups: Array<{ matcher: string; hooks: T[] }>,
  scriptRelPaths: string[],
): Array<Record<string, unknown>> {
  const mergedGroups = existingGroups.flatMap((group) => {
    if (!Array.isArray(group.hooks)) return [group];

    const hooks = group.hooks.filter(
      (hook) => !isManagedHookCommand((hook as Record<string, unknown>).command, scriptRelPaths),
    );
    if (hooks.length === 0 && group.hooks.length > 0) return [];

    return [{ ...group, hooks }];
  });

  for (const newGroup of newGroups) {
    const existingGroup = mergedGroups.find(
      (group) => group.matcher === newGroup.matcher && Array.isArray(group.hooks),
    );
    if (existingGroup) {
      existingGroup.hooks = [...(existingGroup.hooks as unknown[]), ...newGroup.hooks];
    } else {
      mergedGroups.push(newGroup);
    }
  }

  return mergedGroups;
}

/**
 * 将解析出的 hooks 分组规范为数组。
 * 手改 settings 可能把分组写成对象或标量，非数组一律视为空以免下游抛错。
 */
export function asHookGroup(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}
