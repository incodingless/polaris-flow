/**
 * 平台级 subagent 能力表：与 subagent-probe/references/platform-probe.md 能力列同源。
 * SessionStart 注入用；不扫 agents、不做派发决策。
 */
export type PlatformDegradation = null | 'inline' | 'unsupported';

export type SubagentCapability = {
  supportsSubagent: boolean;
  platformDegradation: PlatformDegradation;
};

/** 已登记且支持 subagent 的平台 id（与 platform-probe.md 一致） */
const SUPPORTS_SUBAGENT = new Set([
  'claude',
  'codebuddy',
  'cursor',
  'trae',
  'trae-cn',
]);

/** 已登记但强制 inline 的平台 id */
const FORCE_INLINE = new Set(['qoder']);

/**
 * 按 platformId 解析是否支持 subagent 及平台级退化结论。
 * 未登记 → unsupported；强制 inline → inline；支持 → degradation=null。
 */
export function resolveSubagentCapability(platformId: string): SubagentCapability {
  const id = platformId.trim();
  if (!id) {
    return { supportsSubagent: false, platformDegradation: 'unsupported' };
  }
  if (FORCE_INLINE.has(id)) {
    return { supportsSubagent: false, platformDegradation: 'inline' };
  }
  if (SUPPORTS_SUBAGENT.has(id)) {
    return { supportsSubagent: true, platformDegradation: null };
  }
  return { supportsSubagent: false, platformDegradation: 'unsupported' };
}
