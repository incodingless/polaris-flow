/**
 * doctor 诊断：Node/命令可用性、skills-lock 与平台 polaris 安装状态。
 */
import path from 'path';
import { createRequire } from 'module';

import { fileExists } from '../utils/file-system.js';
import { readJsonObjectOrEmpty } from '../utils/json-io.js';
import { isCommandAvailable } from './integrations/openspec.js';
import { detectPlatforms, getBaseDir, hasSkills } from './integrations/detect.js';
import { PLATFORMS, getPlatformSkillsDir } from './domain/platforms.js';
import type { InstallScope } from './config/polaris-project-config.js';

const require = createRequire(import.meta.url);
const { engines } = require('../../package.json') as { engines?: { node?: string } };

/** 单项诊断级别 */
export type DiagnosticStatus = 'ok' | 'warn' | 'fail';

/** 单项诊断结果 */
export type DiagnosticItem = {
  name: string;
  status: DiagnosticStatus;
  message: string;
  /** 失败项的修复指引（多行，命令行层按缩进原样输出） */
  hint?: string;
};

function parseMinNodeVersion(range: string | undefined): number {
  if (!range) return 20;
  const match = range.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 20;
}

async function checkNode(): Promise<DiagnosticItem> {
  const minMajor = parseMinNodeVersion(engines?.node);
  const currentMajor = parseInt(process.version.slice(1).split('.')[0] ?? '0', 10);

  if (currentMajor >= minMajor) {
    return { name: 'node', status: 'ok', message: process.version };
  }

  return {
    name: 'node',
    status: 'fail',
    message: `${process.version} (requires >= ${minMajor})`,
  };
}

async function checkCommand(name: string, command: string): Promise<DiagnosticItem> {
  const available = await isCommandAvailable(command);
  return {
    name,
    status: available ? 'ok' : 'fail',
    message: available ? 'available' : 'not found in PATH',
  };
}

/**
 * Git for Windows 的 bash.exe 常见位置。
 * Git 默认安装（"Git from the command line and also from 3rd-party software"）
 * 只把 `cmd\` 加进 PATH —— 那里有 git.exe，但 `bash.exe` 在 `bin\` 下，
 * 于是出现「git 可用、bash 找不到」这种最让人困惑的组合。
 */
export function windowsGitBashCandidates(): string[] {
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  ];
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(path.join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe'));
  }
  return candidates;
}

/**
 * bash 诊断。Polaris 的 hook（`bash "<script>.sh"`）与 verify 打分器都是 .sh 脚本，
 * Windows 上并不存在 PowerShell 等价物 —— 缺 bash 时 hook 会静默不执行，
 * 所以这一项必须给出可复制的修复命令，而不是只说「not found」。
 */
async function checkBash(): Promise<DiagnosticItem> {
  if (await isCommandAvailable('bash')) {
    return { name: 'bash', status: 'ok', message: 'available' };
  }

  if (process.platform === 'win32') {
    for (const candidate of windowsGitBashCandidates()) {
      if (!(await fileExists(candidate))) continue;
      const binDir = path.dirname(candidate);
      return {
        name: 'bash',
        status: 'fail',
        message: 'not found in PATH（Git 已安装，但它的 bin 目录没进 PATH）',
        hint: [
          `已找到 ${candidate}。Git 默认安装只把 cmd\\ 加进 PATH，而 bash.exe 在 bin\\ 下。`,
          '',
          '当前窗口立即生效：',
          `  $env:Path = "${binDir};" + $env:Path`,
          '',
          '永久生效（之后重开终端）：',
          `  [Environment]::SetEnvironmentVariable('Path', "${binDir};" + [Environment]::GetEnvironmentVariable('Path','User'), 'User')`,
        ].join('\n'),
      };
    }

    return {
      name: 'bash',
      status: 'fail',
      message: 'not found in PATH',
      hint: [
        'polaris 的 hook 与 verify 打分器都是 .sh 脚本，Windows 上靠 Git for Windows 自带的 bash.exe；',
        'PowerShell 不能替代它（.sh 里用了 POSIX 语法与 coreutils 命令）。',
        '',
        '装 Git for Windows（默认选项即可）：https://git-scm.com/download/win',
        '装完确认 bash 可见：Get-Command bash',
        '若仍找不到，把 C:\\Program Files\\Git\\bin 加入用户 PATH 后重开终端。',
      ].join('\n'),
    };
  }

  return {
    name: 'bash',
    status: 'fail',
    message: 'not found in PATH',
    hint: '装 bash：Debian/Ubuntu 用 `apt install bash`，RHEL/CentOS 用 `yum install bash`',
  };
}

async function findSkillsLock(projectPath: string): Promise<string | null> {
  const candidates = [
    path.join(projectPath, 'skills-lock.json'),
    path.join(projectPath, '.polaris', 'skills-lock.json'),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function checkSkillsLock(projectPath: string): Promise<DiagnosticItem> {
  const lockPath = await findSkillsLock(projectPath);
  if (!lockPath) {
    return {
      name: 'skills-lock.json',
      status: 'warn',
      message: 'not found (optional until Superpowers lock is generated)',
    };
  }

  try {
    await readJsonObjectOrEmpty(lockPath);
    return { name: 'skills-lock.json', status: 'ok', message: lockPath };
  } catch (error) {
    return {
      name: 'skills-lock.json',
      status: 'fail',
      message: `invalid JSON at ${lockPath}: ${(error as Error).message}`,
    };
  }
}

async function checkPolarisSkills(
  projectPath: string,
  scope: InstallScope = 'project',
): Promise<DiagnosticItem> {
  const baseDir = getBaseDir(scope, projectPath);
  const detected = await detectPlatforms(projectPath);
  let installedCount = 0;

  for (const platform of PLATFORMS) {
    if (!detected.has(platform.id)) {
      continue;
    }
    const skillsBaseDir = getPlatformSkillsDir(platform, scope, baseDir);
    if (await hasSkills(skillsBaseDir, 'polaris')) {
      installedCount++;
    }
  }

  if (installedCount > 0) {
    return {
      name: 'polaris-skills',
      status: 'ok',
      message: `${installedCount} platform(s) with Polaris skills`,
    };
  }

  return {
    name: 'polaris-skills',
    status: 'warn',
    message: 'no Polaris skills detected on configured platforms',
  };
}

/** 运行环境诊断 */
export async function runDiagnostics(
  projectPath: string,
  scope: InstallScope = 'project',
): Promise<DiagnosticItem[]> {
  const checks: DiagnosticItem[] = [];

  checks.push(await checkNode());
  checks.push(await checkBash());
  checks.push(await checkCommand('git', 'git'));
  checks.push(await checkCommand('openspec', 'openspec'));
  checks.push(await checkSkillsLock(projectPath));
  checks.push(await checkPolarisSkills(projectPath, scope));

  return checks;
}

/** 是否存在 fail 级别诊断项 */
export function hasDiagnosticFailure(checks: DiagnosticItem[]): boolean {
  return checks.some((item) => item.status === 'fail');
}
