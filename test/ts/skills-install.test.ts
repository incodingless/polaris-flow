/**
 * installPolarisForPlatform / skills 布局的集成单测。
 */
import path from 'path';
import { mkdir, mkdtemp, access, readFile, writeFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { copyPolarisSkillsForPlatform, installPolarisForPlatform } from '../../src/core/install.js';
import {
  applySkillNamePrefix,
  findSkillAssetRefViolations,
  resolveSkillNamePrefix,
  SKILL_NAME_PREFIX_PLACEHOLDER,
  validateSkillAssetsNoCrossSkillParentRefs,
} from '../../src/core/install/skills.js';
import { readAssets, type Assets } from '../../src/core/assets/manifest.js';
import {
  BUNDLED_SKILL_SPECS,
  isBundledSkillPresent,
} from '../../src/core/integrations/bundled-skills.js';
import { parseSkillAssetPath } from '../../src/core/assets/layout.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

// 安装类用例会拷贝全部资产（约 200+ 文件），单测需放宽默认 5s 超时
const INSTALL_TIMEOUT = 60_000;

/**
 * 技能族解析。
 * 回归背景：2026-09-14 原型技能从 `prd/prototype*` 迁为独立族 `prototype/{build,review}`，
 * 若 `prototype` 未登记为族，会被降级识别成「顶层叶技能 prototype」，
 * 导致两技能塌缩为同一技能根、policies 注入层级错位。
 */
describe('parseSkillAssetPath 技能族识别', () => {
  it('prototype 是技能族，其下 blueprint / build / review / ship 各为独立叶技能', () => {
    const bp = parseSkillAssetPath('prototype/blueprint/SKILL.md');
    expect(bp).toEqual({ family: 'prototype', skill: 'blueprint', underSkill: 'SKILL.md' });

    const gen = parseSkillAssetPath('prototype/build/SKILL.md');
    expect(gen).toEqual({ family: 'prototype', skill: 'build', underSkill: 'SKILL.md' });

    const rev = parseSkillAssetPath('prototype/review/SKILL.md');
    expect(rev).toEqual({ family: 'prototype', skill: 'review', underSkill: 'SKILL.md' });

    const ship = parseSkillAssetPath('prototype/ship/SKILL.md');
    expect(ship).toEqual({ family: 'prototype', skill: 'ship', underSkill: 'SKILL.md' });
  });

  it('debug 是技能族，其下 diagnose 为独立叶技能', () => {
    expect(parseSkillAssetPath('debug/diagnose/SKILL.md')).toEqual({
      family: 'debug',
      skill: 'diagnose',
      underSkill: 'SKILL.md',
    });

    expect(parseSkillAssetPath('debug/diagnose/templates/rca-report-template.md')).toEqual({
      family: 'debug',
      skill: 'diagnose',
      underSkill: 'templates/rca-report-template.md',
    });
  });

  it('既有族不受影响；未登记目录降级为顶层叶技能', () => {
    expect(parseSkillAssetPath('coding/specify/SKILL.md')?.family).toBe('coding');
    expect(parseSkillAssetPath('prd/discovery/SKILL.md')?.family).toBe('prd');
    expect(parseSkillAssetPath('subagent-probe/SKILL.md')?.family).toBeNull();
  });
});

describe('resolveSkillNamePrefix / applySkillNamePrefix', () => {
  it('nested 用冒号，flat 用连字符', () => {
    expect(resolveSkillNamePrefix('nested')).toBe(':');
    expect(resolveSkillNamePrefix('flat')).toBe('-');
  });

  it('替换全部占位符', () => {
    const raw = `name: polaris${SKILL_NAME_PREFIX_PLACEHOLDER}flow${SKILL_NAME_PREFIX_PLACEHOLDER}specify`;
    expect(applySkillNamePrefix(raw, ':')).toBe('name: polaris:flow:specify');
    expect(applySkillNamePrefix(raw, '-')).toBe('name: polaris-flow-specify');
  });
});

describe('installPolarisForPlatform layout', () => {
  it(
    'claude nested：子 skill 进入 polaris/{coding,prd,testing}/，公共内容与 hooks/scripts 落盘',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-claude-'));
      const result = await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

      expect(result.skills.copied).toBeGreaterThan(0);

      await access(path.join(tmpDir, '.claude/skills/polaris/coding/specify/SKILL.md'));
      await access(path.join(tmpDir, '.claude/skills/polaris/prd/discovery/SKILL.md'));
      await access(path.join(tmpDir, '.claude/skills/polaris/testing/discovery/SKILL.md'));
      await access(path.join(tmpDir, '.claude/skills/polaris/adapters'));
      await access(path.join(tmpDir, '.claude/skills/polaris/hooks/session-start.sh'));
      await access(path.join(tmpDir, '.claude/skills/polaris/scripts/workflow-entry.sh'));
      await access(path.join(tmpDir, '.claude/skills/polaris/scripts/_polaris-cli.sh'));
      await access(path.join(tmpDir, '.polaris'));

      if (result.agents.copied > 0) {
        await access(path.join(tmpDir, '.claude/agents'));
      }

      const specify = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/coding/specify/SKILL.md'),
        'utf-8',
      );
      expect(specify).toMatch(/^name: polaris:coding:specify$/m);
      expect(specify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const probe = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/subagent-probe/SKILL.md'),
        'utf-8',
      );
      expect(probe).toMatch(/^name: polaris:subagent-probe$/m);
      expect(probe).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      // prototype 独立族：蓝图 / 建造 / 评审为三个平级叶技能，各自有独立名称
      const bp = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/prototype/blueprint/SKILL.md'),
        'utf-8',
      );
      expect(bp).toMatch(/^name: polaris:prototype:blueprint$/m);
      expect(bp).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const gen = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/prototype/build/SKILL.md'),
        'utf-8',
      );
      expect(gen).toMatch(/^name: polaris:prototype:build$/m);
      expect(gen).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const rev = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/prototype/review/SKILL.md'),
        'utf-8',
      );
      expect(rev).toMatch(/^name: polaris:prototype:review$/m);
      expect(rev).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const ship = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/prototype/ship/SKILL.md'),
        'utf-8',
      );
      expect(ship).toMatch(/^name: polaris:prototype:ship$/m);
      expect(ship).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      // policies 注入到叶技能（prototype 四技能各自收到，而非注入到族根）
      await access(
        path.join(tmpDir, '.claude/skills/polaris/coding/specify/policies/decision-point.md'),
      );
      await access(
        path.join(tmpDir, '.claude/skills/polaris/prototype/blueprint/policies/decision-point.md'),
      );
      await access(
        path.join(tmpDir, '.claude/skills/polaris/prototype/build/policies/decision-point.md'),
      );
      await access(
        path.join(tmpDir, '.claude/skills/polaris/prototype/review/policies/decision-point.md'),
      );
      await access(
        path.join(tmpDir, '.claude/skills/polaris/prototype/ship/policies/decision-point.md'),
      );
      await expect(
        access(path.join(tmpDir, '.claude/skills/polaris/prototype/policies/decision-point.md')),
      ).rejects.toThrow();
    },
  );

  it(
    'trae flat：叶技能扁平为 polaris-<family>-<skill>，公共内容在 polaris',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-copy-trae-'));
      const result = await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');

      expect(result.skills.copied).toBeGreaterThan(0);

      await access(path.join(tmpDir, '.trae/skills/polaris-coding-specify/SKILL.md'));
      await access(path.join(tmpDir, '.trae/skills/polaris-prd-discovery/SKILL.md'));
      await access(path.join(tmpDir, '.trae/skills/polaris-testing-discovery/SKILL.md'));
      await access(path.join(tmpDir, '.trae/skills/polaris/hooks/session-start.sh'));
      await access(path.join(tmpDir, '.trae/skills/polaris/scripts/workflow-entry.sh'));
      await access(path.join(tmpDir, '.trae/skills/polaris/scripts/_polaris-cli.sh'));
      await expect(access(path.join(tmpDir, '.trae/skills/polaris-README.md'))).rejects.toThrow();

      const specify = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-coding-specify/SKILL.md'),
        'utf-8',
      );
      expect(specify).toMatch(/^name: polaris-coding-specify$/m);
      expect(specify).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const probe = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-subagent-probe/SKILL.md'),
        'utf-8',
      );
      expect(probe).toMatch(/^name: polaris-subagent-probe$/m);
      expect(probe).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      // flat 布局下 prototype 两技能平铺为各自的 polaris-prototype-* 目录
      const gen = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-prototype-build/SKILL.md'),
        'utf-8',
      );
      expect(gen).toMatch(/^name: polaris-prototype-build$/m);
      expect(gen).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const rev = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-prototype-review/SKILL.md'),
        'utf-8',
      );
      expect(rev).toMatch(/^name: polaris-prototype-review$/m);
      expect(rev).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      const ship = await readFile(
        path.join(tmpDir, '.trae/skills/polaris-prototype-ship/SKILL.md'),
        'utf-8',
      );
      expect(ship).toMatch(/^name: polaris-prototype-ship$/m);
      expect(ship).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);

      // 族目录本身不应被当作技能安装
      await expect(
        access(path.join(tmpDir, '.trae/skills/polaris-prototype/SKILL.md')),
      ).rejects.toThrow();

      await access(
        path.join(tmpDir, '.trae/skills/polaris-coding-specify/policies/decision-point.md'),
      );
      await access(
        path.join(tmpDir, '.trae/skills/polaris-prototype-build/policies/decision-point.md'),
      );
    },
  );
});

