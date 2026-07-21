/**
 * doctor 诊断：Node/命令可用性、skills-lock 与平台 polaris 安装状态。
 */
import path from 'path';
import { createRequire } from 'module';

import { fileExists, readJson } from '../utils/file-system.js';
import { isCommandAvailable } from './integration/openspec.js';
import { detectPlatforms, getBaseDir, hasSkills } from './integration/detect.js';
import { PLATFORMS } from './platform/platforms.js';
import type { InstallScope } from './config/polaris-config.js';

const require = createRequire(import.meta.url);
const { engines } = require('../../package.json') as { engines?: { node?: string } };

/** 单项诊断级别 */
export type DiagnosticStatus = 'ok' | 'warn' | 'fail';

/** 单项诊断结果 */
export type DiagnosticItem = {
  name: string;
  status: DiagnosticStatus;
  message: string;
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
    await readJson(lockPath);
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
    if (await hasSkills(baseDir, platform, 'polaris', [], scope)) {
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
  checks.push(await checkCommand('bash', 'bash'));
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
