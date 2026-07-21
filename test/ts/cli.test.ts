import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const cliPath = path.join(projectRoot, 'bin/polaris.js');

describe('CLI smoke', () => {
  it('prints version output', () => {
    const output = execFileSync(process.execPath, [cliPath, '--version'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('help lists lifecycle commands', () => {
    const output = execFileSync(process.execPath, [cliPath, '--help'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    expect(output).toContain('init');
    expect(output).toContain('update');
    expect(output).toContain('doctor');
    expect(output).toContain('status');
    expect(output).toContain('session-start');
    expect(output).toContain('workflow-entry');
  });

  it('doctor runs against project root', () => {
    const output = execFileSync(process.execPath, [cliPath, 'doctor', projectRoot], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    expect(output).toContain('node');
  });
});
