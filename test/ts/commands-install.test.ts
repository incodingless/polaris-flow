/**
 * commands 安装的集成单测：落盘路径与 {{SKN_SPR}} 按平台布局展开。
 */
import path from 'path';
import { access, mkdtemp, readFile } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';

import { installPolarisForPlatform } from '../../src/core/install.js';
import {
  COMMAND_NAME_PREFIX_PLACEHOLDER,
  resolveCommandDest,
} from '../../src/core/install/commands.js';
import { SKILL_NAME_PREFIX_PLACEHOLDER } from '../../src/core/install/skills.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const cursor = PLATFORMS.find((p) => p.id === 'cursor')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

/** 菜单命令中引用的八个技能，按布局展开后的期望形态 */
const referencedSkills = {
  nested: [
    'polaris:coding:specify',
    'polaris:prd:discovery',
    'polaris:prd:userstory',
    'polaris:prd:readiness',
    'polaris:testing:discovery',
    'polaris:testing:acceptance',
    'polaris:testing:review',
    'polaris:debug:diagnose',
  ],
  flat: [
    'polaris-coding-specify',
    'polaris-prd-discovery',
    'polaris-prd-userstory',
    'polaris-prd-readiness',
    'polaris-testing-discovery',
    'polaris-testing-acceptance',
    'polaris-testing-review',
    'polaris-debug-diagnose',
  ],
} as const;

// installPolarisForPlatform 会拷贝全部资产（约 200+ 文件），单测需放宽默认 5s 超时
const INSTALL_TIMEOUT = 60_000;

