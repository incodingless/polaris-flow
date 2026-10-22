/**
 * 环境诊断 API（`GET /api/check`）：直接复用 `src/core/doctor.ts`。
 *
 * 只做一处映射：doctor 的 `'fail'` → 面板认的 `'error'`。
 * **不把 `'fail'` 透穿给前端** —— 面板侧的状态枚举是 `ok|warn|error`，
 * 两套词表在前端混用会静默错渲染。
 *
 * 旧实现是 5 条硬编码的 `existsSync`（检查 `polaris.meta.yaml` / `polaris.record.yaml` /
 * `openspec/polaris.yaml` 等）。那些路径已失实，整块替换。
 */
import type { InstallScope } from '../../core/assets/polaris-paths.js';
import { loadPolarisConfig } from '../../core/config/polaris-project-config.js';
import { runDiagnostics, type DiagnosticStatus } from '../../core/doctor.js';

export type CheckStatus = 'ok' | 'warn' | 'error';

export type CheckItem = {
  name: string;
  status: CheckStatus;
  description: string;
};

export type CheckResponse = {
  checks: CheckItem[];
  summary: { ok: number; warn: number; error: number };
};

/** doctor 状态 → 面板状态 */
function toCheckStatus(status: DiagnosticStatus): CheckStatus {
  return status === 'fail' ? 'error' : status;
}

/** 取项目配置里的安装作用域（影响 doctor 检查哪一套 skills） */
async function resolveScope(projectRoot: string): Promise<InstallScope> {
  try {
    const config = await loadPolarisConfig(projectRoot);
    return config?.scope === 'global' ? 'global' : 'project';
  } catch {
    return 'project';
  }
}

/** 运行诊断 */
export async function runChecks(projectRoot: string): Promise<CheckResponse> {
  const items = await runDiagnostics(projectRoot, await resolveScope(projectRoot));
  const checks: CheckItem[] = items.map((item) => ({
    name: item.name,
    status: toCheckStatus(item.status),
    description: item.message,
  }));

  return {
    checks,
    summary: {
      ok: checks.filter((c) => c.status === 'ok').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      error: checks.filter((c) => c.status === 'error').length,
    },
  };
}
