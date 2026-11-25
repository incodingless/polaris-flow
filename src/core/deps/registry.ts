/**
 * 依赖登记表 —— 全仓唯一「polaris 需要从外部获取哪些组件 / 技能」的声明源。
 *
 * 定位：
 * - 本文件**只放声明与类型**，不含 I/O。探测执行见 `./probe.ts`，安装分派见各自 installer。
 * - `init` 按本表编排，`update` / `doctor` / `prompts` 的组件清单均从此派生，
 *   不再维护平行的 id 数组（历史上 `SOURCES` / `BUNDLED_SKILL_SPECS` /
 *   `CHANNEL_COMPONENT_IDS` 三份清单各写一遍，加一个依赖要改三处）。
 *
 * **不收录 Polaris 自身**：框架自带的 skills / commands 随 npm 包分发，由
 * `core/install.ts` 按平台落盘，没有「获取」这一步。它的已装判据单独定义在
 * `probe.ts` 的 `POLARIS_SELF_PROBE`，与本表无关。
 *
 * ## 增补依赖怎么做
 *
 * 在 `DEPENDENCIES` 末尾加一条 record，只需改这一个文件。按安装方式选 `method.kind`：
 *
 * | 要加的东西 | method.kind | 必填 |
 * |---|---|---|
 * | GitHub 上的技能目录（如再引一个图表工具） | `github-copy` | repo / pin / targetDirName |
 * | npm 全局 CLI | `npm-cli` | pkg / repo / minVersion |
 * | `npx skills add` 安装的技能包 | `npx-skills` | repo / minVersion |
 *
 * 钉版本三选一（`pin`）：上游有 tag 用 `{ version }`；无 tag 用 `{ commit }`；
 * 不想跟版用 `{ track: 'default-branch' }`（内容会漂移、且不进 update 版本比较）。
 *
 * 全新安装范式（pip / zip / brew 等）不在本表覆盖范围内：需新增 `method.kind` 分支
 * 与对应 installer，这是有意的边界——声明式只消掉「同类扩展」的改码成本。
 *
 * 表内自洽性由 `test/ts/dependency-registry.test.ts` 校验（id 唯一、kind 都有实现、
 * fallback 载体路径合法）。**声明与离线包生成必须同步**：新增 `fallback` 后
 * 要同步 `devops/package.sh` 的 components/ 产物，否则离线安装会拿到空保底。
 */

/**
 * 依赖重要度，决定失败语义与交互提问：
 * - `required`   缺失即失败，汇总里计入 platformFailed
 * - `recommended` 缺失降级但提示
 * - `optional`   缺失只告警，不参与覆盖询问（少个工具不影响工作流）
 */
export type DependencyRequiredness = 'required' | 'recommended' | 'optional';

/** 上游版本钉。三者互斥，语义不同，勿当同义词用 */
export type Pin =
  /** 钉上游 tag（`fetchRepo` 会先试 `v<version>`）。上游发版即需改此行 */
  | { version: string }
  /** 钉 commit SHA。上游没有 tag 时用；升级需手改 40 位 SHA */
  | { commit: string }
  /** 不钉，每次取默认分支最新。内容会漂移，且无法参与 update 的版本比较 */
  | { track: 'default-branch' };

/** 技能落盘位置（供 installSource 消费，语义与原 SkillSource 一致） */
export type SkillsPlacement = {
  /** 源仓库内技能根目录；`zh/` 前缀会按语言改写 */
  skillsPath: string;
  /** 落到平台 skills 根下的子目录；空串 = 直接落根 */
  targetDir?: string;
  /** 额外随附目录（policies / templates 等） */
  extraPaths?: string[];
};

/** 安装方式。判别联合：新增一种范式才需加分支，同范式的组件只是新增一条 record */
export type InstallMethod =
  | {
      /** `npm i -g <pkg>@latest` → git clone → 本地目录 三通道 */
      kind: 'npm-cli';
      /** npm 包名，形如 `@fission-ai/openspec` */
      pkg: string;
      /** git 回退通道仓库（`owner/repo`）；无回退时留空串 */
      repo: string;
      /** 最低可接受版本；低于此值的上游不装 */
      minVersion: string;
      /** npm 安装超时。取 180_000 还是 120_000 按包体积定，不要随手写 */
      timeoutMs: number;
    }
  | {
      /** `npx skills add <repo> -y --agent <id>` */
      kind: 'npx-skills';
      /** `owner/repo` */
      repo: string;
      minVersion: string;
      /** npx 首次要下载包本体，超时给足（见 superpowers 的 300s） */
      timeoutMs: number;
      /**
       * 安装后技能落盘映射。
       * npx 通道由 skills CLI 自行落盘，此项供 git 镜像 / 本地保底通道使用，
       * 两条回退通道拿不到 npx 的落盘结果，必须显式声明怎么拷。
       */
      placement: SkillsPlacement;
    }
  | {
      /** GitHub 浅克隆 → 复制子目录到 `<skills 根>/<targetDirName>/` */
      kind: 'github-copy';
      /** `owner/repo` */
      repo: string;
      pin: Pin;
      /** 仓库内技能所在子目录；缺省为仓库根 */
      subdir?: string;
      /** 落盘目录名，即 `<skills 根>/<targetDirName>/` */
      targetDirName: string;
      /** 裁剪规则：返回 true 表示不拷 */
      exclude?: (relPath: string) => boolean;
    };