describe('installPolarisForPlatform commands', () => {
  it(
    'claude nested：菜单命令落盘且技能名展开为冒号分隔',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-cmd-claude-'));
      await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

      const command = await readFile(
        path.join(tmpDir, '.claude/commands/polaris/flow.md'),
        'utf-8',
      );

      expect(command).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
      for (const skill of referencedSkills.nested) {
        expect(command).toContain(skill);
      }
      // 路由表编号齐全（P01–P02 / R / T + 可用的 M01 / M02 / M11；M12 标「暂不可用」不作断言）
      for (const code of [
        'P01',
        'P02',
        'M01',
        'M02',
        'M11',
        'R01',
        'R02',
        'R03',
        'T01',
        'T02',
        'T03',
      ]) {
        expect(command).toContain(`**${code}**`);
      }

      // 分类子目录原样保留：coding/ prd/ maintance/
      expect(
        await readFile(path.join(tmpDir, '.claude/commands/polaris/coding/normal.md'), 'utf-8'),
      ).toContain('polaris:coding:normal');
      expect(
        await readFile(path.join(tmpDir, '.claude/commands/polaris/prd/readiness.md'), 'utf-8'),
      ).toContain('polaris:prd:readiness');
      // prd 族级命令与同族子目录命令同级共存（同 prototype 形态）
      const prdEntry = await readFile(
        path.join(tmpDir, '.claude/commands/polaris/prd.md'),
        'utf-8',
      );
      expect(prdEntry).toContain('polaris:prd:discovery');
      expect(prdEntry).toContain('/polaris:prd');
      // discovery 已迁移为族级命令，原分类子目录文件不得再落盘
      await expect(
        access(path.join(tmpDir, '.claude/commands/polaris/prd/discovery.md')),
      ).rejects.toThrow();
      expect(
        await readFile(path.join(tmpDir, '.claude/commands/polaris/maintance/hotfix.md'), 'utf-8'),
      ).toContain('polaris:maintance:hotfix');
      // M01 / M02 两个入口命令都交出到 debug 族入口技能：{{SKN_SPR}} 按 skillsLayout 展开为冒号
      expect(
        await readFile(path.join(tmpDir, '.claude/commands/polaris/maintance/bugfix.md'), 'utf-8'),
      ).toContain('polaris:debug:diagnose');

      // 原型族两个独立入口：族级命令 prototype.md 与分类子目录 prototype/review.md 同级共存
      // （全仓首例，故显式断言落盘路径未被目录吞掉）
      const prototypeEntry = await readFile(
        path.join(tmpDir, '.claude/commands/polaris/prototype.md'),
        'utf-8',
      );
      expect(prototypeEntry).toContain('polaris:prototype:blueprint');
      // 命令名占位符展开为冒号：/polaris:prototype（不是 /polaris:prototype:prototype）
      expect(prototypeEntry).toContain('/polaris:prototype');
      expect(
        await readFile(path.join(tmpDir, '.claude/commands/polaris/prototype/review.md'), 'utf-8'),
      ).toContain('polaris:prototype:review');

      // 测试用例设计：testing 族命令 testcase.md 交出到 testing 族入口技能（命令名取工作流名 testcase）
      const testcaseEntry = await readFile(
        path.join(tmpDir, '.claude/commands/polaris/testing/testcase.md'),
        'utf-8',
      );
      expect(testcaseEntry).toContain('polaris:testing:discovery');
      expect(testcaseEntry).toContain('/polaris:testing:testcase');
    },
  );

  it('trae flat：菜单命令落盘且技能名展开为连字符分隔', { timeout: INSTALL_TIMEOUT }, async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-cmd-trae-'));
    await installPolarisForPlatform(tmpDir, trae, true, 'zh', 'project');

    const command = await readFile(path.join(tmpDir, '.trae/commands/polaris/flow.md'), 'utf-8');

    expect(command).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
    for (const skill of referencedSkills.flat) {
      expect(command).toContain(skill);
    }
    // trae 侧技能名扁平，但命令目录树与 claude 一致（分类子目录未被扁平化）
    expect(
      await readFile(path.join(tmpDir, '.trae/commands/polaris/coding/normal.md'), 'utf-8'),
    ).toContain('polaris-coding-normal');
  });

  it(
    'cursor flat：命令扁平落到 commands/ 顶层，命令名分隔符展开为连字符',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-cmd-cursor-'));
      await installPolarisForPlatform(tmpDir, cursor, true, 'zh', 'project');

      // 入口命令：Cursor CLI 只读 .cursor/commands/ 顶层 .md，故落盘为 polaris-flow.md
      const command = await readFile(
        path.join(tmpDir, '.cursor/commands/polaris-flow.md'),
        'utf-8',
      );
      expect(command).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
      expect(command).not.toContain(COMMAND_NAME_PREFIX_PLACEHOLDER);
      // cursor 的 skillsLayout 仍是 nested → 正文里的技能名仍展开为冒号形式
      for (const skill of referencedSkills.nested) {
        expect(command).toContain(skill);
      }
      // 命令名按 commandLayout=flat 展开为连字符
      expect(command).toContain('/polaris-flow');
      // 不得再存在 polaris 命名空间目录（对 CLI 多一层就完全读不到）
      await expect(access(path.join(tmpDir, '.cursor/commands/polaris'))).rejects.toThrow();

      // 分类子目录被扁平化为 polaris-<路径>
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-coding-normal.md'), 'utf-8'),
      ).toContain('/polaris-coding-normal');
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-prd-readiness.md'), 'utf-8'),
      ).toContain('/polaris-prd-readiness');
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-maintance-hotfix.md'), 'utf-8'),
      ).toContain('/polaris-maintance-hotfix');
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-maintance-bugfix.md'), 'utf-8'),
      ).toContain('/polaris-maintance-bugfix');
      // testing 族命令 testcase.md 扁平化为 polaris-testing-testcase.md
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-testing-testcase.md'), 'utf-8'),
      ).toContain('/polaris-testing-testcase');
      // 族级命令 prototype.md 扁平化为 polaris-prototype.md，与子目录命令互不覆盖
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-prototype.md'), 'utf-8'),
      ).toContain('/polaris-prototype');
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-prototype-review.md'), 'utf-8'),
      ).toContain('/polaris-prototype-review');
      // prd 族级命令同理：polaris-prd.md 与 polaris-prd-readiness.md 并存
      expect(
        await readFile(path.join(tmpDir, '.cursor/commands/polaris-prd.md'), 'utf-8'),
      ).toContain('/polaris-prd');
      await expect(
        access(path.join(tmpDir, '.cursor/commands/polaris-prd-discovery.md')),
      ).rejects.toThrow();
    },
  );
});

