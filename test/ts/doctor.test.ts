import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import {
  classifyOpenspecBaseline,
  dependencyDiagnosticStatus,
  hasDiagnosticFailure,
  runDiagnostics,
} from '../../src/core/doctor.js';
import { DEPENDENCIES } from '../../src/core/deps/registry.js';
import { extractSemver } from '../../src/core/deps/version.js';

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

  it('逐条检查依赖登记表里的每一个外部组件', async () => {
    const checks = await runDiagnostics(projectRoot);
    const names = new Set(checks.map((c) => c.name));
    for (const dep of DEPENDENCIES) {
      expect(names.has(dep.id), `doctor 漏检依赖 ${dep.id}`).toBe(true);
    }
  });

  it('detects node as ok on current runtime', async () => {
    const checks = await runDiagnostics(projectRoot);
    const nodeCheck = checks.find((c) => c.name === 'node');
    expect(nodeCheck?.status).toBe('ok');
  });

  it('诊断文案跟随语言参数：zh 输出中文、en 输出英文', async () => {
    const zhChecks = await runDiagnostics(projectRoot, 'project', 'zh');
    const zhGit = zhChecks.find((c) => c.name === 'git');
    // 本机/CI 均有 git；若某环境真缺 git，改断言依赖可用性会误报，故此处直接校验中文文案集合
    const zhMessages = zhChecks.map((c) => c.message).join('\n');
    expect(zhGit?.status === 'ok' ? zhGit.message : zhMessages).toMatch(/可用|未在 PATH 中找到/);
    expect(zhMessages).not.toMatch(/\binstalled \(/);

    const enChecks = await runDiagnostics(projectRoot, 'project', 'en');
    const enGit = enChecks.find((c) => c.name === 'git');
    expect(enGit?.status === 'ok' ? enGit.message : '').toBe('available');
  });

  it('hasDiagnosticFailure reflects fail status', () => {
    expect(hasDiagnosticFailure([{ name: 'a', status: 'ok', message: '' }])).toBe(false);
    expect(hasDiagnosticFailure([{ name: 'a', status: 'fail', message: '' }])).toBe(true);
  });

  it('skip 与 warn 不影响退出码（只有 fail 影响）', () => {
    expect(hasDiagnosticFailure([{ name: 'a', status: 'skip', message: '' }])).toBe(false);
    expect(hasDiagnosticFailure([{ name: 'a', status: 'warn', message: '' }])).toBe(false);
  });
});

describe('dependencyDiagnosticStatus', () => {
  it('已装一律 ok，与重要度无关', () => {
    expect(dependencyDiagnosticStatus('required', true)).toBe('ok');
    expect(dependencyDiagnosticStatus('recommended', true)).toBe('ok');
    expect(dependencyDiagnosticStatus('optional', true)).toBe('ok');
  });

  it('required 缺失即 fail（工作流跑不动）', () => {
    expect(dependencyDiagnosticStatus('required', false)).toBe('fail');
  });

  it('recommended 缺失降级为 warn', () => {
    expect(dependencyDiagnosticStatus('recommended', false)).toBe('warn');
  });

  it('optional 缺失为 skip，不是 ok 也不制造告警', () => {
    expect(dependencyDiagnosticStatus('optional', false)).toBe('skip');
  });
});

describe('classifyOpenspecBaseline', () => {
  it('版本一致时视为一致', () => {
    expect(classifyOpenspecBaseline('1.7.0', '1.7.0')).toBe('consistent');
  });

  it('CLI 升级后判定漂移（项目技能仍是旧版生成的）', () => {
    expect(classifyOpenspecBaseline('1.7.0', '1.8.0')).toBe('drifted');
  });

  it('CLI 降级也判定漂移（技能比 CLI 新，可能不兼容）', () => {
    expect(classifyOpenspecBaseline('1.8.0', '1.7.0')).toBe('drifted');
  });

  it('忽略 prerelease 差异（同 patch 的 beta 不改变技能内容）', () => {
    expect(classifyOpenspecBaseline('1.7.0', '1.7.0-beta.1')).toBe('consistent');
  });

  it('任一侧不可比时返回 null —— 宁可少报也不猜', () => {
    expect(classifyOpenspecBaseline('', '1.7.0')).toBeNull();
    expect(classifyOpenspecBaseline('1.7.0', null)).toBeNull();
    expect(classifyOpenspecBaseline('local', '1.7.0')).toBeNull();
    expect(classifyOpenspecBaseline('1.7.0', 'unknown')).toBeNull();
  });
});

describe('extractSemver', () => {
  it('从各种 --version 输出里取出 semver', () => {
    expect(extractSemver('1.7.0')).toBe('1.7.0');
    expect(extractSemver('openspec 1.7.0')).toBe('1.7.0');
    expect(extractSemver('v1.7.0-beta.1')).toBe('1.7.0-beta.1');
  });

  it('取不到时返回 null', () => {
    expect(extractSemver('unknown')).toBeNull();
    expect(extractSemver('')).toBeNull();
  });
});
