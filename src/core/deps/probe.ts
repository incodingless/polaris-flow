/**
 * 依赖「是否已装」判定执行器。
 *
 * 判据来自 `registry.ts` 的 `probe` 声明，本文件只负责把声明落到 I/O。
 * 历史上三处各写一套探测（`detect.ts` 的 SUPER P markers、`bundled-skills.ts` 的
 * `.polaris-bundled-ref`、`npm.ts` 的 resolveCliExecutable），加一个依赖要同时改三处；
 * 现在统一走这里，新增 probe kind 才需要改代码。
 */
import path from 'path';
import { readFile } from 'fs/promises';

import { fileExists, readDir } from '../../utils/file-system.js';
import { resolveCliExecutable } from './npm.js';
import { pinExpectation, type DependencySpec, type ProbeSpec } from './registry.js';

/**
 * 探测上下文。缺省字段表示「该路判据不可用」——例如没有 skillsDir 时
 * `skill-*` 类判据一律返回 false，而不是抛错，避免调用方到处 try/catch。
 */
export type ProbeContext = {
  /** 平台 skills 根目录（查 skill-* 类判据） */
  skillsDir?: string;
  /** 附带技能源目录（查 ref-marker，即 `~/.polaris/components/bundled-skills`） */
  bundledSkillsDir?: string;
  /** CLI 解析器注入，便于单测隔离本机 PATH */
  resolveCli?: (command: string) => string | null;
};

/** 读目录，不存在或不可读时返回空数组 */
async function listDirSafe(dir: string): Promise<string[]> {
  if (!(await fileExists(dir))) return [];
  try {
    return await readDir(dir);
  } catch {
    return [];
  }
}

/**
 * Polaris 自身资产的已装判据。
 *
 * 它不是「依赖」——框架自带的 skills / commands 随 npm 包分发，没有获取这一步，
 * 因此不登记在 `DEPENDENCIES` 里。但 `hasSkills()` 需要判断某平台是否已落盘
 * Polaris 技能（doctor / update / uninstall / prompts 都用），故判据仍集中在本文件，
 * 与依赖的 probe 共用同一套执行器。
 *
 * 兼容旧 `polaris-flow*` 命名（历史安装留下的目录）。
 */
export const POLARIS_SELF_PROBE: ProbeSpec = {
  kind: 'any',
  of: [
    { kind: 'skill-name', names: ['polaris'] },
    { kind: 'skill-prefix', prefix: 'polaris-' },
    { kind: 'skill-name', names: ['polaris-flow'] },
    { kind: 'skill-prefix', prefix: 'polaris-flow-' },
  ],
};

/**
 * 在 skills 目录内判定，忽略 `cli` 类判据。
 *
 * 这是 `hasSkills()` 的语义：它只回答「这个平台的技能目录里有没有」，
 * 不能因为全局装了 openspec CLI 就认为项目里已装——否则 init 会跳过落盘。
 */
export async function probeInSkillsDir(probe: ProbeSpec, skillsDir: string): Promise<boolean> {
  switch (probe.kind) {
    case 'cli':
      return false;
    case 'any': {
      for (const child of probe.of) {
        if (await probeInSkillsDir(child, skillsDir)) return true;
      }
      return false;
    }
    case 'skill-name': {
      const entries = await listDirSafe(skillsDir);
      return probe.names.some((name) => entries.includes(name));
    }
    case 'skill-prefix': {
      const entries = await listDirSafe(skillsDir);
      return entries.some((entry) => entry.startsWith(probe.prefix));
    }
    case 'skill-markers': {
      for (const marker of probe.markers) {
        const markerPath = path.join(skillsDir, marker);
        const skillMd = path.join(markerPath, 'SKILL.md');
        if ((await fileExists(markerPath)) || (await fileExists(skillMd))) return true;
      }
      return false;
    }
    case 'ref-marker':
      // 版本标记文件不在平台 skills 目录，而在附带技能源目录
      return false;
  }
}

/** 读 `.polaris-bundled-ref` 并与 pin 比对；标记缺失按「未就位」处理 */
async function matchRefMarker(spec: DependencySpec, bundledSkillsDir: string): Promise<boolean> {
  const skillDir = path.join(bundledSkillsDir, spec.id);
  if (!(await fileExists(path.join(skillDir, 'SKILL.md')))) return false;

  const expected = pinExpectation(spec.method);
  // 不钉版本（default-branch）时只要求目录存在
  if (!expected) return true;

  try {
    const actual = (await readFile(path.join(skillDir, '.polaris-bundled-ref'), 'utf-8')).trim();
    return actual === expected;
  } catch {
    return false;
  }
}

/**
 * 判定某条依赖是否已经装好。
 *
 * 注意 `ref-marker` 判据查的是**本地源目录**（components/bundled-skills），
 * 不是平台 skills 目录：平台侧是否存在由 `github-copy` 的落盘步骤保证。
 */
export async function probeDependency(
  spec: DependencySpec,
  ctx: ProbeContext = {},
): Promise<boolean> {
  const resolveCli = ctx.resolveCli ?? resolveCliExecutable;

  const evaluate = async (probe: ProbeSpec): Promise<boolean> => {
    switch (probe.kind) {
      case 'cli':
        return Boolean(resolveCli(probe.command));
      case 'ref-marker':
        return ctx.bundledSkillsDir ? matchRefMarker(spec, ctx.bundledSkillsDir) : false;
      case 'any':
        for (const child of probe.of) {
          if (await evaluate(child)) return true;
        }
        return false;
      default:
        return ctx.skillsDir ? probeInSkillsDir(probe, ctx.skillsDir) : false;
    }
  };

  return evaluate(spec.probe);
}