describe('resolveCommandDest', () => {
  it('nested 原样保留子目录；flat 加 polaris- 前缀并以 - 连接路径段', () => {
    expect(resolveCommandDest('flow.md', 'nested')).toBe('flow.md');
    expect(resolveCommandDest('coding/normal.md', 'nested')).toBe('coding/normal.md');
    expect(resolveCommandDest('flow.md', 'flat')).toBe('polaris-flow.md');
    expect(resolveCommandDest('coding/normal.md', 'flat')).toBe('polaris-coding-normal.md');
    expect(resolveCommandDest('maintance/hotfix.md', 'flat')).toBe('polaris-maintance-hotfix.md');
    expect(resolveCommandDest('maintance/bugfix.md', 'flat')).toBe('polaris-maintance-bugfix.md');
    // 族级命令与同族子目录命令并存：前者不得被后者吞并（全仓首例）
    expect(resolveCommandDest('prototype.md', 'flat')).toBe('polaris-prototype.md');
    expect(resolveCommandDest('prototype/review.md', 'flat')).toBe('polaris-prototype-review.md');
    expect(resolveCommandDest('prd.md', 'flat')).toBe('polaris-prd.md');
    expect(resolveCommandDest('prd/readiness.md', 'flat')).toBe('polaris-prd-readiness.md');
    expect(resolveCommandDest('testing/testcase.md', 'flat')).toBe('polaris-testing-testcase.md');
  });
});

describe('testing 族技能安装', () => {
  it(
    'claude nested：四个阶段技能 + 服务型 review 进入 polaris/testing/，已退休的 case 不再落盘',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-testingfam-'));
      await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

      // 四个阶段技能（discovery/draft/refine/ship）+ 一个服务型技能（review，不进相位表）
      // 均独立安装，name 正确且占位符已展开
      for (const skill of ['discovery', 'draft', 'refine', 'review', 'ship']) {
        const stage = await readFile(
          path.join(tmpDir, '.claude/skills/polaris/testing', skill, 'SKILL.md'),
          'utf-8',
        );
        expect(stage).toMatch(new RegExp(`^name: polaris:testing:${skill}$`, 'm'));
        expect(stage).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
      }

      // 已退休的 case 不得再随安装落盘（职责由 draft 承接）
      await expect(
        access(path.join(tmpDir, '.claude/skills/polaris/testing/case/SKILL.md')),
      ).rejects.toThrow();

      // acceptance 保留为上游技能（产出 GWT 验收标准，供 discovery 作输入）
      const acceptanceSkill = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/testing/acceptance/SKILL.md'),
        'utf-8',
      );
      expect(acceptanceSkill).toMatch(/^name: polaris:testing:acceptance$/m);
    },
  );
});