describe('copyPolarisSkillsForPlatform', () => {
  it('仅拷贝 skills/公共内容，不安装 agents', { timeout: INSTALL_TIMEOUT }, async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-skills-only-'));
    const skillsDir = path.join(tmpDir, '.claude', 'skills', 'polaris');
    const asset = await readAssets('zh');
    await copyPolarisSkillsForPlatform(
      skillsDir,
      path.join(tmpDir, '.claude', 'skills'),
      'nested',
      true,
      asset,
    );

    await access(path.join(tmpDir, '.claude/skills/polaris/coding/specify/SKILL.md'));
    await access(path.join(tmpDir, '.claude/skills/polaris/scripts/workflow-entry.sh'));
    const workflowTpl = await readFile(
      path.join(skillsDir, 'templates', 'workflow-template.yaml'),
      'utf-8',
    );
    expect(workflowTpl).not.toMatch(/^\s*#/m);
    expect(workflowTpl).toContain('coding_tasks:');
    expect(workflowTpl).toContain('debug_tasks:');
    const stateTpl = await readFile(
      path.join(skillsDir, 'templates', 'state.example.yaml'),
      'utf-8',
    );
    expect(stateTpl).toContain('# 单 change 业务档案模板');
    await expect(
      access(path.join(tmpDir, '.claude/agents/tasks-review-agent.md')),
    ).rejects.toThrow();
  });
});

