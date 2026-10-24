/**
 * 伴生 CLI 安装落点与定位的单元测试。
 * 覆盖「全局 npm 目录不可写时改装用户目录」这条路径的纯逻辑部分。
 */
import path from 'path';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { buildNpmGlobalInstallArgs } from '../../src/core/install/cli-installer.js';
import { getUserCliBinDir } from '../../src/core/assets/polaris-paths.js';
import { formatUserCliPathHint, isUserLevelCliExecutable } from '../../src/core/deps/npm.js';

describe('buildNpmGlobalInstallArgs', () => {
  it('默认全局安装，不带 prefix', () => {
    expect(buildNpmGlobalInstallArgs('@fission-ai/openspec@latest')).toEqual([
      'install',
      '-g',
      '@fission-ai/openspec@latest',
    ]);
  });

  it('带 registry 时不追加 prefix', () => {
    expect(buildNpmGlobalInstallArgs('pkg@1.0.0', 'http://registry.local/')).toEqual([
      'install',
      '-g',
      'pkg@1.0.0',
      '--registry',
      'http://registry.local/',
    ]);
  });

  it('带 prefix 时装到用户目录（全局不可写的场景）', () => {
    const args = buildNpmGlobalInstallArgs('pkg@1.0.0', 'http://registry.local/', '/home/u/.polaris/cli');
    expect(args).toContain('--prefix');
    expect(args[args.indexOf('--prefix') + 1]).toBe('/home/u/.polaris/cli');
  });

  it('prefix 为空串时忽略，不产生悬空的 --prefix', () => {
    expect(buildNpmGlobalInstallArgs('pkg', undefined, '')).toEqual(['install', '-g', 'pkg']);
  });
});

describe('用户级 CLI 路径', () => {
  it('bin 目录固定在 ~/.polaris/cli/bin', () => {
    expect(getUserCliBinDir()).toBe(path.join(os.homedir(), '.polaris', 'cli', 'bin'));
  });

  it('用户级 bin 内的绝对路径判定为 true', () => {
    expect(isUserLevelCliExecutable(path.join(getUserCliBinDir(), 'openspec'))).toBe(true);
  });

  it('PATH 上的裸命令名不算用户级安装', () => {
    expect(isUserLevelCliExecutable('openspec')).toBe(false);
  });

  it('PATH 提示是一行可直接粘贴的 export', () => {
    expect(formatUserCliPathHint()).toBe(`export PATH="${getUserCliBinDir()}:$PATH"`);
  });
});