/** 本地保底载体形态。离线包 preseed 到 `~/.polaris/components/` 后的消费方式 */
export type LocalFallback =
  /** `components/<relPath>-<ver>.tgz` → `npm i -g <tgz>` */
  | { kind: 'tgz'; relPath: string }
  /** `components/<relPath>/`（目录，已解包）→ installSource 只认目录 */
  | { kind: 'dir'; relPath: string }
  /** `components/<relPath>/`（目录）→ 原样拷到技能根 */
  | { kind: 'skills-dir'; relPath: string };

/**
 * 已装判据。判别联合，执行见 `probe.ts`。
 *
 * `any` 用于「CLI 装了 或 技能目录在」这类上游有多种落点的组件（openspec / codegraph）。
 */
export type ProbeSpec =
  /** PATH / `~/.polaris/cli/bin` / pnpm 全局 bin 能解析到该命令 */
  | { kind: 'cli'; command: string }
  /** skills 根下存在名字精确等于 names 之一的目录 */
  | { kind: 'skill-name'; names: string[] }
  /** skills 根下存在以 prefix 开头的目录 */
  | { kind: 'skill-prefix'; prefix: string }
  /** skills 根下存在任一 marker 目录（含 SKILL.md 或目录本身） */
  | { kind: 'skill-markers'; markers: string[] }
  /** components 下该组件的 `.polaris-bundled-ref` 与 pin 一致 */
  | { kind: 'ref-marker' }
  /** 任一子判据命中即视为已装 */
  | { kind: 'any'; of: ProbeSpec[] };

/**
 * 安装执行器 id。决定 init 分派到哪个 installer 实现。
 *
 * 缺省由 `method.kind` 推导（见 `resolveInstallerId`），只有需要组件特有流程时才显式指定
 * ——例如 openspec / codegraph 装完 CLI 还要跑项目级初始化，不能走通用 `npm-cli`。
 */
export type DependencyInstallerId =
  'openspec' | 'codegraph' | 'superpowers' | 'github-copy' | 'npm-cli';

/** 单条依赖声明 */
export type DependencySpec = {
  /** 稳定标识；同时用作 lock 的 `sources[].id` 与 `install.local-paths.<id>` 的键 */
  id: string;
  /** 终端展示名（日志 / 交互提问用），不是 id */
  label: string;
  requiredness: DependencyRequiredness;
  method: InstallMethod;
  /** 覆盖默认安装执行器；缺省按 method.kind 推导 */
  installer?: DependencyInstallerId;
  probe: ProbeSpec;
  /** 在线通道全挂时的本地保底；无保底则缺失即报错 */
  fallback?: LocalFallback;
  /**
   * 是否参与 `polaris update` 的版本比较（记录本身总会写进 `install-state.json`）。
   * 不钉版本的 `github-copy`（附带技能）设 false——它们的「版本」是钉值，不是可比版本号。
   */
  trackVersion: boolean;
};

/**
 * 由 method.kind 推导默认安装执行器。
 *
 * `npm-cli` 默认走通用通道（npm → git → 本地），但带项目级初始化的组件
 * （openspec / codegraph）必须显式指定 installer，否则装完 CLI 不会初始化项目。
 */
export function resolveInstallerId(spec: DependencySpec): DependencyInstallerId {
  if (spec.installer) return spec.installer;
  switch (spec.method.kind) {
    case 'npm-cli':
      return 'npm-cli';
    case 'npx-skills':
      return 'superpowers';
    case 'github-copy':
      return 'github-copy';
  }
}

/** Superpowers 特征 skill（命中任一即视为已装） */
export const SUPERPOWERS_MARKERS = [
  'brainstorming',
  'using-superpowers',
  'writing-plans',
  'test-driven-development',
  'subagent-driven-development',
  'request-code-review',
] as const;

