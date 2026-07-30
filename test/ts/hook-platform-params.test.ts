/**
 * 跨平台 hook 参数：platform 解析、stdin、占位符替换、hooks command 改写。
 */
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { Readable } from 'stream';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { readHookStdin } from '../../src/core/hooks/hook-stdin.js';
import { resolveHookPlatformId } from '../../src/core/hooks/resolve-platform.js';
import { rewritePolarisCliPlatformId } from '../../src/core/install/hook-assets.js';
import {
  buildPolarisHookCommand,
  installPolarisHooksForPlatform,
  rewriteHookCommand,
} from '../../src/core/install/hooks.js';
import { installPolarisForPlatform } from '../../src/core/install.js';
import { readAssets } from '../../src/core/assets/manifest.js';
import { PLATFORMS } from '../../src/core/platforms.js';
import { runSessionStart } from '../../src/core/hooks/session-start.js';
import { createHookIo } from '../../src/core/hooks/hook-io.js';

const trae = PLATFORMS.find((p) => p.id === 'trae')!;
const claude = PLATFORMS.find((p) => p.id === 'claude')!;

describe('resolveHookPlatformId', () => {
  it('CLI --platform 优先于 config', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-plat-cli-'));
    await mkdir(path.join(tmp, '.polaris'), { recursive: true });
    await writeFile(path.join(tmp, '.polaris', 'config.yaml'), 'platform: claude\n', 'utf-8');
    expect(await resolveHookPlatformId(tmp, 'trae')).toBe('trae');
  });

  it('无 CLI 时读 config.platform / platforms[0]', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-plat-cfg-'));
    await mkdir(path.join(tmp, '.polaris'), { recursive: true });
    await writeFile(
      path.join(tmp, '.polaris', 'config.yaml'),
      'platforms:\n  - cursor\n  - claude\n',
      'utf-8',
    );
    expect(await resolveHookPlatformId(tmp)).toBe('cursor');
  });

  it('无 CLI 且无 config → null', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-plat-none-'));
    expect(await resolveHookPlatformId(tmp)).toBeNull();
  });

  it('无效 --platform 回退 config', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-plat-bad-'));
    await mkdir(path.join(tmp, '.polaris'), { recursive: true });
    await writeFile(path.join(tmp, '.polaris', 'config.yaml'), 'platform: claude\n', 'utf-8');
    expect(await resolveHookPlatformId(tmp, 'not-a-platform')).toBe('claude');
  });

  it('coercePlatformId 未知返回 null', async () => {
    const { coercePlatformId } = await import('../../src/core/hooks/resolve-platform.js');
    expect(coercePlatformId('nope')).toBeNull();
    expect(coercePlatformId('trae')).toBe('trae');
    expect(coercePlatformId('.cursor')).toBe('cursor');
  });
});

describe('readHookStdin', () => {
  it('TTY 返回 Unknown', async () => {
    expect(await readHookStdin(Readable.from([]), true)).toEqual({
      event: 'Unknown',
      raw: {},
    });
  });

  it('解析 cwd / session_id / source', async () => {
    const payload = JSON.stringify({
      cwd: '/tmp/proj',
      session_id: 'sess-1',
      source: 'startup',
      hook_event_name: 'SessionStart',
    });
    const result = await readHookStdin(Readable.from([payload]), false);
    expect(result.event).toBe('SessionStart');
    expect(result.cwd).toBe('/tmp/proj');
    expect(result.session_id).toBe('sess-1');
    if (result.event !== 'SessionStart') throw new Error('narrow');
    expect(result.source).toBe('startup');
  });

  it('非法 JSON 返回 Unknown', async () => {
    expect(await readHookStdin(Readable.from(['not-json']), false)).toEqual({
      event: 'Unknown',
      raw: {},
    });
  });
});

