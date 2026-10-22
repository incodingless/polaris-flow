/**
 * installPolarisHooksForPlatform：Trae hooks.json / Claude settings 写入与合并测试。
 */
import path from 'path';
import { mkdtemp, readFile, writeFile, mkdir } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import {
  installPolarisHooksForPlatform,
  resolveHooksConfigPath,
} from '../../src/core/install/hooks.js';
import { readAssets } from '../../src/core/assets/manifest.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;
const traeCn = PLATFORMS.find((p) => p.id === 'trae-cn')!;

async function loadAssets() {
  return readAssets('zh');
}

describe('resolveHooksConfigPath', () => {
  it('trae → hooks.json；claude project → settings.local.json', () => {
    expect(resolveHooksConfigPath('/tmp/.trae', trae, 'project')).toBe(
      path.join('/tmp/.trae', 'hooks.json'),
    );
    expect(resolveHooksConfigPath('/tmp/.claude', claude, 'project')).toBe(
      path.join('/tmp/.claude', 'settings.local.json'),
    );
    expect(resolveHooksConfigPath('/tmp/.claude', claude, 'global')).toBe(
      path.join('/tmp/.claude', 'settings.json'),
    );
    expect(resolveHooksConfigPath('/tmp/proj/.trae', traeCn, 'project', '/tmp/home')).toBe(
      path.join('/tmp/home', '.trae-cn', 'hooks.json'),
    );
  });
});