/**
 * 附带技能本地副本的版本标记文件名。
 *
 * 作用：让「已装过」不等于「永远不更新」。仅凭 `SKILL.md` 是否存在判齐备，
 * 会导致钉值改了以后老用户永远拿不到新版。写入与读取必须用同一个常量
 * （`probe.ts` 判定、`bundled-skills.ts` 写入）。
 */
export const BUNDLED_REF_MARKER = '.polaris-bundled-ref';

/**
 * 全仓唯一的依赖清单。
 *
 * 顺序即 init 的获取顺序：先 CLI（工作流依赖它们）再技能。
 * 改这个数组就是改 polaris 的外部依赖集合——不要在其他文件里另立组件名单。
 *
 * Polaris 自身不在此表：它随 npm 包分发，由 `core/install.ts` 逐平台落盘。
 */
export const DEPENDENCIES: DependencySpec[] = [
  {
    id: 'openspec',
    label: 'OpenSpec',
    requiredness: 'required',
    // 装完 CLI 还要跑 `openspec init` 写项目配置，不能走通用 npm-cli 通道
    installer: 'openspec',
    method: {
      kind: 'npm-cli',
      pkg: '@fission-ai/openspec',
      repo: 'Fission-AI/OpenSpec',
      minVersion: '1.4.0',
      timeoutMs: 120_000,
    },
    // 两路落点：全局 CLI，或 openspec init 写进技能目录的 openspec-* 技能
    probe: {
      kind: 'any',
      of: [
        { kind: 'cli', command: 'openspec' },
        { kind: 'skill-prefix', prefix: 'openspec-' },
      ],
    },
    fallback: { kind: 'tgz', relPath: 'openspec' },
    trackVersion: true,
  },
  {
    id: 'superpowers',
    label: 'Superpowers',
    requiredness: 'required',
    // npx skills CLI 的 agent 名映射与回退链是 superpowers 专属流程
    installer: 'superpowers',
    method: {
      kind: 'npx-skills',
      repo: 'obra/superpowers',
      minVersion: '4.0.0',
      // npx 首次要下载 skills 包本体 + clone 仓库，给足 5 分钟
      timeoutMs: 300_000,
      placement: { skillsPath: 'skills', targetDir: '' },
    },
    probe: { kind: 'skill-markers', markers: [...SUPERPOWERS_MARKERS] },
    // preseed 把 superpowers-<ver>.tgz 解包成 components/superpowers/ 目录
    fallback: { kind: 'dir', relPath: 'superpowers' },
    trackVersion: true,
  },
  {
    id: 'codegraph',
    label: 'Codegraph',
    requiredness: 'recommended',
    // 装完 CLI 还要按 scope 建索引，不能走通用 npm-cli 通道
    installer: 'codegraph',
    method: {
      kind: 'npm-cli',
      pkg: '@colbymchenry/codegraph',
      repo: 'colbymchenry/codegraph',
      minVersion: '1.0.0',
      timeoutMs: 180_000,
    },
    probe: {
      kind: 'any',
      of: [
        { kind: 'cli', command: 'codegraph' },
        { kind: 'skill-prefix', prefix: 'codegraph-' },
      ],
    },
    fallback: { kind: 'tgz', relPath: 'codegraph' },
    trackVersion: true,
  },
  {
    id: 'archify',
    label: 'Archify',
    requiredness: 'optional',
    method: {
      kind: 'github-copy',
      repo: 'tt-a1i/archify',
      pin: { version: '3.2.0' },
      subdir: 'archify',
      targetDirName: 'archify',
      // 渲染后的成品演示，SKILL.md 引用的是同目录 .json；裁掉省 12MB
      exclude: (rel) => rel.startsWith('examples/') && rel.endsWith('.html'),
    },
    // 两路判据：本地源已就位（ref-marker 版本一致），或该平台 skills 目录已落盘
    probe: {
      kind: 'any',
      of: [{ kind: 'ref-marker' }, { kind: 'skill-name', names: ['archify'] }],
    },
    fallback: { kind: 'skills-dir', relPath: 'bundled-skills/archify' },
    trackVersion: false,
  },
  {
    id: 'diagram-design',
    label: 'Diagram Design',
    requiredness: 'optional',
    method: {
      kind: 'github-copy',
      repo: 'cathrynlavery/diagram-design',
      // 上游没有 release tag，只能钉 SHA：钉了才不会「今天装的和下月装的不一样」
      pin: { commit: 'd74d8c2d0c78a9e1efd43137f6a9a51182a8b5f0' },
      subdir: 'skills/diagram-design',
      targetDirName: 'diagram-design',
    },
    probe: {
      kind: 'any',
      of: [{ kind: 'ref-marker' }, { kind: 'skill-name', names: ['diagram-design'] }],
    },
    fallback: { kind: 'skills-dir', relPath: 'bundled-skills/diagram-design' },
    trackVersion: false,
  },
];

