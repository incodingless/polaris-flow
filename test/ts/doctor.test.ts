import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { hasDiagnosticFailure, runDiagnostics } from '../../src/core/doctor.js';

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
});
