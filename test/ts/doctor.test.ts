import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import {
  hasDiagnosticFailure,
  runDiagnostics,
  windowsGitBashCandidates,
} from '../../src/core/doctor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

describe('doctor', () => {
  it('returns diagnostic checks for project root', async () => {
    const checks = await runDiagnostics(projectRoot);
    expect(checks.length).toBeGreaterThan(0);

    const names = checks.map((c) => c.name);
    expect(names).toContain('node');
    expect(names).toContain('git');
    expect(names).toContain('openspec');
  });

  it('detects node as ok on current runtime', async () => {
    const checks = await runDiagnostics(projectRoot);
    const nodeCheck = checks.find((c) => c.name === 'node');
    expect(nodeCheck?.status).toBe('ok');
  });

  it('hasDiagnosticFailure reflects fail status', () => {
    expect(hasDiagnosticFailure([{ name: 'a', status: 'ok', message: '' }])).toBe(false);
    expect(hasDiagnosticFailure([{ name: 'a', status: 'fail', message: '' }])).toBe(true);
  });

  it('bash 检查项存在；可用时不应带修复 hint', async () => {
    const checks = await runDiagnostics(projectRoot);
    const bashCheck = checks.find((c) => c.name === 'bash');
    expect(bashCheck).toBeDefined();
    if (bashCheck?.status === 'ok') {
      expect(bashCheck.hint).toBeUndefined();
    } else {
      // 缺 bash 时必须给出可执行的修复指引，而不是只说 not found
      expect(bashCheck?.hint).toBeTruthy();
    }
  });

  it('windowsGitBashCandidates 覆盖 bash.exe 在 bin/ 而非 cmd/ 的事实', () => {
    const candidates = windowsGitBashCandidates();
    expect(candidates).toContain('C:\\Program Files\\Git\\bin\\bash.exe');
    expect(candidates).toContain('C:\\Program Files (x86)\\Git\\bin\\bash.exe');
    // 不能给 cmd\ 路径：那里只有 git.exe，没有 bash.exe
    expect(candidates.some((c) => c.includes('\\cmd\\'))).toBe(false);
  });
});