describe('validateSkillAssetsNoCrossSkillParentRefs', () => {
  function makeAssets(shortPath: string, fullPath: string): Assets {
    return {
      langDirAssets: [{ dir: 'skills', files: [{ shortPath, fullPath }] }],
      langFileAssets: [],
      sharedAssets: [],
    };
  }

  it('当前 zh 技能资产无跨技能 ../ 引用、无幽灵占位符', { timeout: INSTALL_TIMEOUT }, async () => {
    const asset = await readAssets('zh');
    const violations = await findSkillAssetRefViolations(asset);
    expect(violations).toEqual([]);
    await expect(validateSkillAssetsNoCrossSkillParentRefs(asset)).resolves.toBeUndefined();
  });

  it(
    '执行层节点技能不调用 task-entry 原语（不得绕过 intake 被直接调用）',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const asset = await readAssets('zh');
      const skills = asset.langDirAssets.find((d) => d.dir === 'skills');
      expect(skills).toBeDefined();
      const read = async (shortPath: string): Promise<string> => {
        const hit = skills!.files.find((f) => f.shortPath.replace(/\\/g, '/') === shortPath);
        expect(hit, shortPath).toBeDefined();
        return readFile(hit!.fullPath, 'utf-8');
      };

      // 机械类清理守卫：coding 的 templates / references 与各技能 description 不得出现"技能名加斜杠"
      // （技能名前缀是 `polaris`，带斜杠就成了不存在的命令 —— 命令前缀只有 `psfl`）
      const assetFiles = skills!.files.map((f) => f.shortPath.replace(/\\/g, '/'));
      for (const shortPath of assetFiles.filter(
        (p) => p.startsWith('coding/') && (p.includes('/templates/') || p.includes('/references/')),
      )) {
        expect(await read(shortPath), `${shortPath} 不得出现技能名加斜杠`).not.toContain(
          '/polaris',
        );
      }
      for (const name of [
        'specify',
        'plan',
        'design',
        'tasks',
        'build',
        'verify',
        'ship',
        'intake',
      ]) {
        const content = await read(`coding/${name}/SKILL.md`);
        const frontmatter = content.split('---')[1] ?? '';
        expect(
          frontmatter,
          `coding/${name}/SKILL.md 的 description 不得出现技能名加斜杠`,
        ).not.toContain('/polaris');
      }

      // 执行层：入口只有一个 = intake ⇒ 正文不得出现原语，且 Step 1 必须是「接收交接」
      for (const name of ['specify', 'plan', 'design', 'tasks', 'build', 'verify', 'ship']) {
        const content = await read(`coding/${name}/SKILL.md`);
        expect(content, `coding/${name}/SKILL.md 不得调用 task-entry`).not.toContain('task-entry');
        expect(content, `coding/${name}/SKILL.md 的入口应为「接收 intake 交接」`).toContain(
          '接收 `intake` 交接',
        );
      }

      // 调度层：原语的唯一调用方；细则随 intake 安装（顶层 policies 已不再注入它）
      expect(await read('coding/intake/SKILL.md')).toContain('task-entry.sh');
      expect(await read('coding/intake/policies/task-entry.md')).toContain('task-entry.sh');

      // 链外例外：retro 由**用户直接调用** —— 不经 intake、不被自动转交、不读任务游标
      // ⚠️ 断言覆盖 retro **整个技能目录**（含 templates / policies），不只是 SKILL.md
      const retroFiles = skills!.files
        .map((f) => f.shortPath.replace(/\\/g, '/'))
        .filter((p) => p.startsWith('coding/retro/'));
      expect(retroFiles.length, 'retro 技能目录应有多份资产').toBeGreaterThan(1);
      for (const shortPath of retroFiles) {
        const content = await read(shortPath);
        expect(content, `${shortPath} 不得调用 task-entry 原语`).not.toContain('task-entry');
        expect(content, `${shortPath} 不得自行枚举在途任务`).not.toContain('get-active-changes');
        // 技能名加斜杠（`/polaris:…`）= 不存在的命令；命令名（`/psfl…`）技能域更拿不到拼写
        expect(content, `${shortPath} 不得引用命令名`).not.toContain('/polaris');
        expect(content, `${shortPath} 不得引用命令名`).not.toContain('/psfl');
      }
      const retro = await read('coding/retro/SKILL.md');
      expect(retro, 'retro 必须声明由用户直接调用').toContain('由用户直接调用');
      expect(retro, 'retro 必须声明不经 intake').toContain('不经 `intake`');
    },
  );

  it('跨技能 ../ 引用被检出', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ref-cross-'));
    const fullPath = path.join(tmpDir, 'SKILL.md');
    await writeFile(fullPath, 'read_file ../specify/policies/task-split-precheck.md\n', 'utf-8');

    const violations = await findSkillAssetRefViolations(
      makeAssets('coding/tweak/SKILL.md', fullPath),
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('coding/tweak/SKILL.md');
    expect(violations[0]).toContain('../specify/policies/task-split-precheck.md');
  });

  it('跨层 ../../../../policies/ 引用被检出', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ref-layer-'));
    const fullPath = path.join(tmpDir, 'exit-check.md');
    await writeFile(fullPath, '按 `../../../../policies/decision-point.md` 暂停\n', 'utf-8');

    const violations = await findSkillAssetRefViolations(
      makeAssets('coding/tweak/policies/exit-check.md', fullPath),
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('../../../../policies/decision-point.md');
  });

  it('技能内 ../references/ 与省略号 .../ 不误报', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ref-within-'));
    const fullPath = path.join(tmpDir, 'four-section-review.md');
    await writeFile(
      fullPath,
      '详见 `../references/test-review-methodology.md`；路径形如 `openspec/.../tasks.md`\n',
      'utf-8',
    );

    const violations = await findSkillAssetRefViolations(
      makeAssets('coding/tasks/policies/four-section-review.md', fullPath),
    );
    expect(violations).toEqual([]);
  });

  it('幽灵占位符 {{SKILL_NAME_PREFIX}} 被检出', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-ref-ghost-'));
    const fullPath = path.join(tmpDir, 'SKILL.md');
    await writeFile(fullPath, '使用 {{SKILL_NAME_PREFIX}}tweak 技能\n', 'utf-8');

    const violations = await findSkillAssetRefViolations(
      makeAssets('coding/tweak/SKILL.md', fullPath),
    );
    expect(violations.length).toBe(1);
    expect(violations[0]).toContain('{{SKILL_NAME_PREFIX}}');
  });
});