describe('installPolarisHooksForPlatform Trae', () => {
  it('不存在时写出完整 hooks.json，含 SessionStart', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-trae-'));
    const baseDir = path.join(tmpDir, '.trae');
    await mkdir(baseDir, { recursive: true });
    const asset = await loadAssets();

    const result = await installPolarisHooksForPlatform(baseDir, trae, 'project', asset, false);
    expect(result.installed).toBe(true);

    const raw = await readFile(path.join(baseDir, 'hooks.json'), 'utf-8');
    const parsed = JSON.parse(raw) as {
      hooks?: { SessionStart?: unknown[] };
      $schema?: string;
    };
    expect(parsed.$schema).toBeTruthy();
    expect(parsed.hooks?.SessionStart?.length).toBeGreaterThan(0);
    expect(raw).toContain('.trae/skills/polaris/hooks/session-start.sh');
    expect(raw).not.toContain('CLAUDE_PLUGIN_ROOT');
  });

  it('已存在 + !overwrite：保留用户事件，合入 SessionStart 且 command 不重复', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-trae-merge-'));
    const baseDir = path.join(tmpDir, '.trae');
    await mkdir(baseDir, { recursive: true });
    const dest = path.join(baseDir, 'hooks.json');
    await writeFile(
      dest,
      JSON.stringify(
        {
          hooks: {
            CustomEvent: [{ matcher: 'x', hooks: [{ type: 'command', command: 'echo user' }] }],
            SessionStart: [
              {
                matcher: 'startup|resume',
                hooks: [
                  {
                    type: 'command',
                    command: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"',
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const asset = await loadAssets();
    const result = await installPolarisHooksForPlatform(baseDir, trae, 'project', asset, false);
    expect(result.installed).toBe(true);

    const parsed = JSON.parse(await readFile(dest, 'utf-8')) as {
      hooks: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>;
    };
    expect(parsed.hooks.CustomEvent).toHaveLength(1);
    const session = parsed.hooks.SessionStart;
    expect(session.some((g) => g.matcher === 'startup|resume')).toBe(true);
    const commands = session.flatMap((g) => (g.hooks ?? []).map((h) => h.command));
    const polarisCmds = commands.filter((c) => c?.includes('session-start.sh'));
    expect(polarisCmds).toHaveLength(1);
  });

  it('已存在 + overwrite：整文件替换为模板', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-trae-ow-'));
    const baseDir = path.join(tmpDir, '.trae');
    await mkdir(baseDir, { recursive: true });
    const dest = path.join(baseDir, 'hooks.json');
    await writeFile(
      dest,
      JSON.stringify({ hooks: { CustomEvent: [{ matcher: 'keep-me' }] } }, null, 2),
      'utf-8',
    );

    const asset = await loadAssets();
    const result = await installPolarisHooksForPlatform(baseDir, trae, 'project', asset, true);
    expect(result.installed).toBe(true);

    const parsed = JSON.parse(await readFile(dest, 'utf-8')) as {
      hooks: Record<string, unknown>;
    };
    expect(parsed.hooks.CustomEvent).toBeUndefined();
    expect(parsed.hooks.SessionStart).toBeTruthy();
  });
});

describe('installPolarisHooksForPlatform Trae-CN', () => {
  it('项目级安装写入用户目录 hooks.json，command 指向 .trae 下的脚本', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-trae-cn-'));
    const baseDir = path.join(tmpDir, '.trae');
    const homeDir = path.join(tmpDir, 'home');
    await mkdir(baseDir, { recursive: true });
    const asset = await loadAssets();

    const result = await installPolarisHooksForPlatform(
      baseDir,
      traeCn,
      'project',
      asset,
      false,
      homeDir,
    );
    expect(result.installed).toBe(true);

    const dest = path.join(homeDir, '.trae-cn', 'hooks.json');
    const raw = await readFile(dest, 'utf-8');
    const parsed = JSON.parse(raw) as {
      version?: number;
      hooks?: { SessionStart?: Array<{ hooks?: Array<{ command?: string }> }> };
    };
    expect(parsed.version).toBe(1);
    expect(parsed.hooks?.SessionStart?.length).toBeGreaterThan(0);
    expect(raw).toContain('.trae/skills/polaris/hooks/session-start.sh');
    expect(raw).not.toContain('.trae-cn/skills/');
    await expect(readFile(path.join(baseDir, 'settings.local.json'), 'utf-8')).rejects.toThrow();
  });

  it('已有用户 hooks 时合并 SessionStart，不删掉原事件', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-trae-cn-merge-'));
    const homeDir = path.join(tmpDir, 'home');
    const dest = path.join(homeDir, '.trae-cn', 'hooks.json');
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(
      dest,
      JSON.stringify({
        version: 1,
        hooks: {
          Stop: [{ hooks: [{ type: 'command', command: 'echo user' }] }],
        },
      }),
      'utf-8',
    );
    const asset = await loadAssets();

    const result = await installPolarisHooksForPlatform(
      path.join(tmpDir, '.trae'),
      traeCn,
      'project',
      asset,
      true,
      homeDir,
    );
    expect(result.installed).toBe(true);

    const parsed = JSON.parse(await readFile(dest, 'utf-8')) as {
      version?: number;
      hooks: Record<string, unknown>;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.hooks.Stop).toBeTruthy();
    expect(parsed.hooks.SessionStart).toBeTruthy();
  });
});

describe('installPolarisHooksForPlatform Claude settings', () => {
  it('settings 不存在时创建 settings.local.json，含 hooks.SessionStart', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-claude-'));
    const baseDir = path.join(tmpDir, '.claude');
    await mkdir(baseDir, { recursive: true });
    const asset = await loadAssets();

    const result = await installPolarisHooksForPlatform(baseDir, claude, 'project', asset, false);
    expect(result.installed).toBe(true);

    const raw = await readFile(path.join(baseDir, 'settings.local.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { hooks?: { SessionStart?: unknown[] } };
    expect(parsed.hooks?.SessionStart?.length).toBeGreaterThan(0);
    expect(raw).toContain('.claude/skills/polaris/hooks/session-start.sh');
  });

  it('已有其它键 + !overwrite：其它键保留，hooks 合并', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-claude-merge-'));
    const baseDir = path.join(tmpDir, '.claude');
    await mkdir(baseDir, { recursive: true });
    const dest = path.join(baseDir, 'settings.local.json');
    await writeFile(
      dest,
      JSON.stringify(
        {
          permissions: { allow: ['Bash'] },
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const asset = await loadAssets();
    const result = await installPolarisHooksForPlatform(baseDir, claude, 'project', asset, false);
    expect(result.installed).toBe(true);

    const parsed = JSON.parse(await readFile(dest, 'utf-8')) as {
      permissions?: { allow?: string[] };
      hooks: Record<string, unknown[]>;
    };
    expect(parsed.permissions?.allow).toEqual(['Bash']);
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.SessionStart).toBeTruthy();
  });

  it('overwrite：其它键保留，hooks 被模板替换', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-hooks-claude-ow-'));
    const baseDir = path.join(tmpDir, '.claude');
    await mkdir(baseDir, { recursive: true });
    const dest = path.join(baseDir, 'settings.local.json');
    await writeFile(
      dest,
      JSON.stringify(
        {
          permissions: { allow: ['Bash'] },
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const asset = await loadAssets();
    const result = await installPolarisHooksForPlatform(baseDir, claude, 'project', asset, true);
    expect(result.installed).toBe(true);

    const parsed = JSON.parse(await readFile(dest, 'utf-8')) as {
      permissions?: { allow?: string[] };
      hooks: Record<string, unknown>;
    };
    expect(parsed.permissions?.allow).toEqual(['Bash']);
    expect(parsed.hooks.PreToolUse).toBeUndefined();
    expect(parsed.hooks.SessionStart).toBeTruthy();
  });
});
