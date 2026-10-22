/**
 * CLI smoke：polaris 仅生命周期命令；polaris-flow 暴露运行时命令。
 */
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const polarisBin = path.join(projectRoot, 'bin/polaris.js');
const polarisFlowBin = path.join(projectRoot, 'bin/polaris-flow.js');

describe('CLI smoke', () => {
  it('prints version output', () => {
    const output = execFileSync(process.execPath, [polarisBin, '--version'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('polaris --help 仅含用户生命周期命令', () => {
    const output = execFileSync(process.execPath, [polarisBin, '--help'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    for (const cmd of ['init', 'status', 'dashboard', 'doctor', 'update', 'uninstall']) {
      expect(output).toContain(cmd);
    }
    for (const cmd of ['host-hook', 'workflow-entry', 'task-state-entry', 'worktree-create']) {
      expect(output).not.toContain(cmd);
    }
  });

  it('polaris-flow --help 含运行时命令、不含用户生命周期', () => {
    const output = execFileSync(process.execPath, [polarisFlowBin, '--help'], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    expect(output).toContain('host-hook');
    expect(output).toContain('workflow-entry');
    expect(output).toContain('task-state-entry');
    expect(output).not.toContain('uninstall');
    // init 可能作为子串出现在描述里；命令列表行应为 "  init " —— 用行首匹配
    expect(output).not.toMatch(/^\s+init\b/m);
  });

  it('doctor runs against project root', () => {
    const output = execFileSync(process.execPath, [polarisBin, 'doctor', projectRoot], {
      cwd: projectRoot,
      encoding: 'utf-8',
    });

    expect(output).toContain('node');
  });
});