describe('rewritePolarisCliPlatformId', () => {
  it('替换 @PLATFORM_ID@', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-cli-ph-'));
    const hooksDir = path.join(tmp, 'hooks');
    await mkdir(hooksDir, { recursive: true });
    await writeFile(
      path.join(hooksDir, '_polaris-cli.sh'),
      'exec polaris-flow "$subcmd" "$@" --platform @PLATFORM_ID@\n',
      'utf-8',
    );
    const result = await rewritePolarisCliPlatformId(hooksDir, 'trae');
    expect(result.rewritten).toBe(true);
    const text = await readFile(path.join(hooksDir, '_polaris-cli.sh'), 'utf-8');
    expect(text).toContain('--platform trae');
    expect(text).not.toContain('@PLATFORM_ID@');
  });
});

describe('rewriteHookCommand', () => {
  it('改写为平台相对路径', () => {
    expect(
      rewriteHookCommand('bash "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"', 'claude'),
    ).toBe(buildPolarisHookCommand('claude', 'session-start.sh'));
  });
});

describe('installPolarisHooksForPlatform command rewrite', () => {
  it('trae/claude 落盘 command 含 .<platform>/skills/polaris-flow/hooks/', async () => {
    const asset = await readAssets('zh');

    const traeTmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-cmd-trae-'));
    const traeBase = path.join(traeTmp, '.trae');
    await mkdir(traeBase, { recursive: true });
    await installPolarisHooksForPlatform(traeBase, trae, 'project', asset, false);
    const traeRaw = await readFile(path.join(traeBase, 'hooks.json'), 'utf-8');
    expect(traeRaw).toContain('.trae/skills/polaris-flow/hooks/session-start.sh');
    expect(traeRaw).not.toContain('CLAUDE_PLUGIN_ROOT');

    const claudeTmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-cmd-claude-'));
    const claudeBase = path.join(claudeTmp, '.claude');
    await mkdir(claudeBase, { recursive: true });
    await installPolarisHooksForPlatform(claudeBase, claude, 'project', asset, false);
    const claudeRaw = await readFile(path.join(claudeBase, 'settings.local.json'), 'utf-8');
    expect(claudeRaw).toContain('.claude/skills/polaris-flow/hooks/session-start.sh');
  });
});

describe('installPolarisForPlatform polaris-cli platform', () => {
  it('落盘后 _polaris-cli.sh 含 --platform trae', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-cli-install-'));
    await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');
    const text = await readFile(
      path.join(tmpDir, '.trae/skills/polaris-flow/hooks/_polaris-cli.sh'),
      'utf-8',
    );
    expect(text).toContain('--platform trae');
    expect(text).not.toContain('@PLATFORM_ID@');
  });
});

describe('runSessionStart platform', () => {
  it('缺 platform 且无 config → FAIL 文案提及 --platform', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-ss-noplat-'));
    const lines: string[] = [];
    const io = createHookIo({
      stdout: () => {},
      tty: (l) => lines.push(l),
    });
    const result = await runSessionStart({ projectPath: tmp, io, ppid: 1 });
    expect(result.exitCode).toBe(1);
    expect(lines.some((l) => l.includes('--platform'))).toBe(true);
  });

  it('使用宿主 session_id', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'polaris-ss-sess-'));
    await mkdir(path.join(tmp, '.polaris'), { recursive: true });
    await writeFile(
      path.join(tmp, '.polaris', 'config.yaml'),
      'platform: claude\nplugin_root: .claude/skills/polaris-flow\n',
      'utf-8',
    );
    const fakeHome = path.join(tmp, '_home');
    await mkdir(fakeHome, { recursive: true });
    const io = createHookIo({ stdout: () => {}, tty: () => {} });
    await runSessionStart({
      projectPath: tmp,
      platformId: 'claude',
      sessionId: 'host-session-xyz',
      io,
      ppid: 424242,
      pluginPresence: { homeDir: fakeHome, isCommandAvailable: () => false },
    });
    const session = await readFile(path.join(tmp, '.polaris', 'sessions', '424242.id'), 'utf-8');
    expect(session.trim()).toBe('host-session-xyz');
  });
});
