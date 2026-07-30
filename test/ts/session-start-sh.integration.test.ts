/**
 * session-start.sh 集成测试：薄包装 → _polaris-cli → polaris-flow host-hook 全链路。
 */
import { spawnSync } from 'child_process';
import { chmod, copyFile, mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const assetsHooks = path.join(projectRoot, 'assets/shared/hooks');
const polarisFlowJs = path.join(projectRoot, 'bin/polaris-flow.js');

/**
 * 在临时 hooks 目录落盘 session-start.sh + 已替换 platform 的 _polaris-cli.sh。
 */
async function materializeHooks(platformId: string): Promise<string> {
  const hooksDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ss-hooks-'));
  await copyFile(path.join(assetsHooks, 'session-start.sh'), path.join(hooksDir, 'session-start.sh'));
  const cliSrc = await readFile(path.join(assetsHooks, '_polaris-cli.sh'), 'utf-8');
  await writeFile(
    path.join(hooksDir, '_polaris-cli.sh'),
    cliSrc.split('@PLATFORM_ID@').join(platformId),
    'utf-8',
  );
  await chmod(path.join(hooksDir, 'session-start.sh'), 0o755);
  await chmod(path.join(hooksDir, '_polaris-cli.sh'), 0o755);
  return hooksDir;
}

/**
 * 创建仅含 polaris-flow 可执行包装的 PATH 前缀目录。
 */
async function makePolarisFlowPathDir(): Promise<string> {
  const binDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ss-bin-'));
  const wrapper = path.join(binDir, 'polaris-flow');
  await writeFile(
    wrapper,
    `#!/usr/bin/env bash\nexec "${process.execPath}" "${polarisFlowJs}" "$@"\n`,
    'utf-8',
  );
  await chmod(wrapper, 0o755);
  return binDir;
}

/**
 * 准备最小可跑 SessionStart 的项目根（含 config；隔离 HOME）。
 */
async function makeProject(): Promise<{ projectPath: string; homeDir: string }> {
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'polaris-ss-proj-'));
  const homeDir = path.join(projectPath, '_home');
  await mkdir(homeDir, { recursive: true });
  await mkdir(path.join(projectPath, '.polaris'), { recursive: true });
  await writeFile(
    path.join(projectPath, '.polaris', 'config.yaml'),
    [
      'language: zh',
      'platform: claude',
      'plugin_root: .claude/skills/polaris-flow',
      "workflow: ''",
      "phase: ''",
      'context_compression: off',
      'review_mode: off',
      '',
    ].join('\n'),
    'utf-8',
  );
  return { projectPath, homeDir };
}

/**
 * 调用真实 bash session-start.sh。
 */
function runSessionStartSh(options: {
  hooksDir: string;
  cwd: string;
  pathPrefix?: string;
  homeDir?: string;
  stdin?: string;
  extraArgs?: string[];
}): ReturnType<typeof spawnSync> {
  const pathEnv = options.pathPrefix
    ? `${options.pathPrefix}${path.delimiter}${process.env.PATH ?? ''}`
    : ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter);

  return spawnSync('bash', [path.join(options.hooksDir, 'session-start.sh'), ...(options.extraArgs ?? [])], {
    cwd: options.cwd,
    env: {
      ...process.env,
      PATH: pathEnv,
      HOME: options.homeDir ?? process.env.HOME,
      // 避免宿主交互式 tty 干扰 hook-io
      TERM: 'dumb',
    },
    input: options.stdin,
    encoding: 'utf-8',
  });
}

describe('session-start.sh integration', () => {
  it('PATH 无 polaris-flow 时 exit 1 并提示安装', async () => {
    const hooksDir = await materializeHooks('claude');
    const { projectPath, homeDir } = await makeProject();

    const result = runSessionStartSh({
      hooksDir,
      cwd: projectPath,
      homeDir,
      // 故意不带 polaris-flow
    });

    expect(result.status).toBe(1);
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(combined).toContain('polaris-flow CLI not found');
  });

  it('经薄包装转发：stdin cwd/session_id + --platform，写出 session 文件', async () => {
    const hooksDir = await materializeHooks('claude');
    const pathPrefix = await makePolarisFlowPathDir();
    const { projectPath, homeDir } = await makeProject();

    const hostSessionId = 'host-integ-session-42';
    const stdin = JSON.stringify({
      cwd: projectPath,
      session_id: hostSessionId,
      source: 'startup',
    });

    const result = runSessionStartSh({
      hooksDir,
      cwd: os.tmpdir(), // 故意与项目不同，迫使使用 stdin.cwd
      pathPrefix,
      homeDir,
      stdin,
    });

    // 缺 superpowers/openspec → 非 0；但链路应跑通并落盘 session
    expect(result.status).not.toBeNull();
    expect([0, 1]).toContain(result.status);

    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    expect(combined).toMatch(/SessionStart|session_id|polaris-flow/);

    const sessionFiles = await import('fs/promises').then((fs) =>
      fs.readdir(path.join(projectPath, '.polaris', 'sessions')),
    );
    expect(sessionFiles.length).toBeGreaterThan(0);
    const body = await readFile(
      path.join(projectPath, '.polaris', 'sessions', sessionFiles[0]),
      'utf-8',
    );
    expect(body.trim()).toBe(hostSessionId);
  });

  it('CLI 位置参数优先于 stdin.cwd', async () => {
    const hooksDir = await materializeHooks('claude');
    const pathPrefix = await makePolarisFlowPathDir();
    const { projectPath, homeDir } = await makeProject();
    const other = await mkdtemp(path.join(os.tmpdir(), 'polaris-ss-other-'));

    const result = runSessionStartSh({
      hooksDir,
      cwd: other,
      pathPrefix,
      homeDir,
      extraArgs: [projectPath],
      stdin: JSON.stringify({ cwd: other, session_id: 'from-stdin', source: 'startup' }),
    });

    expect([0, 1]).toContain(result.status);
    const sessionFiles = await import('fs/promises').then((fs) =>
      fs.readdir(path.join(projectPath, '.polaris', 'sessions')),
    );
    expect(sessionFiles.length).toBeGreaterThan(0);
    const body = await readFile(
      path.join(projectPath, '.polaris', 'sessions', sessionFiles[0]),
      'utf-8',
    );
    expect(body.trim()).toBe('from-stdin');
  });
});
