/**
 * 命令层：Hook 运行时 platform id 解析（有效 CLI `--platform` → config → 无法解析）。
 * 平台身份感知停在 commands，再把 platformId 传给 core。
 */
import { loadPolarisConfig } from '../../../core/config/polaris-project-config.js';
import { PLATFORMS } from '../../../core/domain/platforms.js';
import { hookDebug } from './debug-log.js';

/**
 * 将配置中的平台标记归一为已知 platform id；无法识别返回 null。
 */
export function coercePlatformId(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const bare = trimmed.replace(/^\./, '');
  const byId = PLATFORMS.find((p) => p.id === bare);
  if (byId) return byId.id;
  const byName = PLATFORMS.find((p) => p.name === trimmed || p.name === bare);
  if (byName) return byName.id;
  return null;
}

/**
 * 从未知 YAML 值提取单个 platform id（字符串 / Platform / 逗号列表首项）。
 */
function extractPlatformId(value: unknown): string | null {
  if (typeof value === 'string') {
    const first = value.split(',')[0] ?? '';
    return coercePlatformId(first);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as { id?: unknown; name?: unknown };
    if (typeof obj.id === 'string') return coercePlatformId(obj.id);
    if (typeof obj.name === 'string') return coercePlatformId(obj.name);
  }
  return null;
}

/**
 * 从 platforms 列表或单值提取首个 platform id。
 */
function extractFirstPlatformId(value: unknown): string | null {
  if (Array.isArray(value) && value.length > 0) {
    return extractPlatformId(value[0]);
  }
  return extractPlatformId(value);
}

/**
 * 解析 hook 使用的 platform id。
 * 优先级：有效的 CLI `--platform` → `.polaris/config.yaml` 的 `platform` / `platforms[0]` → null。
 * 无效 CLI 值不挡住 config 回退。
 */
export async function resolveHookPlatformId(
  projectPath: string,
  cliPlatformId?: string,
): Promise<string | null> {
  const fromCli = cliPlatformId?.trim();
  if (fromCli) {
    const known = coercePlatformId(fromCli);
    if (known) {
      hookDebug('resolveHookPlatformId: from CLI', { fromCli, known });
      return known;
    }
    hookDebug('resolveHookPlatformId: CLI invalid, fall back to config', { fromCli });
  }

  const config = await loadPolarisConfig(projectPath);
  if (!config) {
    hookDebug('resolveHookPlatformId: no config', { projectPath });
    return null;
  }

  const raw = config as typeof config & { platform?: unknown };
  const fromSingular = extractPlatformId(raw.platform);
  if (fromSingular) {
    hookDebug('resolveHookPlatformId: from config.platform', { fromSingular });
    return fromSingular;
  }

  const fromList = extractFirstPlatformId(raw.platforms);
  hookDebug('resolveHookPlatformId: from config.platforms', { fromList });
  return fromList;
}