/**
 * 附带技能（第三方工具，如 archify / diagram-design）。
 *
 * 它们是「交付图」工具，不是 Polaris 工作流的一环：落 skills 根目录的独立目录、
 * 不改写 {{SKN_SPR}}、不做 policies 注入、维护者文档不下发。
 *
 * 源目录由 `POLARIS_BUNDLED_SKILLS_SOURCE` 指向。真实源在 `devops/vendor/bundled-skills`，
 * 那是开发态资产（不入 git、不入 npm 包），因此这里用 fixture —— 测试不依赖仓库里有没有真实技能。
 */
describe('bundled skills 安装（第三方工具，不进技能族）', () => {
  it('BUNDLED_SKILL_SPECS 全部钉死版本（否则同一 polaris 版本在不同日期装出不同内容）', () => {
    for (const spec of BUNDLED_SKILL_SPECS) {
      expect(
        Boolean(spec.version || spec.commit),
        `${spec.name} 缺 version / commit，会随上游默认分支漂移`,
      ).toBe(true);
    }
  });
  /** 造一个最小源目录：两个技能各含 SKILL.md、references/ 与 PROVENANCE.md */
  async function makeBundledSource(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'polaris-bundled-src-'));
    for (const name of ['archify', 'diagram-design']) {
      await mkdir(path.join(dir, name, 'references'), { recursive: true });
      await writeFile(
        path.join(dir, name, 'SKILL.md'),
        `---\nname: ${name}\n---\n\n# ${name}\n`,
        'utf-8',
      );
      await writeFile(path.join(dir, name, 'references', 'note.md'), 'ref\n', 'utf-8');
      await writeFile(path.join(dir, name, 'PROVENANCE.md'), '# 来源\n', 'utf-8');
    }
    return dir;
  }

  /** 用指定源目录跑一次安装，返回安装根目录 */
  async function installWithSource(source: string, platform = claude): Promise<string> {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-bundled-'));
    const previous = process.env.POLARIS_BUNDLED_SKILLS_SOURCE;
    process.env.POLARIS_BUNDLED_SKILLS_SOURCE = source;
    try {
      await installPolarisForPlatform(tmpDir, platform, true, 'zh', 'project');
    } finally {
      if (previous === undefined) {
        delete process.env.POLARIS_BUNDLED_SKILLS_SOURCE;
      } else {
        process.env.POLARIS_BUNDLED_SKILLS_SOURCE = previous;
      }
    }
    return tmpDir;
  }

  it('版本标记与钉值不一致时视为缺失（否则改了钉值老用户永远不更新）', async () => {
    const source = await makeBundledSource();
    const spec = { name: 'archify', repo: 'owner/repo', version: '9.9.9' };

    // 没有标记文件（历史副本）→ 按缺失处理，宁可重拉一次
    expect(await isBundledSkillPresent(source, 'archify', spec)).toBe(false);

    await writeFile(path.join(source, 'archify', '.polaris-bundled-ref'), '9.9.9\n', 'utf-8');
    expect(await isBundledSkillPresent(source, 'archify', spec)).toBe(true);

    // 钉值升了 → 再次视为缺失，触发重新拉取
    expect(await isBundledSkillPresent(source, 'archify', { ...spec, version: '9.9.10' })).toBe(
      false,
    );
  });

  it(
    'claude：落 skills 根目录独立目录，维护者文档不下发',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const source = await makeBundledSource();
      const tmpDir = await installWithSource(source);

      await access(path.join(tmpDir, '.claude/skills/archify/SKILL.md'));
      await access(path.join(tmpDir, '.claude/skills/archify/references/note.md'));
      await access(path.join(tmpDir, '.claude/skills/diagram-design/SKILL.md'));

      // 不得被当成技能族成员：不进 polaris/，也不注入 policies
      await expect(access(path.join(tmpDir, '.claude/skills/polaris/archify'))).rejects.toThrow();
      await expect(access(path.join(tmpDir, '.claude/skills/archify/policies'))).rejects.toThrow();

      // PROVENANCE 只服务维护者，不随安装下发
      await expect(
        access(path.join(tmpDir, '.claude/skills/archify/PROVENANCE.md')),
      ).rejects.toThrow();
    },
  );

  it('本地源缺失时跳过，不阻断安装', { timeout: INSTALL_TIMEOUT }, async () => {
    const emptySource = await mkdtemp(path.join(os.tmpdir(), 'polaris-bundled-empty-'));
    const tmpDir = await installWithSource(emptySource);

    // 安装照常完成：polaris 技能在，附带技能不在
    await access(path.join(tmpDir, '.claude/skills/polaris/coding/specify/SKILL.md'));
    await expect(access(path.join(tmpDir, '.claude/skills/archify'))).rejects.toThrow();
  });

  it(
    'flat 布局下同样落 skills 根目录（不扁平成 polaris- 前缀）',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const source = await makeBundledSource();
      const tmpDir = await installWithSource(source, trae);

      const skillsRoot = path.join(tmpDir, '.trae/skills');
      await access(path.join(skillsRoot, 'archify/SKILL.md'));
      await expect(access(path.join(skillsRoot, 'polaris-archify'))).rejects.toThrow();
    },
  );
});
