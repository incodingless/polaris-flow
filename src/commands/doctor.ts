import path from 'path';

import { hasDiagnosticFailure, runDiagnostics } from '../core/doctor.js';
import type { InstallScope } from '../core/config/polaris-project-config.js';

export type DoctorOptions = {
  json?: boolean;
  scope?: InstallScope;
};

export async function runDoctor(
  rawPath: string,
  options: DoctorOptions = {},
): Promise<{ checks: Awaited<ReturnType<typeof runDiagnostics>> }> {
  const projectPath = path.resolve(rawPath || process.cwd());
  const scope = options.scope ?? 'project';
  const checks = await runDiagnostics(projectPath, scope);

  if (options.json) {
    console.log(JSON.stringify({ projectPath, checks }, null, 2));
  } else {
    console.log(`Polaris Flow Doctor — ${projectPath}`);
    console.log('');
    for (const item of checks) {
      const icon = item.status === 'ok' ? '✓' : item.status === 'warn' ? '!' : '✗';
      console.log(`  ${icon} ${item.name}: ${item.message}`);
    }
  }

  if (hasDiagnosticFailure(checks)) {
    process.exitCode = 1;
  }

  return { checks };
}

export async function doctorCommand(projectPath: string, options: DoctorOptions): Promise<void> {
  await runDoctor(projectPath, options);
}