describe('debug 族技能安装', () => {
  it(
    'claude nested：三个阶段技能 + 入口命令 + policies 随技能落盘',
    { timeout: INSTALL_TIMEOUT },
    async () => {
      const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-debugfam-'));
      await installPolarisForPlatform(tmpDir, claude, true, 'zh', 'project');

      // 三个阶段技能均独立安装，name 正确且占位符已展开
      for (const phase of ['diagnose', 'patch', 'closeout']) {
        const stage = await readFile(
          path.join(tmpDir, '.claude/skills/polaris/debug', phase, 'SKILL.md'),
          'utf-8',
        );
        expect(stage).toMatch(new RegExp(`^name: polaris:debug:${phase}$`, 'm'));
        expect(stage).not.toContain(SKILL_NAME_PREFIX_PLACEHOLDER);
      }

      // 已合并掉的入口技能与 prove 阶段不得再随安装落盘
      for (const gone of ['bugfix', 'hotfix', 'prove']) {
        await expect(
          access(path.join(tmpDir, '.claude/skills/polaris/debug', gone, 'SKILL.md')),
        ).rejects.toThrow();
      }

      // 入口在命令层：两个 maintance 命令都交出到 debug:diagnose，各自只声明预期通道
      for (const entry of ['bugfix', 'hotfix']) {
        const cmd = await readFile(
          path.join(tmpDir, '.claude/commands/polaris/maintance', `${entry}.md`),
          'utf-8',
        );
        expect(cmd).toContain('polaris:debug:diagnose');
        expect(cmd).toContain(`预期通道 = \`${entry}\``);
        // 入口命令只声明通道与交出目标，不内联阶段执行细节
        expect(cmd).not.toContain('git diff');
      }

      // 族未登记为 SKILL_FAMILIES 时，debug 会塌缩成单个顶层叶技能 polaris/debug
      await expect(
        access(path.join(tmpDir, '.claude/skills/polaris/debug/SKILL.md')),
      ).rejects.toThrow();

      // 语言包顶层 policies 注入到叶技能
      await expect(
        access(
          path.join(tmpDir, '.claude/skills/polaris/debug/diagnose/policies/decision-point.md'),
        ),
      ).resolves.toBeUndefined();

      // 族级 `_shared/` 分发已于 2026-09-17 取消：族策略不再由安装器跨技能分发，
      // 具体落点（各技能自带 policies/ 或 references/）不在此钉死——见 README「共享约定」。
      // 这里只守一条：族专属策略不得泄漏到其他族。
      await expect(
        access(
          path.join(tmpDir, '.claude/skills/polaris/coding/tweak/policies/capability-tiers.md'),
        ),
      ).rejects.toThrow();

      // 产物改名：explore-brief → diagnose-brief；新增 rca-report（均归 diagnose 技能）
      const diagnose = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/debug/diagnose/SKILL.md'),
        'utf-8',
      );
      expect(diagnose).toContain('diagnose-brief.md');
      expect(diagnose).toContain('rca-report.md');
      expect(diagnose).not.toContain('explore-brief.md');

      // 模板迁移：tasks 归 diagnose、report 归 closeout
      await expect(
        access(
          path.join(tmpDir, '.claude/skills/polaris/debug/diagnose/templates/tasks-template.md'),
        ),
      ).resolves.toBeUndefined();
      await expect(
        access(
          path.join(
            tmpDir,
            '.claude/skills/polaris/debug/closeout/templates/bugfix-report-template.md',
          ),
        ),
      ).resolves.toBeUndefined();

      // 脚本调用带 $PLUGIN_ROOT 与文件参数（在 diagnose 模板内）
      const tasksTpl = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/debug/diagnose/templates/tasks-template.md'),
        'utf-8',
      );
      expect(tasksTpl).toContain('bash "$PLUGIN_ROOT/scripts/tasks-lint.sh"');

      // H14 与 flow.md 的「开发类」清单必须一致，且含 M02，否则 M02 入口不受零步阻断保护
      const hardStops = await readFile(
        path.join(tmpDir, '.claude/skills/polaris/debug/diagnose/policies/hard-stops.md'),
        'utf-8',
      );
      expect(hardStops).toContain('M01 / M02 / C01–C03');
      const flowCmd = await readFile(
        path.join(tmpDir, '.claude/commands/polaris/flow.md'),
        'utf-8',
      );
      expect(flowCmd).toContain('（C01 / C02 / C03 / M01 / M02）');
    },
  );
});