/** 按 id 取依赖声明；不存在返回 undefined（不抛，便于 probe 守卫） */
export function findDependency(id: string): DependencySpec | undefined {
  return DEPENDENCIES.find((dep) => dep.id === id);
}

/** 按 id 取依赖声明；不存在则抛错（用于确定存在的场景，如 init 编排） */
export function requireDependency(id: string): DependencySpec {
  const spec = findDependency(id);
  if (!spec) {
    throw new Error(`Dependency "${id}" is not registered in core/deps/registry.ts`);
  }
  return spec;
}

/**
 * 支持 `install.local-paths.<id>` 配置的组件 id。
 *
 * 替代原先硬编码的 `CHANNEL_COMPONENT_IDS`，顺带补上附带技能
 * （archify / diagram-design）此前无法配置本地目录的缺口。
 */
export function localPathComponentIds(): string[] {
  return DEPENDENCIES.map((dep) => dep.id);
}

/**
 * 进 lock 且参与 `polaris update` 版本比较的依赖 id。
 *
 * 附带技能（`github-copy`）被排除：它们的「版本」是钉值本身，不是可比版本号。
 */
export function trackedDependencyIds(): string[] {
  return DEPENDENCIES.filter((dep) => dep.trackVersion).map((dep) => dep.id);
}

/** `github-copy` 依赖的声明与其 method 配对（供附带技能获取逻辑消费） */
export type GithubCopyDependency = {
  spec: DependencySpec;
  method: Extract<InstallMethod, { kind: 'github-copy' }>;
};

/**
 * 所有走 GitHub 浅克隆 + 目录复制的依赖（archify / diagram-design 等）。
 * 落盘目录名取 `method.targetDirName`，与平台 skills 根下的目录同名。
 */
export function githubCopyDependencies(): GithubCopyDependency[] {
  const result: GithubCopyDependency[] = [];
  for (const spec of DEPENDENCIES) {
    if (spec.method.kind === 'github-copy') {
      result.push({ spec, method: spec.method });
    }
  }
  return result;
}

/** `owner/repo` → 完整 HTTPS URL；已是 URL 则原样返回 */
export function toRepoUrl(repo: string): string {
  return repo.startsWith('http') ? repo : `https://github.com/${repo}`;
}

/**
 * 取依赖的上游仓库（`owner/repo` 或完整 URL）。
 * 调用方需要 URL 时再用 `toRepoUrl()` 转换——不要在这里提前拼域名，
 * 镜像改写只认 `https://github.com` 前缀。
 */
export function dependencyRepo(spec: DependencySpec): string {
  return spec.method.repo;
}

/**
 * 取依赖的 npm 包名。非 npm 通道返回空串。
 * 安装 / 查询版本 / 卸载都必须用同一个包名，否则「查到的」与「装上的」会分叉。
 */
export function dependencyPackageName(spec: DependencySpec): string {
  return spec.method.kind === 'npm-cli' ? spec.method.pkg : '';
}

/** 取依赖的最低可接受版本。`github-copy` 无此概念，返回空串 */
export function dependencyMinVersion(spec: DependencySpec): string {
  const { method } = spec;
  return method.kind === 'npm-cli' || method.kind === 'npx-skills' ? method.minVersion : '';
}

/**
 * 取安装超时（毫秒）。只有会跑外部进程的通道才有意义，其余返回 undefined。
 * 超时值随声明走，不在 installer 里散落魔法数字。
 */
export function dependencyTimeoutMs(spec: DependencySpec): number | undefined {
  const { method } = spec;
  return method.kind === 'npm-cli' || method.kind === 'npx-skills' ? method.timeoutMs : undefined;
}

/**
 * 取钉版本期望值，用于 `ref-marker` 比对与日志展示。
 * `track: 'default-branch'` 返回空串，表示「不校验具体版本」。
 */
export function pinExpectation(method: InstallMethod): string {
  if (method.kind !== 'github-copy') return '';
  const { pin } = method;
  if ('version' in pin) return pin.version;
  if ('commit' in pin) return pin.commit;
  return '';
}
