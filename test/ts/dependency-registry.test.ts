/**
 * 依赖登记表的结构自洽性校验。
 *
 * 目标是让「增补一条依赖」这件事有编译期之外的第二道保险：
 * - 必填字段缺失 / id 重复 / method 与 fallback 错配 → 立即失败
 * - 新增 method.kind 却忘了实现 installer → 立即失败
 *
 * 这些校验不测安装行为（那是各 installer 自己的测试），只测「声明是否完整可执行」。
 */
import { describe, expect, it } from 'vitest';

import {
  BUNDLED_REF_MARKER,
  DEPENDENCIES,
  dependencyRepo,
  findDependency,
  githubCopyDependencies,
  localPathComponentIds,
  pinExpectation,
  resolveInstallerId,
  trackedDependencyIds,
  type InstallMethod,
} from '../../src/core/deps/registry.js';
import { POLARIS_SELF_PROBE } from '../../src/core/deps/probe.js';

/** 全部合法的安装执行器；与 install-dependency.ts 的分派分支一一对应 */
const KNOWN_INSTALLERS = new Set([
  'openspec',
  'codegraph',
  'superpowers',
  'github-copy',
  'npm-cli',
]);

describe('依赖登记表', () => {
  it('id 唯一且非空', () => {
    const ids = DEPENDENCIES.map((dep) => dep.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.trim().length).toBeGreaterThan(0);
    }
  });

  it('每条声明都有可读 label 与合法重要度', () => {
    for (const dep of DEPENDENCIES) {
      expect(dep.label.trim(), `${dep.id} 缺 label`).not.toBe('');
      expect(['required', 'recommended', 'optional']).toContain(dep.requiredness);
    }
  });

  it('每条声明的安装执行器都有实现', () => {
    for (const dep of DEPENDENCIES) {
      expect(KNOWN_INSTALLERS.has(resolveInstallerId(dep)), `${dep.id} 分派到未知 installer`).toBe(
        true,
      );
    }
  });

  it('method.kind 与 fallback 载体形态匹配', () => {
    for (const dep of DEPENDENCIES) {
      if (!dep.fallback) continue;
      const allowed: Record<InstallMethod['kind'], string[]> = {
        // CLI 通过 npm 安装包，离线包给的是 tgz
        'npm-cli': ['tgz'],
        // 目录型源：superpowers 走 installSource，附带技能走目录复制
        'npx-skills': ['dir'],
        'github-copy': ['skills-dir'],
      };
      expect(allowed[dep.method.kind], `${dep.id} 的 method.kind 不支持本地保底`).toContain(
        dep.fallback.kind,
      );
      expect(dep.fallback.relPath.trim(), `${dep.id} 的 fallback.relPath 为空`).not.toBe('');
    }
  });

  it('github-copy 依赖都有 repo / targetDirName / pin', () => {
    for (const { spec, method } of githubCopyDependencies()) {
      expect(method.repo.trim(), `${spec.id} 缺 repo`).not.toBe('');
      expect(method.targetDirName.trim(), `${spec.id} 缺 targetDirName`).not.toBe('');
      expect(pinExpectation(method), `${spec.id} 的 pin 解析为空`).not.toBe('');
    }
  });

  it('每条依赖都能解析出上游仓库', () => {
    for (const dep of DEPENDENCIES) {
      expect(dependencyRepo(dep).trim(), `${dep.id} 缺 repo，在线通道无法回退`).not.toBe('');
    }
  });

  it('required 集合与约定一致（openspec / superpowers）', () => {
    const required = DEPENDENCIES.filter((dep) => dep.requiredness === 'required')
      .map((dep) => dep.id)
      .sort();
    expect(required).toEqual(['openspec', 'superpowers']);
  });

  it('本地目录通道覆盖全部依赖（含附带技能）', () => {
    const ids = localPathComponentIds();
    expect(ids.sort()).toEqual(DEPENDENCIES.map((dep) => dep.id).sort());
    // 附带技能此前被漏在 CHANNEL_COMPONENT_IDS 之外，这条防止回退
    expect(ids).toContain('archify');
    expect(ids).toContain('diagram-design');
  });

  it('只有能取到可比版本的依赖才参与 lock 追踪', () => {
    for (const id of trackedDependencyIds()) {
      const dep = DEPENDENCIES.find((item) => item.id === id)!;
      expect(
        ['npm-cli', 'npx-skills'],
        `${id} 声明 trackVersion 但 method.kind 取不到可比版本`,
      ).toContain(dep.method.kind);
    }
    // 附带技能的版本就是钉值本身，不是可比版本号
    expect(trackedDependencyIds()).not.toContain('archify');
    expect(trackedDependencyIds()).not.toContain('diagram-design');
  });

  it('版本标记文件名是单一来源，probe 与写入共用', () => {
    expect(BUNDLED_REF_MARKER).toBe('.polaris-bundled-ref');
  });

  it('Polaris 自身不在依赖表里（它随包分发，没有获取这一步）', () => {
    expect(DEPENDENCIES.map((dep) => dep.id)).not.toContain('polaris');
    expect(findDependency('polaris')).toBeUndefined();
  });

  it('Polaris 自身的已装判据独立于依赖表且仍可判定', () => {
    // hasSkills('polaris') 在 doctor / update / uninstall / prompts 都用，
    // 判据搬到 probe.ts 后必须继续生效
    expect(POLARIS_SELF_PROBE.kind).toBe('any');
  });
});
