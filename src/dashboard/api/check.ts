import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  description: string;
}

export function runChecks(projectRoot: string): {
  checks: CheckResult[];
  summary: { ok: number; warn: number; error: number };
} {
  const checks: CheckResult[] = [];

  const polarisDir = join(projectRoot, '.polaris');
  checks.push({
    name: '.polaris 目录',
    status: existsSync(polarisDir) ? 'ok' : 'error',
    description: existsSync(polarisDir)
      ? '.polaris 目录存在'
      : '.polaris 目录不存在，请运行 polaris init',
  });

  const metaFile = join(polarisDir, 'polaris.meta.yaml');
  checks.push({
    name: 'polaris.meta.yaml',
    status: existsSync(metaFile) ? 'ok' : 'error',
    description: existsSync(metaFile) ? '项目元数据文件存在' : '项目元数据文件不存在',
  });

  const recordFile = join(polarisDir, 'polaris.record.yaml');
  checks.push({
    name: 'polaris.record.yaml',
    status: existsSync(recordFile) ? 'ok' : 'warn',
    description: existsSync(recordFile)
      ? '安装记录文件存在'
      : '安装记录文件不存在（可能尚未执行安装）',
  });

  const openspecDir = join(projectRoot, 'openspec');
  checks.push({
    name: 'openspec 目录',
    status: existsSync(openspecDir) ? 'ok' : 'warn',
    description: existsSync(openspecDir) ? 'openspec 目录存在' : 'openspec 目录不存在',
  });

  const polarisYaml = join(projectRoot, 'openspec', 'polaris.yaml');
  checks.push({
    name: 'polaris.yaml',
    status: existsSync(polarisYaml) ? 'ok' : 'warn',
    description: existsSync(polarisYaml) ? '项目配置文件存在' : '项目配置文件不存在',
  });

  const summary = {
    ok: checks.filter((c) => c.status === 'ok').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    error: checks.filter((c) => c.status === 'error').length,
  };

  return { checks, summary };
}
