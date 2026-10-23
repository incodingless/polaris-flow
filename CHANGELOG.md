# Changelog

## What's Changed [0.4.0] - 2026-10-23

### Added

- **离线包自带使用者文档**: `package.sh` 从 `docs/releases/` 拷入 6 份成品到 `release/`——`安装手册-macOS.md`、`安装手册-Windows.md`、`安装手册-Windows.pdf`、`命令使用说明.md`、`使用帮助.md`、`使用者速查卡.pdf`。此前离线包只有安装介质，用户解压后没有任何「怎么装、怎么用」的说明，还得另外找文档。清单写死而非 glob，`release/` 里出现其它文档不会被自动带出去；任一文件缺失只告警不中断（PDF 是本地生成物，`.gitignore` 已排除，没有源文件的人打不出来）
- **`--zip` 改用 bsdtar 打标 UTF-8 文件名**: macOS 自带 Info-ZIP 3.0 写中文文件名时不设 UTF-8 flag（`0x800`），Windows 解压按本地代码页解释 → 六份文档名全成乱码。改用 bsdtar 的 `tar -a -cf` 后中文名正确带标（实测 707 个条目中非 ASCII 名全部置位）；非 bsdtar 环境回退到 `zip` 并告警
- **伴生 CLI 用户级安装通道（普通用户无需 sudo）**: 全局 npm 目录不可写时（如系统 node 的 `/usr`），OpenSpec / Codegraph 不再报 EACCES 并要求 root，改装到 `~/.polaris/cli`（`npm install -g --prefix`）。`resolveCliExecutable` 按 PATH → `~/.polaris/cli/bin` → pnpm 全局 bin 顺序定位，用户级目录不在 PATH 上也能直接按绝对路径执行；`openspec init` / `codegraph install` 的调用点同步改为使用解析出的绝对路径。init 结束时提示把 `~/.polaris/cli/bin` 加进 PATH（不加以不影响 polaris 内部调用）

### Changed

- **`polaris init` 拒绝以 root / sudo 运行**: `init` 会往项目目录写 `.polaris/` 与平台目录，以 root 运行后这些文件归属 root，普通用户既改不了文档也提交不了。检测 `process.getuid() === 0` 时直接拒绝并打印正确顺序（`sudo bash install.sh` 一次 + 普通用户 `polaris init`）与 `chown` 补救命令；容器 / CI 用 `POLARIS_ALLOW_ROOT=1` 放行
- **init 启动时检测 git 缺失**: 未检测到 git 时提示 Superpowers / 图表技能的在线通道不可用、将回落到 `~/.polaris/components` 本地副本，不再让用户在日志里自己猜为什么 clone 失败
- **`install.sh` 文案与预装清单对齐**: 结尾的预装建议从「只装 openspec」改为「openspec + codegraph 缺哪个列哪个」，并明确「sudo 只用于装 CLI，初始化项目必须由普通用户执行」；全局目录不可写的拒绝理由去掉已不成立的「init 会继续报 EACCES」，只保留 PATH 与 `polaris update` 两条
- **`install.ps1` 同步同一口径**（保持 UTF-8 BOM + CRLF）: 头部注释、全局目录不可写的拒绝理由、结尾预装提示同步改写；结尾从「只提示 openspec」升级为按缺失情况列出 openspec / codegraph 的可选预装命令，并加一句「初始化项目不要用管理员身份」
- **两份安装手册改准 sudo 分工**: `安装手册-macOS.md` 与 `安装手册-Windows.md` 删掉「`polaris init` 装 openspec 要写全局目录、所以必须 root」这个已失效的理由（保留 `polaris update` 升级本体与 PATH 两条真实理由）；新增「不要 sudo / 管理员身份跑 init」的醒目提示与 `chown` 补救命令；新增「伴生 CLI 落在 `~/.polaris/cli`」的落点说明与加 PATH 的一行命令；排障表补两条 root 归属相关现象

### Fixed

- **`npx skills add` 在非交互环境挂死**: 原命令 `npx skills add obra/superpowers -y` 的 `-y` 只传给了 skills CLI，npx 自己仍会停在 `Need to install the following packages: skills@1.7.4 / Ok to proceed? (y)` 等输入 —— CI、hook、管道里直接卡住（超时 300s 后 Superpowers 回退到 git 通道，git 又缺则整段失败）。改为 `npx --yes skills add ... -y`：`--yes` 给 npx 自动装包，`-y` 仍给 skills 跳过自身确认，两者缺一不可

### Tests

- **`cli-installer.test.ts`（新增 8 项）**: `buildNpmGlobalInstallArgs` 的 prefix 组装（无 prefix / 带 registry / 带 prefix / 空串忽略）；用户级 bin 路径固定为 `~/.polaris/cli/bin`；用户级绝对路径判定、PATH 裸命令名判定、PATH 提示文案
- **`init.test.ts`（新增 4 项）**: `evaluateRootGuard` 的四种组合——普通用户放行、Windows 无 `getuid` 放行、root 默认拦截、`POLARIS_ALLOW_ROOT=1` 放行
- **`superpowers.test.ts`（新增 1 项）**: `--yes` 必须在包名之前（`indexOf('--yes') < indexOf('skills')`），且 `-y` 仍独立存在、不是末位参数——防止再次把 npx 的自动确认与 skills 自身确认混为一谈

## What's Changed [0.3.0] - 2026-10-23

### Changed

- **概要设计（plan 的 `design.md`）产出「干练、重点突出」**: 六个规范让高层方案聚焦核心决策、不再平均用力——① 结论前置：开篇新增 `## 0. 核心结论`（核心架构决策清单 + 核心风险清单），决策与风险放最前；② 候选方案量化对比：`## 5.1` 强制 ≥2 方案 ×（性能 / 成本 / 复杂度 / 交付周期 / 运维门槛）5 维量化 + 推荐依据，未选方案附「背景 / 选型理由 / 取舍权衡」；③ 业务-技术映射：`### 4.12` 每个技术组件标业务场景 + 业务价值；④ 风险三件套：`### 4.11` 强制覆盖「过度设计 / 首版遗漏 / 最可能重构」；⑤ 粒度红线：禁表字段 / 具体错误码 / 方法名（`### 4.9` API 清单保留为「接口存在性契约」锚点）；⑥ 数据流闭环：`### 4.6` 必须含失败 / 降级 / 熔断分支。配套 Step 5.1 机械终检新增 5 项质量自检（不突破硬约束 / 无代码级细节 / 候选对比 / 风险三件套 / 业务映射）
- **详细设计（design 的 `detailed-design.md`）「锚定概设 + 闭环完整」**: 新增 `## 0. 继承锚点` 前置节——一行一条引用 plan 高层 `design.md` 已冻结的不可突破决策，不复制原文（守住唯一源）；接口契约补「重试策略」「超时时间」（`restful-api` 专项 + 约束 A8）；数据模型补「事务隔离级别」「数据一致性方案」「分库分表」（`data-model` 专项 + 约束 M8）
- **前置输入约束三层分列（specify 的 Premise Challenge）**: 6 类前提显式归为三层——硬约束（红线：算力 / 内存 / 并发 / 技术栈 / 合规 / 成本 / 周期，必覆盖）/ 判断输入（团队能力、现有系统基线，非红线）/ 优先级锚点（核心矛盾）；新增 `## 核心矛盾` 节（intention.md 的 Top3 全局主次，指导设计「抓核心、不平均用力」，流入 `design.md` `## 1. 概述`）
- **防幻觉溯源 + 责任边界标注**: 概要设计强制规则新增「技术特性 / 版本能力 / 性能数据标来源，禁『经测试满足』等未证实结论，拿不准标 TBD / 待核验」；两份设计模板正文首行标注「本文为 AI 生成初稿，标注『待人工核验』的项需人工确认」，区分 AI 填充与人工终审职责

### Fixed

- **`pnpm lint` 无法通过**: YAML 解析失败时把原始异常挂到 `cause` 上；去掉赋值后立刻被覆盖的初值、未引用的导入和从未调用的 `normalizedKeepAsIs`；技能相对路径正则去掉字符类里多余的 `\/`；终端可见宽度改为用码点构造 ESC，不再把控制字符写进正则字面量

## What's Changed [0.2.0] - 2026-10-22

### Added

- **附带技能：`archify` + `diagram-design`**: `polaris init` 会安装两个第三方图表技能到平台 skills 根目录（`.claude/skills/archify/`、`.claude/skills/diagram-design/`）。分工是「设计文档正文用 Mermaid、交付图用它们」——`archify` 出结构化图（架构 / 时序 / 数据流 / 生命周期 / ERD / 类图等 10 类，JSON IR + schema 校验，可做架构 delta 对比），`diagram-design` 出编辑级视觉图（13 类，三种视觉变体，能吃 Mermaid / drawio / Excalidraw 源码）。两者都输出自包含 HTML，可导 PNG/SVG/PDF。选它们而不是把图塞回设计文档，是因为 `design-review-agent` 只读文本：HTML 或 `.drawio` 里的图既进不了 PR diff，也不在评审视野内
- **安装通道与外部组件统一（GitHub 优先，本地兜底）**: 新增 `src/core/integrations/bundled-skills.ts`：`init` 先 `git clone --depth 1` 到 `~/.polaris/components/bundled-skills/`（已有副本则跳过），再把本地副本拷到各平台 skills 根目录。拉取失败或超时**只记 missing、不阻断 init**，本地已有副本照常安装；`POLARIS_BUNDLED_SKILLS_SOURCE` 可显式指定本地源（显式指定后不联网）。不接 `npx skills add`：它内部仍要 clone GitHub，等于同样的超时风险再付一次，且落盘目录由外部 CLI 决定（装错目录比装失败更糟）
- **版本一律钉死（可复现）**: `BUNDLED_SKILL_SPECS` 是升级上游版本的**唯一入口**——`archify` 钉 tag `3.2.0`，`diagram-design` 上游没有 release tag，钉 commit SHA。为此新增 `fetchRepoAtCommit()`：`git fetch --depth 1 origin <sha>` 后 checkout（`clone --branch` 不认 SHA）。同一 polaris 版本在任何机器、任何日期装到的技能内容一致
- **源统一收在 `devops/vendor/bundled-skills/`**: 与 `superpowers/` 同性质——本地后备副本，优先从上游下载，**不提交 git**（`.gitignore: devops/vendor/*`）。`package.sh` 打包时拷进 `release/components/bundled-skills/`，随离线包一并分发，`install.sh` 的 preseed 落到 `~/.polaris/components/` 后走同一条本地通道
- **`copyDirContents` 支持 `shouldCopy` 过滤**: 附带技能按目录整拷，同时用谓词过滤掉 `PROVENANCE.md` / `README.md` 与 `archify/examples/*.html`（15 个渲染成品，12MB；同目录 33 个 `.json` schema 示例保留）。不采用「拷完再删」——删除动作既多余，又会触发沙箱拦截
- **安装手册补充**: macOS / Windows 两份手册在 `polaris init` 一节说明这两个技能装在哪、为什么不在命令菜单里、以及网络失败时的提示
- **维护者升级工具 `devops/sync-bundled-skills.mjs`**: 检查模式对比钉值与上游最新（只读）；`--update` 一条命令改完三处——钉值、`vendor/` 整目录、`PROVENANCE.md`——拉取失败不留半成品。不做定时自动升级：技能升级会改变行为且无测试覆盖，是否升级由发版前人工决定
- **本地副本带版本标记 `.polaris-bundled-ref`**: 修复「装过一次就永不更新」——此前只以 `SKILL.md` 是否存在判断副本齐备，改钉值后老用户（含开发机）永远拿不到新版；现在标记与钉值不一致即视为缺失并重拉。标记本身不随安装下发
- **维护者入口 `devops/dev.sh`**: 一条命令看清「现在是什么状态、该按什么顺序做」。顶部状态区（分支 / 版本 / 未提交改动 / CHANGELOG 顶部是否与 `package.json` 一致），下接按「日常 / 发版」分组的命令菜单，编号可直接当参数用（`bash devops/dev.sh 5`）以便脚本化。**菜单不复制各脚本的参数**（参数归脚本自己的用法头部，`h <编号>` 现读），发版项会先跑前置检查（版本号未升 / CHANGELOG 不一致 / 工作区脏 → 要求二次确认）

### Tests

- `skills-install.test.ts` 新增 `bundled skills 安装` 用例组（fixture 源，不依赖真实技能）：落 skills 根目录且不进 `polaris/`、不注入 `policies/`、`PROVENANCE.md` 不下发、本地源缺失时跳过且不阻断安装、trae flat 布局下不被扁平化成 `polaris-archify`、版本标记与钉值不一致时判为缺失

### Fixed

- **附带技能拉取的目标 URL 拼错**: `fetchRepo` / `fetchRepoAtCommit` 期望完整 URL（镜像改写只对 `https://github.com` 前缀生效），此前传的是 `owner/repo`，导致 `git` 报「does not appear to be a git repository」且失败被吞成「没装上」。现统一拼成完整 URL
- **拉取失败原因被吞**: `ensureBundledSkillsSource` 原先只返回 `missing` 名单，`init` 只打印技能名，无法区分网络问题与配置问题；现额外返回 `errors`（每个技能一行原因），`init` 逐条打印
- **密钥扫描误拦 vendored 副本与工作记忆导致发布中断**: `devops/prepublish-check.js` 改为按相对路径整体跳过 `devops/vendor/`、`release/`、`.workbuddy/`。前者是第三方 vendored 副本（`.gitignore` 排除、不进 npm `files`），命中的是 `superpowers` 上游测试夹具里的假 token；`release/` 是 `package.sh` 的产物，内容就是 vendor 的副本，重复扫描只会放大同一批噪声；`.workbuddy/` 是 AI 工作记忆，按设计会记录「什么写法会命中密钥规则」，天然带 token 字面样例（`dev.sh` / `publish.sh` 的脏检查同样排除它）

### Removed

- **发布包内的非分发文件（60 个）**: `assets/` 整目录在 npm `files` 白名单内且无任何过滤，此前把内部资料一起发出去 —— 清掉 `assets/.workbuddy/memory/` 32 个（内部项目记忆，等于把仓库约定与历史决策随包发给每个用户）、`assets/tmp/skills/coding/{normal,tweak}/` 14 个（已弃用的技能旧版实现）、`assets/zh/skills/prototype/build/evals/.work/` 7 个与 `.proto-verify.*.html` 7 个（evals 测试残留）。包内文件 748 → 688、解压体积 5.02MB → 3.65MB；`.gitignore` 同步补四条规则（`assets/.workbuddy/`、`assets/tmp/`、`assets/**/evals/.work/`、`**/.proto-verify.*`）防复发

### Changed

- **`prd` 技能族防「篇幅膨胀 / 内容空洞 / 表述冗余」**: 需求文档生成此前只堵「空洞」（基线唯一来源 + 事实假设分离 + 锚点禁复制），不堵「冗余」（有而啰嗦）。本轮四层补齐：前置约束（读者定位「禁科普/禁铺垫」、文风负面清单、按复杂度三档的篇幅/条目上限 800/2000/4000 字）、过程管控（冗余自检「可无损删减 ≥20% 才达标」、极简主义者角色锚定）、后置精炼（refine 合并时全篇冗余扫描）、评审兜底（review 维度4「无模糊表述」扩充空泛词/铺垫句/同义重复）。落点 `assets/zh/skills/prd/` 的 draft / refine / review

> 技能判据侧改动按双语言约定，待英文同步后补记本 Changelog：
> - `design` 阶段：图表要求与主审 S3.5 / S4.1 / S4.7 / S1 判定口径。

## What's Changed [0.1.2] - 2026-10-13
### Added

- **内网分发改到 Nexus 3（Nexus 2.15.1 方案作废）**: 原 Nexus 2.15.1 没有 npm 仓库插件（`npm-hosted` 实为 maven2 provider），`npm publish` 只把 packument 存成单个 leaf 文件、tarball 从不落盘——表现为元数据 200 / `npm view` 正常，但 `npm install` 与 `npm pack` 全 404（连经它代理的 34 个公网依赖 tarball 也 404），且「packument 已占同名路径、建不出目录」形成死锁，据此弃用。分发改到 `http://192.168.103.96:8081/repository` 上的 **Nexus/3.90.1-01 (COMMUNITY)**，三仓：`npm-hosted`（发布）/ `npm-proxy`（代理 registry.npmjs.org）/ `npm-group`（聚合读）；**发布只能进 hosted，group 只读**。认证按 Nexus 3 口径：启用 `npm Bearer Token Realm` 后 `npm login --auth-type=legacy` 写 `_authToken`（默认 30 天过期，Community 版无 User Token 过期配置项），需要长期发布改用 Basic `_auth=base64(user:pass)`（永不过期，两种写法不可并存）；匿名读须给 `nx-anonymous` 加 `npm-group` 的 browse / read，否则使用者装包直接 `E401`。`install.sh` / `install.ps1` / `publish.sh` 的 registry 常量、发布指南与两份安装手册同步换新地址与新口径，`publish.sh` 增补 tarball 下载检查——发布后验收判据由「metadata 200」改为 **tarball 可直接下载 + 全新缓存 `npm pack` 通过**
- **npm 分发与一键安装**: 包名由 `@polaris/polaris-flow` 改为裸名 `polaris-flow`（npm 上未占用，用户安装命令更短，同时移除 scoped 专用的 `publishConfig`）；新增根目录 `install.sh`（校验 node ≥ 20 与 npm → 全局安装 → 引导 `polaris init`，兼容 macOS/Linux/Git Bash）；新增 GitHub Actions `publish.yml`
- **源码在 GitHub、分发走内网 Nexus**: 托管 runner 在公网访问不到 `192.168.103.96`，故发布动作改由内网机器手动执行（`npm publish --registry <npm-hosted>`），`publish.yml` 相应改为 `Release Check`——推 `v*` tag 只做构建 + 密钥扫描 + `npm pack --dry-run` 文件清单自检、**不发任何包**；公网 npm 发布降级为 `workflow_dispatch` 手动触发并须显式勾选 `publish_public`（默认 false，杜绝推 tag 误发公网）。双平台并存方案废弃：**删除 `.gitlab-ci.yml`**（`.github/workflows/publish.yml` 成为唯一 CI），发布指南同步删掉 GitLab 相关注脚，通道 A 的「以后每次发版」改为「推 tag 校验 → 内网 checkout 该 tag 手动发布」两步
- **安装手册**: 新增《安装手册》——使用者视角的完整安装文档（现按平台拆分为 `docs/安装手册-macOS.md` 与 `docs/安装手册-Windows.md`）：前置条件自查、脚本/npm 两种安装方式、`polaris init` + `doctor` 初始化、升级与卸载、常见安装故障排查表、GitHub 不通时的镜像配置指引（单源引用 README-zh）与发布前的源码安装附则
- **发布操作指南**: 新增 `docs/发布操作指南.md`——维护者发版手册。按**通道拆分**成篇：开头对比两条通道（Nexus / 公网 npmjs）并声明「选一条走完，不混读」；第一节为与 registry 无关的共用前置（升版本、写 Changelog、自检清单、提交）；第二、三节分别是通道 A（Nexus 3：三仓布局、一次性准备五步——启用 `npm Bearer Token Realm` / 建发布角色与账号 / 开匿名读 / `npm login --auth-type=legacy` 或 Basic `_auth` / 读链路验收，手动发布或 `publish.sh`、四条验证、专属报错）与通道 B（公网 npmjs：账号与 token、包名确认、registry 校验、手动或 Actions 勾选发布、验证、专属报错）的完整平行流程；第四节撤包处置按通道标注差异（公网 72 小时限制 vs Nexus 无时限）；第五节为双通道同时发布的顺序
- **state.yaml 孤儿键登记（cs-foundation 审计批③）**: `TaskRuntimeVerifyState` 补 9 个技能已写入但未登记的键（`risk_escalation_reason` / `codereview_status` / `codereview_report` / `build_command` / `test_command` / `test_result` / `test_slots` / `semantics_review` / `semantics_skip_reason`）；`TaskRuntimeBuildState` 补 `constitution_exception` / `override`；`state.example.yaml` 同步登记并改写顶层 `verify_mode` 注释（裁定为保留且必须写入：verify 定档时与 `runtime.verify.verify_mode` 成对写入，非废弃键）
- **三方一致性校验修复**: `scripts/check_state_yaml_three_way.py` 的 TS 类型映射缺 `tasks` 段（`TaskRuntimeTasksState` 从未被解析），补一行后校验从基线 2 处失配转为全绿；技能侧 runtime/workflow 引用 66+11 条全部命中模板 + 类型
- **手动发布脚本 `publish.sh`**: 把《发布操作指南》通道 A 的步骤固化成一条命令，七步检查链——环境（node ≥ 20 / npm / pnpm，缺 `node_modules` 自动 `pnpm install --frozen-lockfile`）→ `package.json` 与 `CHANGELOG` 顶部版本一致 → git 分支/tag/工作区脏（`.workbuddy/` 排除，避免 AI 记忆误报）→ **该版本是否已存在于 registry**（存在即拦截，防 Nexus Allow Redeploy 静默覆盖，`--force` 才放行）→ `~/.npmrc` 认证 → `npm pack --dry-run` 清单与关键路径 → `npm publish` → 发布后四条验证（hosted / group / 版本号 / tarball 可下载，各重试 3 次）。参数 `--dry-run`（只检查不发）/ `--yes` / `--allow-dirty` / `--force` / `--registry`；凭据不进脚本，只读 `~/.npmrc`。发布指南 A-2、A-3、第五节同步改为脚本优先、手工命令留作等价备用
- **Windows 安装支持（`install.ps1` + 手册分平台）**: 新增根目录 `install.ps1`——`install.sh` 的 PowerShell 等价物，校验 node ≥ 20 与 npm → 从 Nexus 安装 → 定位 `npm prefix -g` 下的 `polaris.cmd` 验证版本；支持 `-Registry` 参数与 `NPM_REGISTRY` 环境变量，缺省仍指向 `npm-group`。Windows 适配细节（①–③ 平台适配，④–⑥ 安装期行为）：① 优先用 `npm.cmd` 而非 `npm`（PowerShell 里 `npm` 解析到 `npm.ps1`，会被执行策略拦住报「无法加载文件」）；② 文件存为 **UTF-8 with BOM + CRLF**（否则 Windows PowerShell 5.1 按 ANSI 解析导致中文乱码）；③ 安装前探测 `bash`，缺失时**明确警告**「hook 与 verify 打分器会静默失效」并给出 Git for Windows 与 PATH 配置指引（bash 是硬依赖：`hooks.json` 模板与 `hooks.ts:62` 均硬编码 `bash "…"`，`doctor.ts:135` 也将 bash 列为必检项）。安装手册按平台**拆分为两份独立自包含文档**：`docs/安装手册-macOS.md`（覆盖 macOS / Linux）与 `docs/安装手册-Windows.md`，原 `docs/安装手册.md` 删除、发布指南的引用同步更新。两份各自完整走完流程：前置条件自查、Windows 执行策略两种解法（单次 `-ExecutionPolicy Bypass` vs `Set-ExecutionPolicy CurrentUser`）、脚本与 npm 命令（Windows 用 `npm.cmd`）、`init`/`doctor` 说明（含 Windows 重点看 bash 项与环境变量的 `$env:` / `setx` 两种设法）、升级卸载、平台专属排查表、源码安装附则。安装期另加三项：④ 装前探测 `npm prefix -g` 指向的全局目录是否可写（建临时文件判断，目录不存在则向上找最近已存在祖先再探），**不可写直接退出**并给「管理员 PowerShell 重跑 / 把前缀改回 `%APPDATA%\npm`」两条路，不做 `--prefix` 静默替代；⑤ 新增 `-DryRun`（等价 `POLARIS_DRY_RUN=1`）与失败原因分类（E401/E403、E404、ETIMEDOUT、EPERM）；⑥ 装完若 `openspec` 缺失，直接给出安装命令。手册同步新增「需要管理员权限吗」判据小节（默认 `%APPDATA%\npm` 属当前用户 ⇒ 无需管理员；前缀指向 `C:\Program Files` 才需要）

### Fixed

- **hook 提示语不再写 /dev/tty**: `_polaris-cli.sh` 的 `_polaris_cli_tty` 原本优先向 `/dev/tty` 直写「polaris-flow CLI not found」等提示（宿主吞 stderr 时保证用户可见），但终端环境跑集成测试时子进程继承控制终端，消息绕过 stdout/stderr 导致 `session-start-sh.integration` 断言空字符串——两类场景无法区分。改为恒写 stderr（函数更名 `_polaris_cli_msg`），与测试契约一致、行为可测
- **`constitution_compliance` 模板值域对齐**: `state.example.yaml` 原注释声明 `true|false`，与 verify 技能实际写入的 `pass|violations:<N>|skipped:<reason>` 冲突（后者才能承载「文件缺失 + 用户批准跳过」的显式语义，与 build 段 `constitution_exception` 口径一致）——模板注释改为按实际值域声明

> 技能侧写点（`assets/zh/skills/coding/**` 的 workflow 全局字段同步、升降档留痕、plan 主审嵌套块等，见 `docs/plans/2026-10-20-zh-skills-state-audit-cs-foundation.md` §4 批②③）按双语言约定，待英文同步后补记本 Changelog。

### Changed

- **安装只支持全局安装（用户级 fallback 撤回）**: `install.sh` 原本在系统全局目录不可写时自动改装到 `~/.npm-global` 并把该目录写进 shell 启动文件，实测普通用户装完后 `polaris` 未能注册上 PATH；即使 PATH 修好，`polaris init` 装 openspec（`openspec.ts` 的 `ensureOpenSpecCli` 失败只返回 `failed`、不抛异常，降级继续）、`polaris update` 自升级（`self-update.ts:95`）、codegraph 安装（`codegraph.ts:72`）仍要写全局目录，等于得到一个只跑得起 `--version` 的残件，故该设计被否。现在：全局目录不可写 → **直接 `exit 1`**，只给 `sudo` 一条路；`--user-prefix` / `POLARIS_NPM_PREFIX` / `ensure_in_path` 整段删除，脚本**不写任何 shell 配置文件**（零副作用）；旧参数 `--user-prefix` / `--prefix` 报 exit 2。`install.ps1` 沿用同一原则，判据落地为「npm 全局前缀可写」（Windows 默认 `%APPDATA%\npm` 本属当前用户 ⇒ 不需要管理员）。两份安装手册同步改写安装方式 A/B、升级卸载命令与 `EACCES` 排查行，并新增「Linux 必须 sudo / Windows 何时需要管理员」的判据说明
- **`task-entry` 原语**: 新增 `polaris-flow task-entry --kind coding --as <技能> --mode <档>`，一次调用返回 `resume` / `handover` / `create` / `select` / `resolve-drafts` / `block` —— 把「选任务 → 判阶段 →（必要时）建任务」收敛成一条命令，判定全部留在代码里；新建时一步完成建目录 + 写 `workflow.mode` + 注册游标。`--mode` **只在新建时被写入**，判定阶段一律用任务**自己** `state.yaml` 里的值（工作流不被入口假设）
- **共享 policy `assets/zh/policies/task-entry.md`**: coding 三入口技能共用的「进入任务」流程。含刻意不放进命令的破坏性 / 需裁决分支（§5：孤儿 draft 的 A/B/C/D、「丢弃并新建」）。⚠️ **2026-10-14 已改**：执行层不再调用该原语 ⇒ 该文档**移入 `coding/intake/policies/` 成为 `intake` 私有细则**（随技能安装，不再注入其它技能）
- **候选列表的中文显示名**: `get-active-changes --format full` 每行新增 `phase_label` / `mode_label` / `skill_label`；中文名由 `phaseLabel` / `modeLabel` / `skillLabel` 从**既有阶段表与工作流表**派生（不新增任何映射表），技能只负责拼成 `中文(英文)`。取不到时为空串，显示层退回只显英文 —— 不猜
- **`append-active` 幂等**: 同一 `task_id` 已在列表里 → 视为成功且**不改动**已有条目。入口技能的「新建」与「采纳孤儿 draft」两条路因此可以**无条件**注册，不再需要「仅 `status=ok` 才执行」这类分支条件
- **`buildDispatchRow` 导出**: `--format full` 的单行构造从 `runGetActiveChanges` 抽出，供 `task-entry` 复用，避免第二份「运行态形状」
- **新建任务前校验 git 版本管理**: `task-entry` 的 `create` 出口在写目录前先确认项目已纳入 git（`git rev-parse --show-toplevel`），未纳入时 exit 3 并提示先 `git init` —— `.polaris/tasks/<id>` 产物需随仓走，无版本管理会让后续 ship / 归档找不到版本边界

### Changed

- **`tweak` 的 Step 0 从 154 行压到 23 行**: 编排段改为「引用共享 policy + 一条命令 + 按 `action` 分派」，`mode` 由调用方传入（`--mode tweak`）而非技能自己写死；`resolve-drafts` 与「丢弃并新建」两组分支移入 policy，技能不再各存一份
- **入口技能的两层重排**: `specify` / `normal` / `tweak` 把「选任务」与「判阶段」显式分层 —— 第一层只枚举游标、选出**一个** `task_id`（零个走创建流程），**不做**丢弃 / 新建；第二层只判「读得到吗 → 是不是本技能」
- **判定顺序与出口全族统一**: `plan` / `build` / `design` / `tasks` / `verify` / `ship` / `intake` 的 Step 0 统一为「**先判 `state_readable`、再判 `skill`**」，并补上 `skill=null`（旁路阶段 `retro` / 表外未登记阶段）的**阻断**出口 —— 此前这种行会落进「转交」分支去加载一个不存在的技能名
- **技能 Step 0/1 的写法向 `specify` 收口**: 候选呈现改为单行 `<task_id> (工作流：…，阶段：…，技能：…)`；判定项收敛为「`state_readable` → `skill`」两行；理由段降为 `<!-- -->` 注释；入口技能的「续写 / 丢弃并新建 / 取消」改用**字面标签**，不再与创建流程的 A/B/C/D 撞字母
- **术语统一：`workflow.mode` 的中文名统一为「工作流」**: 同一字段此前有两个名字（技能正文用「通道」、候选列表用「工作流」）。现把指代 `workflow.mode` 的 26 个文件统一为「工作流」（含 `快速工作流` / `常规工作流` / `工作流技能` / `工作流迁移` / `注册与工作流` 等）。**debug 族的 `channel` 与 SonarQube 的「探测通道」保持原词** —— 它们是另外两个概念，不参与本次统一
- **阶段只有一个存放处**: `.polaris/workflow.yaml` 的条目**不再承载 `phase`**，收敛为 `task_id` / `worktree_path` / `started_at` / `channel` —— 它只回答「有哪些在途任务」与「任务在哪」；阶段（顶层 `phase`）只存在于任务自己的 `.polaris/tasks/<id>/state.yaml`。读取位置由条目 `worktree_path` 决定（空 = 主仓；非空 = worktree 内同名路径），新增 `resolveTaskStatePath` 作为唯一解析入口
- **恢复分发改读 state.yaml**: `workflow-entry get-active-changes --format full` 的 `phase` 与 `mode` 现在同出一个文件，行结构新增 `state_path`（定位结果，便于排查）与 `state_readable`；`--phase` 过滤改为按各任务 state.yaml 的阶段过滤（默认 `ids` 格式仍不读 state.yaml，保持低成本）
- **阶段推进只走一个原语**: 所有技能的游标 phase 写入（`update-active --set phase=` / `append-active --phase=`）删除，阶段推进统一由 `task-state-entry enter-phase / complete-phase --next-phase` 完成
- **`tweak` / `normal` 的阶段语义与全链路统一**: 进入实施阶段不再写顶层 `phase: build`（进行中的事实由 `runtime.build.status` 承载）；顶层 `phase` 只承载「下一步该谁接手」，三条工作流自此同义
- **工作流名 `full` 更名为 `strict`**: 旧名与 `verify_mode` 的取值 `full` **同名不同义** —— 同一份 `state.yaml` 里两个 `full` 指向不同维度。新名描述真实特征（端到端全走、门禁不跳步），中文名由「完整」改为「严格」。写入侧白名单不含 `full`，误写会被 `task-entry` 以「未知工作流」拒绝。⚠️ **本条已修订**（2026-10-14）：初版曾写"存量数据无需迁移、读取侧归一"，但 `WORKFLOW_MODE_ALIASES` 与 `PHASE_ALIASES` **随后被删除** ⇒ `normalizePhase` / `normalizeMode` 已退化为纯 trim，**存量 `state.yaml` 写 `full` / `delivery` 不再被识别**
- **`polaris update` 第三方依赖按版本跳过重复安装**: openspec / superpowers / codegraph 安装前先探测「已装版本 vs 上游最新版本」，无更新时回显「已是最新 —— 跳过重复安装」并跳过（`--force` 仍强制重装）；codegraph 版本补记入 `skills-lock.json` 的 `sources`，与 openspec / superpowers 一致
- **`task-init` 回填仓库根与安装信息**: coding 任务 `state.yaml` 初始化时从项目 `.polaris/config.yaml` 回填 `main_repo_root` / `worktree_dir` / `install_time` —— 此前模板占位符 `<project_root>` 与样例安装时间原样落盘，任务全程无人修正，跨仓 / 归档消费时指向不存在的路径
- **阶段开始时间键名统一为 `started_at`**: `state.example.yaml` 与任务 state 类型此前声明 `start_time`，而 `task-state-entry enter-phase` 自脚本接管 state 写入起一直是 `started_at` —— 两条官方路径键名互相不一致，导致 specify 之后各阶段 `start_time` 恒空、真实时间落在类型之外。现模板 / 类型 / coding initPatches 全部对齐 `started_at`（与 requirement / testcase / debug 家族 initPatches 同名），存量 state 不做迁移

### Fixed

- **项目选择弹框「失效」徽章样式块未闭合**: `.badge--stale` 少写结束括号，后续项目操作按钮规则被吞进该块，Vite 压缩 CSS 时报 `Expected "}" to go with "{"`
- **入口技能采纳孤儿 draft 后永远进不了游标**: `task-init` 报 `status="existing"` 时选「继续最近 / 选择一个」的两条路都跳过注册，而它采纳的恰恰是**游标里没有**的 draft（这正是它成为孤儿的原因）。后果是该任务既无法被其它技能发现，还会在 `finalize` 的 `rename-active` 处以 exit 3 阻断，且每次重进命令都会再问一遍。现由 `append-active` 幂等 + 无条件注册修掉
- **采纳时工作流写入被跳过**: 同一分支此前一并跳过 `workflow.mode` 覆盖，会让任务停在模板默认的 `normal`（`tweak` 任务被当成常规工作流）。现与注册一并无条件执行
- **worktree 任务的阶段与工作流读错文件**: `--format full` 原先一律从主仓路径读 `state.yaml`，而任务目录被 `worktree-create` 搬进 worktree 后（主仓副本改名为 `<id>.snapshot`）该路径并不存在 —— `mode` 读成空串会让 `normal` / `tweak` 任务被误派给 `plan` / `specify` 技能，工作流丢失。现按条目的 `worktree_path` 定位
- **阶段白名单校验缺口收敛**: 原先绕过 `checkPhaseWrite` 的 5 处 `task-state-entry set --set phase=X` 改为 `complete-phase --next-phase`，阶段写入不再有第二条路径
- **入口技能的在途任务判定漏掉「恰好 1 个」**: `specify` / `normal` / `tweak` 的判定表把「长度」与「每行 skill」两个维度混在一张表里，单任务时只能靠猜；现统一为 `零个 / 唯一 / 多个` 三段
- **state.yaml 读不到时的静默降级**: 新增 `state_readable` 标记并写入各技能 Step 0 —— 该行**被选中时**才阻断（把 `state_path` 交给用户人工确认），不得当成「零个」新建

### Tests

- `task-entry.test.ts`（新增，13 项）：`create` 的落盘与注册、`create → resume` 链路闭合、六出口（`resume` / `handover` / `select` / `resolve-drafts` / `block`）判定、`--task-id` 直判、四类参数错误
- `task-entry.test.ts`：`tmpRepo` 改为先 `git init`（匹配新增的 git 前置校验）；新增「无 `.git` → exit 3 提示 `git init`，且不建目录 / 不注册游标」用例
- `workflow-entry.test.ts`：新增 worktree 任务按 `worktree_path` 读阶段（含 `state_path` 断言）、`state_readable=false` 时 `skill` 为 `null`、条目不含 `phase`、中文标签三类回归
- `state-next.test.ts`：新增「state.yaml 读不到 → `NEXT: done`」与「worktree 任务从 worktree 内解析」用例；全部用例的阶段改为写入 state.yaml
- `dashboard-scan.test.ts` / `dashboard-write.test.ts` / `delivery-cleanup.test.ts`：阶段来源改为 state.yaml 的断言改写；面板「推进阶段」改为写 `state.yaml` 并新增"state 缺失即拒绝"用例
- `update-deps-version.test.ts`（新增，7 项）：`isConcreteVersion` 识别 semver / 拒绝 `local`·`HEAD`·`npx-latest` 占位符；`hasNoVersionUpdate` 的相等、已装更新、有更新、版本缺失、不可比五类边界

## What's Changed [0.1.1] - 2026-08-04

### Added

- **测试用例设计命令**: 新增 `assets/zh/commands/testing/create-testcase.md`（→ `/polaris:testing:create-testcase`，testing 分类子目录），交出到 `testing:discovery`，用于启动测试用例设计工作流（澄清测试意图 → 编写用例集 → 完善与独立评审 → 准出交付）。前置为定稿 PRD 且含验收标准，缺失时提示先走 R02 / T02
- **验收标准编写命令**: 新增 `assets/zh/commands/testing/acceptance.md`（→ `/polaris:testing:acceptance`），交出到 `testing:acceptance`（同 flow 菜单 T02），用于把需求条目转换为 GWT 可判定验收标准（需求条目拆解 → 按场景编写 → 可验证性自检 → 输出清单）。前置为需求条目 / 功能点清单（PRD / 需求基线路径或口述功能点），缺失时阻断并提示先走 R02；flow.md T02 路由行、使用指南场景表与详情节、README-zh 同步该入口
- **需求族族级命令 `polaris:prd`**: `assets/zh/commands/prd/discovery.md` **迁移**为 `assets/zh/commands/prd.md`（→ `/polaris:prd`），交出到 `prd:discovery`。原分类子目录文件不再落盘，`prd/` 下只保留 `readiness.md`——与 prototype 族的「族级命令 + 同族子命令」结构对称。命令正文补注同族另一入口 `/polaris:prd:readiness`，并说明 R01 编写用户需求（`prd:userstory`）技能尚未提供、需要时可直接从原始描述起步
- **原型族独立入口命令**: 新增 `assets/zh/commands/prototype.md`（→ `/polaris:prototype`）与 `assets/zh/commands/prototype/review.md`（→ `/polaris:prototype:review`），分别交出到 `prototype:blueprint` 与 `prototype:review`。此前原型族 4 个技能只有 2 个命令入口、且都藏在 `/polaris:flow` 菜单后，用户想「改几个页面」或「单独把关一次」没有直达路径。`build` 刻意不给独立入口（返工诉求由链内流转承接）；`review` 命令标注必需输入（原型 `.html`，缺失阻断）与降级输入（需求文档 E1 / 已确认蓝图 E2，缺失不阻断但结论降级），**不写「基于需求」**，以免误导出「无需求文档即不可用」的结论
- **CLI 双入口分流**: `polaris` 仅暴露用户生命周期命令（init / status / dashboard / doctor / update / uninstall）；hooks/scripts 所用命令（workflow-entry、task-state-entry、worktree-* 等）仅挂在 `polaris-flow`；`uninstall` 仍为入口占位（尚未实现）
- **polaris dashboard**: 用户面单命令入口（`init` / `status` / `dashboard` / `doctor` / `update` / `uninstall` 六条生命周期命令之一）。**注**：本条原先描述的是「实现在同级 `polaris-web`、本仓只留启动器」的形态，该形态已在同版本内被下方「Dashboard 并入本仓 / 单进程单端口」取代 —— 保留此条仅说明命令归属，形态以 M1/M2 条目为准
- **hotfix-branch-create / git-branch-merge**: 核心模块 `git-branch.ts`（原 hotfix-branch）；`polaris hotfix-branch-create` 基于主干建 `hotfix/<issue_id>`；新增 `polaris git-branch-merge` / `scripts/git-branch-merge.sh` 将指定分支以 `merge --no-ff` 合入主干（脏检查、冲突 abort、源分支保留）；`diagnose` Step 3.1.B / `closeout` 生产收尾分别调用创建与合并脚本
- **worktree-commit-remove**: 新增 `polaris worktree-commit-remove` / `scripts/worktree-commit-remove.sh`：在 worktree 内 `add -A`+`commit`（已干净则跳过），再 `git worktree remove`；`closeout` 测试通道 worktree 收尾改调该脚本
- **init Superpowers 网络逃逸**: 支持 `POLARIS_GITHUB_MIRROR` 改写 clone URL、`POLARIS_SUPERPOWERS_PATH` 本地目录安装；git 默认 `HTTP/1.1` 以规避 HTTP/2 framing 失败
- **init 物化 docs/tasks 目录**: `initializePolarisCommonLayout` 按 `config.example.yaml` 的 layout 创建 `.polaris/tasks`、`openspec`、`docs/{prd,prototype,architecture,design,testcases}`；`generatePolarisConfig` 继续将 `layout.tasks.root` / `layout.docs.root` 写成项目绝对路径，docs 子键保持相对名
- **SessionStart subagent agents 缓存**: SessionStart 按宿主 `platformId` 扫描项目级 agents（算法对齐 `platform-probe.md`），写入 `.polaris/.cache/subagent-probe.json`（与 `subagent-probe` 输出同构），并注入 `SUBAGENT_PROBE_CACHE`；core `scanSubagents` / `buildSubagentProbeSnapshot`；probe 契约改为优先读该缓存再做 `task_type`/`subagent_id` 过滤
- **SessionStart subagent 能力注入**: SessionStart 按宿主 `platformId` 解析并注入 `SUPPORTS_SUBAGENT` / `PLATFORM_DEGRADATION`（与路径变量同渠道：additionalContext / Cursor env / `runtime-env` / `CLAUDE_ENV_FILE`）；能力来自 `Platform.supportsSubagent`；编排在仅用默认通用 Agent 时可跳过空转 probe
- **task-state-entry**: 新增 `polaris task-state-entry` / `scripts/task-state-entry.sh`，对 `.polaris/tasks/<id>/state.yaml` 做持锁 RMW；支持 `get`/`get-json`/`set`、`enter-phase`/`complete-phase`、`set-identity`/`get-identity`（身份字段均为顶层键，无 `naming` 块）；coding 走 `runtime.<phase>`，prd/prototype 走顶层阶段块
- **workflow `--kind prototype`**: `workflow.yaml` 新增 `prototype_tasks` 列表；`workflow-entry` / `task-init` / `draft-create` / `state next` / `status` 接受 `--kind prototype`（对齐 blueprint/build/ship 脚本调用）；原型任务不建 draft，须 `--task-id` 直建 `.polaris/tasks/<id>/`，初始 phase=`blueprint`
- **manifest ignoredFiles**: `assets/manifest.json` 的 `ignoredFiles` 在 `readAssets` 收集阶段生效；支持精确路径、`dir/name` 目录树同名、以及纯 basename（默认 `README.md` / `.DS_Store`）；skills 安装另有同名兜底跳过
- **polaris-flow 功能入口命令**: 新增 `assets/zh/commands/polaris-flow.md` 作为统一入口，让用户先选再做而非直接开工——按 `.polaris/config.yaml` 的 `platform` 查询问工具注册表确定工具名（不写死 `AskUserQuestion`），依次单选「功能类别（开发/维护/需求/测试）→ 具体功能（共 11 项）」，再收集附加上下文（文件/目录/文字说明），最后按选择路由到对应入口技能；命令本身只做选择与路由，不产出任何需求、设计、代码或测试产物
- **命令资产 `{{SKN_SPR}}` 展开**: `installPolarisCommandsForPlatform` 新增 `skillsLayout` 参数，落盘时把命令正文的 `{{SKN_SPR}}` 展开为 `:`（nested）或 `-`（flat），使命令内引用的技能名与落盘技能名一致；此前命令文件原样拷贝，跨布局必然引用失效
- **命令文件分步写出**: `install/commands.ts` 新增 `writeCommandFile`，按文件粒度处理 overwrite 跳过与占位符替换，替换 `runCopyJobs` 的整批拷贝
- **config get CLI**: 新增 `polaris-flow config get language [path]`，读取 `.polaris/config.yaml` 的 `language`（支持 `--json` 输出 `language_name`）
- **get-language-name.sh**: 共享脚本 `assets/shared/scripts/get-language-name.sh`，调用 `config get` 并将 `en`/`zh` 翻译为显示名称（English/中文），init 后位于 `PLUGIN_ROOT/scripts/`
- **SessionStart 路径注入**: core `runSessionStart` 返回 `paths`（repoRoot / platformId / pluginRoot）；commands 映射为 `PLUGIN_ROOT` 等，经 `additionalContext` / Cursor `env` / `CLAUDE_ENV_FILE` / `.polaris/.cache/runtime-env` 注入会话
- **宿主 hook stdout 协议**: 分发器按平台序列化 JSON（Claude/Trae `hookSpecificOutput`，Cursor `additional_context`/`env`）；过程日志改走 TTY，避免污染宿主 stdout
- **宿主 hook stdin 归一**: Claude/Cursor/Trae 字段别名与事件判别联合；`HostHookHandler` 为分发器（读 stdin / 写 stdout / 按 event 派发），事件实现为 `HostHookEventHandler`；宿主 `.sh` 统一 `polaris-flow host-hook`
- **工作流 hooks 调用说明**: 新增 `docs/workflow-hooks-call-order.md`，按 clarify→delivery 梳理 hooks 调用顺序、作用、内部依赖与命名债
- **平台安装布局**: 按平台 `skillsLayout`（nested / flat）将 polaris 资产装到正确目标目录；flat 叶技能为 `polaris-<family>-<skill>/`，nested 进 `skills/polaris/{family}/`
- **包内公共内容安装**: init/update 同步安装 adapters、policies、templates、hooks、scripts 到插件根
- **agents 安装**: 将 `assets/<lang>/agents/` 下评审 agent（含 `propose-review-agent`、`design-review-agent`、`plan-review-agent`、`openspec-review-agent`）写入 `.<platform>/agents/`；session-start 注入 `challenger.model`
- **outside-voice 协议与模板**: `policies/outside-voice.md`、`templates/outside-voice-prompt.tmpl.md`
- **propose 主审**: 新增 `propose-review-agent`；`polaris-flow-propose` Step 4.6 派发主审 + 询问 Outside Voice
- **Dashboard 并入本仓**: `polaris-web`（Vue 3 + Vite 前端）与 `polaris-cli` 的 Dashboard API 一并并入；前端落仓库根 `dashboard/`、API 落 `src/dashboard/`，两源仓退役。迁移由 `scripts/migrate-dashboard.js` 以复制方式完成（白名单驱动、源仓只读、默认预演）
- **polaris dashboard 单进程单端口**: 同一端口同时提供 `/api/*` 与前端静态资源（`dist/web/`），就绪后自动打开浏览器；新增 `--api-only` 供前端 HMR 开发、`--no-open` 关闭自动打开。`build.js` 在 tsc 之后追加 vite 步骤，前端产物与后端编译产物同级不混层
- **Dashboard API 契约**: 新增 `docs/specs/2026-09-18-dashboard-api-contract.md` 冻结 `/api/*` 的端点、字段名、错误形状与只读性 —— 前端纯 JS、后端 TS，无共享类型，契约是唯一形式化保证
- **任务类型布局表补阶段与产物**: `src/core/config/task-kind-layout.ts` 新增 `phases` / `artifacts` 与 `getKindPhases` / `getKindGroups` / `phaseGroupOf` / `phaseIndexIn` / `isKnownPhase` / `getKindArtifacts` / `getKindLabel`。「kind → 阶段」自此有单一真相，Dashboard 不再依赖任何 YAML 流程定义
- **Dashboard 扫描层**: 新增 `src/dashboard/scan/`（游标 / 运行态 / 文件树三个扫描器）。归档扫描覆盖两个落点 —— `.polaris/archive/`（含 prototype 嵌套）与 `docs/troubleshooting/`（debug 族）
- **phase 真相归一设计**: 新增 `docs/specs/2026-09-19-phase-truth-unification-design.md`，查实「phase 权威是 workflow.yaml 游标而非 state.yaml.phase」并列出去重方案与待决项
- **M3 写操作实施计划**: 新增 `docs/plans/2026-09-19-dashboard-integration-m3.md`（8 个 task、决策台账 D4/D17–D21、逐条带行号的事实核对）
- **`task-state-entry set-checkbox` 原语**: 勾选 `tasks.md` 的一行，持 `task-state-<id>.lock`，并在**同一次锁内**同步 `state.yaml` 的 `runtime.build.{total_tasks,completed_tasks}`；只替换目标行的复选框字符，缩进/正文/CRLF 逐字节保留；幂等。序号取「第几个复选框」而非行号
- **`src/core/hooks/tasks-checkbox.ts`**: 复选框的规则与编辑收敛为一份（`CHECKBOX_LINE_RE` / `countCheckboxes` / `applySetCheckbox`），读取方（`scan/files.ts`）与写入方共用，消除两侧各自推导导致的静默错位
- **Dashboard 三个写端点**: `POST /api/tasks/:id/checkbox`、`POST /api/tasks/:id/phase`、`POST /api/tasks/:id/cleanup`（均转调 CLI 原语并持 `.locks/`，`src/dashboard/` 自身不写项目文件）
- **`GET /api/tasks/:id/plan-lint`**: 只读校验任务计划文件，转调本仓 `tasks-lint`；`pass: null` 表示「没有可校验的计划文件」而非失败
- **`planDeliveryCleanup` 预演**: 交付清理前先算出将删除的路径与将移除的游标条目
- **`ProjectView`（含 `stale` / `reason`）**: 项目注册表条目叠加运行期判定，每次读时算、不落盘
- **phase 写入校验**: 新增 `src/core/hooks/phase-validation.ts`。`workflow-entry`（`update-active --set phase=`、`append-active --phase=`）与 `task-state-entry`（`enter-phase` / `complete-phase` 的 `--phase` / `--next-phase`）写入前校验合法性，非法值以退出码 3 中止并打印合法集合；校验发生在**取锁之前**。`--force-phase` 是唯一绕过口，且**不静默** —— 记入 `.polaris/overrides.log`（时间/op/kind/task/skill/写入值/当时合法集合）
- **`skillForPhase` 与写入白名单**: `src/core/config/task-kind-layout.ts` 的阶段表新增 `skill` 字段（缺省 = 同名；显式 `null` = 无自动衔接，三处例外逐条登记），并导出 `skillForPhase` / `normalizePhase` / `isWritablePhase` / `writablePhaseList`。「阶段 → 技能」自此只有一份真相
- **`polaris update` 三层可范围更新**: 原命令只重拷 Polaris bundled 资产 —— 程序本体仅打印升级提示、OpenSpec / Superpowers / Codegraph 完全不碰。现拆为可独立选择的 `program`（npm 包）/ `assets`（skills·commands·agents·rules·hooks）/ `deps`（openspec·superpowers·codegraph）三层，CLI 新增 `--only` / `--skip`（组名 `assets` / `deps` / `all` 展开为成员）；单层失败不拖累其它层
- **程序本体自更新**: 新增 `src/core/deps/self-update.ts`，探测用户实际使用的包管理器（先读 `npm_config_user_agent`，再按本包安装路径特征回退）后执行全局安装 `@polaris/polaris-flow@latest`；`npx` / `bunx` 临时执行场景下全局本无该包，降级为只提示以免留下意外全局包；registry 不可达单独成一档状态。不做「下载 tarball 覆盖 `dist/`」式自替换 —— 重复实现包管理器已有能力，且跨平台与权限成本高
- **资产源指纹门控**: 新增 `src/core/update/fingerprint.ts`，按平台、按类别对「该类别会写出的源文件内容 + 影响落盘的布局 / config 输入（`skillsLayout`、`commandLayout`、`agentToolMap`、模型槽位、`rulesFormat`、`hookFormat`、`scope`）」求 sha256，写入 `.polaris/skills-lock.json` 的 `assets`；取代原 `manifest.version` 与 `.polaris/installed-version` 的比对 —— 版本号并不代表内容是否变化
- **托管文件清理 `--prune`**: 新增 `src/core/update/prune.ts`，删除 Polaris 独占命名空间内已不在当前资产清单的陈旧产物（nested 走整棵 `<ctx>/skills/polaris` 与 `<ctx>/commands/polaris`；flat 走 `polaris-*` 条目），并清掉因此变空的目录。agents / rules / hooks 与用户自有内容共用目录，无法在不误删的前提下判定归属，**刻意不参与清理**。安装器改为回传落盘文件清单（`CopyStats.files` 与 `PolarisInstallResult.installedFiles`），清理因此无需重新推导落盘路径
- **`skills-lock.json` 成为安装状态唯一来源**: `LockFile` 新增 `assets`（各平台各类别指纹）与 `updatedAt`；新增 `readLockFile` / `saveLockFile` / `getSkillsLockPath`，`writeLockFile` 保留供 init 使用并可携带指纹
- **install 内核支持按类别执行**: `installPolarisForPlatform` 新增 `options.only` / `options.overwriteHooks`（缺省全类别、跟随 `overwrite`，init 行为不变）
- **Codegraph CLI 可升级**: `ensureCodegraphCli` 新增 `upgrade` 参数、`installCodegraph` 新增 `upgradeCli`；`polaris update` 传 true 时已装 CLI 也重新拉 `@latest`，但已有 `.codegraph` 索引时不重建（重建代价高）
- **维护组编号统一为 M01 / M02 / M11 / M12**: `flow.md` 中 7 处旧编号 M03 / M04 残留全部更正（HARD-STOP #11、执行状态枚举、零步触发条件、测试场景映射、别名映射 M11/M12 等）；`policies/hard-stops.md` H14 规则与自检话术同步；`docs/command-usage-guide.md` 场景表与 FAQ 的 M02/M03 旧编号更正——测试缺陷修复入口现编号为 M02，代码评审为 M11、重构为 M12
- **testcase 命令定名 `create-testcase`**: `assets/zh/commands/testing/create-testcase.md` 的实际安装命令为 `/polaris:testing:create-testcase`（命令名由文件路径决定），frontmatter `name`/`trigger` 与文件名对齐为 `create-testcase`，`flow.md` T01 行、README-zh、usage-guide 与安装测试同步更正
- **flow.md 内部矛盾修复**: 快捷路径示例「编号如 P02」更正为 C02（P02 在本文件菜单中是评审原型）；retro 适用范围「P01/P02/P03」更正为 C01/C02/C03；零步范围自相矛盾消除——P01–P02（原型）从「需求内容必须非空」清单移除，与「P01–P02 不进零步」对齐；R02 前置更正为「无硬前置：原始需求即可起步」（与 prd.md 命令及 prd/discovery 技能口径一致，原「需先执行 R01」在 R01 不可用时构成永久阻断）；sdd 命令链尾口径对齐 flow.md（retro 移出阶段链，注明可选不占游标）；tweak / normal / sdd 命令描述去除 brainstorming 等遗留词并改用菜单 C 编号
- **技能侧清除菜单编号引用**: 落实「菜单编号只存在于命令层」的编号边界约定（已写入 AGENTS.md）——coding 族 4 个 SKILL.md（normal / tweak / ship / plan）、8 个 policies / templates、`skills/README.md` 共约 56 处 P01/P02/P03 全部改为模式名（tweak / normal / 完整链路）或技能名，消除技能对菜单重编号的耦合（M 组重编号曾泄漏污染 13 个技能文件）；状态值 `outside_voice: not_run:p02-compressed` 更名为 `not_run:normal-compressed`（无代码消费方）；`ship` 内部流程概念「P01 快速通道」更名为「tweak 快速通道」（与 `workflow.mode=tweak` 对齐）；豁免 `prototype/blueprint` 的 Page ID 前缀（`<前缀>-P01`，原型页面编号体系，与菜单编号无关）
- **coding 工作流技能流程图文档**: 新增 `docs/architecture/coding-workflow-flows.md` —— 以 13 张 Mermaid 分图 + 5 张对照表描述 coding 族 10 个技能的组织与流转。总览层：三条通道（tweak / normal / 完整链路）与双向升降档门、完整链路阶段-技能-产物-游标对照。技能层：`tweak`、`normal` 及完整链路 8 个技能（`specify` / `plan` / `design` / `tasks` / `build` / `verify` / `ship` / `retro`）各自的内部 Step 流，逐个标出人工确认阻塞点、决策分支与出口转交（含 `plan` 的 design / tasks 双出口、`retro` 的旁路口径）。附：`verify` 三段验证轨道与 `verify_mode` / `review_mode` / `build_mode` / `risk_level` 取值、阻塞点总览、游标写入点与恢复清单四件、通用约束（H8 / H10 / H12 / H13 与 TDD 逐任务自动标注）。以 `task-kind-layout.ts` 阶段表与各 `SKILL.md` 为权威源，刻意规避把 `state.yaml.phase` 当作进度、把 `retro` 接入游标主序列两类常见误读；全部图形经 mermaid 解析校验通过

### Tests

- **CLI 双入口**: polaris 帮助仅生命周期六命令；polaris-flow 含 runtime；resolveCliEntry 识别 bin 名
- **dashboard 路径解析**: POLARIS_WEB_PATH / 包根兄弟 / cwd 兄弟
- **git-branch**: 覆盖 hotfix 创建（干净/脏/已存在/缺参）与合并进主干（成功保留源分支、脏阻断、分支不存在、源=主干）
- **worktree-commit-remove**: 覆盖有改动提交并 remove、已干净跳过提交仍 remove、缺 message
- **Superpowers 安装**: 覆盖 `trae-cn` agent id、GitHub 镜像 URL 改写、git HTTP/1.1 默认、init 摘要「Polaris 成功 + Superpowers 失败」
- **workflow-entry 排序**: `get-active-changes` 按任务目录下一层文件 mtime 升序（最近工作的在最后一项）；覆盖产物 mtime、`--phase` 先过滤再排序、缺 `state.yaml` 回落其它文件 / 全无文件排最前、mtime 全相等回落 YAML 顺序、testcase 族读 `.polaris/testcases/`
- **原型族命令落盘**: claude nested 断言 `polaris/prototype.md`（族级命令）与 `polaris/prototype/review.md` 同级共存、技能名展开为冒号；cursor flat 断言扁平化为 `polaris-prototype.md` / `polaris-prototype-review.md`；`resolveCommandDest` 补族级命令与同族子目录命令并存的用例（全仓首例，防止前者被后者吞并）
- **需求族命令迁移**: claude nested 断言 `polaris/prd.md` 交出到 `polaris:prd:discovery` 且**旧路径 `prd/discovery.md` 不再落盘**；cursor flat 断言落盘 `polaris-prd.md` 且 `polaris-prd-discovery.md` 不存在；`resolveCommandDest` 补 `prd.md` / `prd/readiness.md` 用例
- **测试用例设计命令落盘**: claude nested 断言 `polaris/testing/create-testcase.md` 交出到 `polaris:testing:discovery`；cursor flat 断言扁平化为 `polaris-testing-create-testcase.md`；`resolveCommandDest` 补 `create-testcase.md` 用例
- **命令一致性修复同步**: 路由表编号断言改为 M01 / M02 / M11；testcase 落盘路径改为 `polaris/testing/create-testcase.md` / `polaris-testing-create-testcase.md`；H14 与 flow.md 开发类清单一致性断言改为「M01 / M02 / C01–C03」

### Changed

- **验收标准清单模板**: `testing/acceptance` 的验收标准清单从技能正文抽出为 `templates/acceptance-criteria-template.md`；Step 4 落盘前必须读取该模板，按其章节与表格写入，避免清单结构散落在技能步骤里
- **flow 路由表独立入口标注**: `flow.md` 第四步路由表为**所有存在独立命令的行**补注命令名（M01 / M04 / R02 / R03 / T01 / T03，P01 / P02 已在上一轮补），M02 明确标注「无独立入口命令」；`README-zh.md` 的「直达命令」清单同步补齐 `prd` / `prd:readiness` / `prototype` / `prototype:review` / `testcase` / `bugfix` / `testing:review-testcase`（此前只列了开发三项与 hotfix）
- **测试评审命令改名后的引用对齐**: `assets/zh/commands/testing/review.md` 改名为 `review-testcase.md`（命令名 `/polaris:testing:review-testcase`，技能名仍为 `testing:review`）后，`flow.md` 路由表 / `README-zh.md` / `docs/command-usage-guide.md` 中已失效的 `/polaris:testing:review` 引用同步更正
- **workflow 扁平**: 通道决策不再拆 `workflow.tweak` / `workflow.normal`，升档、降档和信号都写在同一份 `workflow` 上，用 `mode` 区分通道；默认不再双写字符串 `workflow` 与 `workflow_state`。读取时把旧嵌套段和写错到 `runtime.tweak` / `runtime.normal` 的决策折进扁平对象，避免进行中任务丢字段
- **Superpowers agent 映射**: `npx skills add` 使用平台 id（`trae-cn`）而非展示名（`Trae-CN`），与 skills CLI 注册键对齐
- **init 摘要**: Superpowers 失败单独标为组件失败，不再把已成功安装 Polaris 的平台只写成「失败：Trae-CN」
- **Superpowers 失败提示**: 明确 clone 与 npx 都依赖 GitHub，不再声称 npx 在国内更稳
- **Platform.supportsSubagent**: subagent 能力改由 `platforms.ts` 的 `Platform.supportsSubagent` + `resolveSubagentCapability` 表达，删除独立 `subagent-capability.ts`；`qoder` 重新登记且 `supportsSubagent=false`（inline）
- **命令注册文档**: `assets/zh/adapters/command-registration.md` 由「各宿主手动注册方式」（Trae 手动声明 / CodeBuddy `plugin.json`）重写为「宿主中立 Markdown + 落盘位置表 + 已注册平台表」，与 `init` / `update` 的实际分发行为对齐，去掉已失效的 `/pofl:*` 与旧平台描述
- **polaris-flow 维护类选项标注「暂不可用」**: M01/M02/M03 三项的入口技能均未落地（`maintance/hotfix` 与 `maintance/codereview` 无对应技能，`coding/` 族下也不存在 `refactor`），此前选中会直接撞上技能加载失败。现保留菜单，但在选项描述与路由表两处标注「⚠️ 暂不可用」，并在加载前拦截——照实告知用户缺的是哪个技能、询问是否改选其他功能；HARD-STOP 新增第 10 条，禁止对暂不可用选项直接开工或换用其他技能顶替，确保用户明确知道本次什么都没做而不是拿到一份错位产物
- **prd/discovery Step 2 重构为「需求组」统一流程**: 将原 2.3 分叉点（非拆分路径 / 拆分路径两套不对称步骤）重构为 2.3~2.6 四步串行——2.3 判断是否拆分 → 2.4 产出「需求组」（不拆分给需求内容 + 推荐名，拆分给子需求拆分建议 + 推荐名，归一为 1 或 N 个需求）→ 2.5 对每个需求建目录（`task-init`）、写需求内容初稿、登记 workflow 游标（`append-active`），形成可独立恢复的基础任务 → 2.6 扫描任务目录列出清单、让用户明确选中一个推进；命名由「独立阻塞点」降为「推荐名默认采用、用户可改名」；「都要做」「按建议来」「只确认清单」均判为未选择；未选中任务状态维持「未启动」，后续经 Step 1 的「B. 选择一个」恢复；任务多于 4 个时按业务系统分组两级串行询问；Step 1.5 补齐按 `state.yaml` 判断基础任务（直接进 Step 3）/续写/后续阶段的恢复映射
- **平台探测路径**: `detectionPaths` 改为相对用户主目录（`.claude` / `.cursor` / `.trae` / `.trae-cn`），去掉误提交的 `/Users/jason/...` 绝对路径；`detectPlatforms` 同时认项目 `contextDir` 与主目录标记
- **安装 config layout 路径物化**: `generatePolarisConfig` 写入 `layout.worktree` / `openspec` / `tasks.root` / `docs.root` 绝对路径；模板键 `platform` 改为 `platforms`
- **workflow 物化**: init 仅拷贝模板三列表，不再写入 `version` / `install-time`
- **插件根 polaris**: 落盘目录由 `skills/polaris-flow` 改为 `skills/polaris`；flat 叶技能为 `polaris-<family>-<skill>/`；`{{SKN_SPR}}` 仅为 `:`/`-` 分隔符；policies 注入叶技能；跳过 `backup/` 与 `requirements-engineering/`
- **task-init `--kind`**: 必填 `change|requirement|testcase`；change/testcase 建 `draft-*`；requirement **不建 draft**，须 `--task-id` 直接初始化 `.polaris/tasks/<task_id>/`；testcase 落 `.polaris/testcases/` + `testcase_plan.md`；`draft-create` 同步要求 `--kind`（拒绝 requirement）
- **workflow.yaml 多列表游标**: `active_changes` / `pending_triages` 替换为 `change_tasks` / `requirement_tasks` / `testcase_tasks`（字段 `task_id`）；`workflow-entry` 必填 `--kind`，身份旗标改为 `--task-id` / `--where-task-id`；删除 triage ops；无旧 schema 迁移（需重物化 / `polaris update`）
- **hooks/scripts 目录分离**: 宿主注册入口仅保留 `hooks/session-start.sh`；Skill 调用的薄包装与 `_polaris-cli.sh` 迁至 `scripts/`；Skill 路径改为 `$PLUGIN_ROOT/scripts/...`（无兼容包装，需 `polaris update`）；顺带将 `polaris-sync` 引用统一为 `harness-sync`
- **skills 安装流水线**: 源技能为 `family/skill` 两级（如 `coding/clarify`）+ `{{SKN_SPR}}`；nested 落 `skills/polaris/{family}/{skill}/`，flat 叶技能落 `polaris-<family>-<skill>/`；`{{SKN_SPR}}` 仅为 `:`/`-`；policies 注入叶技能 `policies/`；跳过 `backup/`、`requirements-engineering/`、`.workbuddy/`
- **agent 安装按平台改写**: init 安装 agents 时按 `Platform.agentToolMap` 改写 frontmatter `tools`，并用 `resolveReviewAgentModel` 写入 `model`；SessionStart 对全部已注册平台刷新 model
- **platform 解析**: 无效 `--platform` 回退 `.polaris/config.yaml`，不再把未知字符串当有效 id

- **intention-validate 分层**: 校验逻辑留在 core（返回 `missing` / `payload` / `message`，不写控制台）；`commands/hooks/intention-validate.ts` 薄包装负责 stdout JSON 与 stderr 阻断信息，与 task-init / draft-create 一致
- **SessionStart I/O 与平台边界**: stdin 解析、platform resolve、成功摘要均在 `commands/hooks`；core 只消费已归一的 `projectPath` / `sessionId` / `platformId`，经注入 `HookIo` 写过程日志
- **init 选择逻辑迁入 prompts**: `selectScope` / `selectLanguage` / `selectPlatforms` / `buildInstallPlans`（及 `PlatformPlan`）从 `init.ts` 迁入 `prompts.ts`；init 只保留安装编排与结果展示
- **hooks CLI 入口**: hooks 薄包装 `_polaris-cli.sh` 只调用 `polaris-flow`；用户侧 init/status 等仍用 `polaris`（package.json 双 bin）
- **getAssetsDir 归位**: 从 `assets/paths` 迁入 `config/polaris-paths`，安装与命令侧统一从此取包内 assets 路径
- **init 目录初始化**: 新增 `install/layout`（`initializeProjectLayout`）；按注释创建全局/项目 `.polaris` 文件、scope 区分 worktree、平台 skills/commands/agents/rules 与 polaris-flow 子目录；路径助手归并 `polaris-paths`；`installPolarisForPlatform` 第一步调用 layout；`copy-jobs` 并入 `file-system`
- **worktree 模块合并**: `worktree-create` / `worktree-merge-status` / `worktree-rebase-ff` 核心合并为 `src/core/hooks/worktree.ts`，导出 `create` / `merge` / `rebase`；CLI 与薄包装命令名不变
- **config 读写层复用**: 扩展 `polaris-config`（模板对齐 + kebab/snake 归一 + save/patch + 取值辅助）、新增 `task-state` / `polaris-paths`；hooks（session-start、task-init/finalize、constitution-validity、draft-create、workflow-cursor/lock）改为只调用 `src/core/config`，不再本地解析 RawConfig 或字符串改 state
- **workflow-state 合并**: 将 hooks `workflow-cursor`（`active_changes` / `pending_triages`）并入 `src/core/config/workflow-state.ts`；删除重复模块；`status` 改为展示 `.polaris/workflow.yaml` 游标字段
- **types 归并**: 删除 `src/core/types.ts`，`Language` / `InstallScope` 统一由 `polaris-config.ts` 导出
- **plugin 探测合并**: 将 hooks `plugin-presence`（global→project 详细探测与安装提示）并入 `integration/detect.ts`，与 `hasSkills` 共用 marker；session-start 改从 detect 导入
- **hooks 路径统一**: hooks 内 `.polaris` / `.worktrees` 路径一律经 `polaris-paths` 获取；`ship-cleanup` 清理目标为 `.polaris/tasks/<id>{,.snapshot}`
- **废除 .harness 路径**: `polaris-paths` / worktree / harness-sync / scorers 默认目录全部改为 `.polaris`（tasks、metrics、archive、overrides）
- **getPluginRoot**: 签名改为 `(projectPath, platform)`，落盘 `.<platform>/skills/polaris-flow`；新增相对路径 `getPluginRootRelPath`
- **task 模块合并**: `task-init` / `task-finalize` 核心合并为 `src/core/hooks/task.ts`，导出 `init` / `finalize`；CLI 命令名不变
- **主链路 hooks 迁 TypeScript**: 除 scorers 外，`workflow-entry`、`draft-create`、`task-init`/`task-finalize`、`tasks-lint`、`constitution-validity`、`worktree-*`、`harness-sync`、`ship-cleanup`、`intention-validate` 均迁入 `src/core/hooks/`，扁平 CLI `polaris <name>`；各 `.sh` 经 `_polaris-cli.sh` 薄包装转发；Skill 调用路径不变
- **intention-validate**: 原 `pre-design-validate` 重命名迁 TS；按 propose 必含节校验 `intention.md`（存在且非空）；`pre-design-validate.sh` 保留为别名
- **structure-create 别名化**: 废弃 `.harness/changes` 逻辑，薄包装转发 `draft-create`（`.polaris/tasks`）
- **session-start 迁 TypeScript**: 业务逻辑迁入 `src/core/hooks/`，经 `polaris session-start` 暴露；`session-start.sh` 改为薄包装（CRLF 自愈后转发 CLI）；宿主 `hooks.json` 命令不变；`plugin-check.sh` 语义移植到 `integration/detect.ts`（脚本文件保留为遗留）
- **plan 主审 agent 化**: 退役独立 `plan-review` skill；新建 `plan-review-agent`，由 `polaris-flow-plan` 派发一次性主审并落盘 `plan-review-report.md`（主审不可跳过）
- **Outside Voice 统一**: `openspec-review-agent` 专责挑战主审结论；design/plan 主审后均按 outside-voice 协议询问用户再派发
- **plan 评审标准归位**: 将 `scope-challenge` / `four-section-review` / `engineering-mindset` / `test-review-methodology` / `main-review-summary` 恢复到 `skills/plan/`；`plan-review-agent` 经 `StandardsRoot` 强制 `read_file` 后再评审
- **安装编排显式化**: `installPolarisForPlatform` 按 skills → commands → agents → rules → hooks 显式调用；`copyPolarisSkillsForPlatform` 不再顺带安装 commands/agents；init/update 统一走编排入口
- **core 目录重组**: 按安装域拆分 `src/core`——`install.ts` 为编排入口，`install/` 承载 skills/commands/hooks/rules/agents；`platform/`、`assets/`、`config/`、`deps/` 分域；`workflow.ts` 重命名为 `config/workflow-state.ts`
- **core 去重**: 合并 claude/gemini adapter；统一 `copyDirContents` / hooks JSON IO / `runCopyJobs`；`getNodeToolExecutable` 与 `compareVersions` 共用；删除死导出与孤儿注释
- **core 注释**: 补齐 `src/core` 模块文件头与关键导出 API 的中文说明
- **command-adapters 合并**: 将 `install/command-adapters/` 下 8 个文件（index/registry/types + 5 个 adapter）合并为单个 `adapters.ts`；提取 `rewriteColonTrigger` 与 `joinFrontmatter` 公共工具，消除 4 个 adapter 重复的 body 改写逻辑
- **hooks 合并**: 将 `install/hooks/` 下 4 个文件（index/command/json-io + formats/index）合并为单个 `install/hooks.ts`；JSON IO 工具上移到 `utils/json-io.ts` 供 hooks 与 Pi extension 共用，消除 `install/commands.ts` 跨层依赖 hooks 子目录
- **manifest-reader 合并**: 将 `install/manifest-reader.ts`（纯包装层）合并进 `assets/manifest.ts`，`Manifest` 类型与 `readManifest`/`getManifestSkills` 直接在 manifest 模块导出
- **working-dirs 合并**: 将 `install/working-dirs.ts`（3 行 ensureDir）合并进 `config/polaris-config.ts`，与 init 阶段其他项目结构准备同模块
- **死代码删除**: 删除 `4cb4d6d` 移动时遗留的 `src/core/manifest.ts` 与 `src/core/polaris-config.ts`（与 `assets/manifest.ts`、`config/polaris-config.ts` 完全重复，无人 import）
- **平台探测简化**: 删除 `getPlatformSkillsDirs`（`getPlatformSkillsDir` 的单元素数组包装），`detectPlatforms` 与 `hasSkills` 直接用单值调用
- **installSource 抽离**: 将 `installSource`（外部源 skills 拷贝执行器）从 `install/commands.ts` 抽到独立的 `install/source-installer.ts`，`deps/superpowers.ts` 改 import `../install/source-installer.js`，修复 deps 反向依赖 install/commands 的分层违反
- **Pi extension 拆分**: 将 Pi 平台 TS extension 生成（`createPiCommandExtension`/`renderPiCommandExtension`/`getTopLevelSkillNames`/`PI_COMMAND_EXTENSION_FILE`）从 `install/commands.ts` 拆到独立的 `install/pi-extension.ts`，`commands.ts` 仅保留分流调度，不再混入代码生成逻辑
- **init config 生成**: 从 `config.example.yaml` 生成带注释的 `.polaris/config.yaml`，覆盖语言/平台/作用域/路径等运行时字段；`--overwrite` 时整文件重写
- **YAML 模板分发**: `renderYamlTemplate` / `writeYamlFromTemplate` 用 `keepComments` 控制落盘是否保留注释。项目 `config.yaml`、全局 `polaris.yaml` 以及其余模板仍保留注释；`workflow.yaml`（init 物化、SessionStart、插件内 `workflow-template.yaml`）只写出数据。任务 `state.yaml` 仍不保留模板注释
- **init 覆盖策略**: `--overwrite` / `--skip-existing` 可组合——仅 overwrite 四者重装；仅 skip-existing 按组件跳过；两者都传时 OpenSpec/Superpowers/Codegraph 跳过、Polaris 重装
- **hooks 宿主配置安装**: Trae 写独立 `hooks.json`，Claude/Cursor 写 `settings*.json` 的 `hooks` 字段；已存在时按事件/matcher/command 合并，`--overwrite` 时覆盖 Polaris hooks（settings 其它键保留）
- **trae-cn hooks 落盘**: 不再把 hooks 写进项目 `.trae/settings.local.json`。Trae 中文版读的是用户目录 `~/.trae-cn/hooks.json`；已有文件只合并 hooks，保留用户自己的事件。脚本路径按项目 context `.trae/skills/polaris/hooks/`，而不是 `.trae-cn/skills/`
- **polaris-paths 职责拆分**: 平台/插件路径（`getPlugin*` / `getPlatform*` / 相关常量）迁入 `platforms.ts`；`getInstallSkillBase` / `resolveWorktreeRoot` 迁入 `install/layout`；合并重复的 `getPlatformContextDir`（调用方统一从 `platforms` 取）
- **assets/layout 相对路径**: 落盘映射改用平台 `contextDir`/`globalContextDir` 相对片段，不再依赖绝对路径的 `getPlatformContextDir`
- **发布包 assets 源路径**: `getAssetsDir` / `getShared*` / 各 template 源从 `polaris-paths` 迁入 `assets/manifest`；`polaris-paths` 只保留运行时 `.polaris` / worktree 路径；`assets/layout` 只负责落盘映射
- **Dashboard 数据源切换到现行模型**: 端点由 openspec 时代模型（扫 `openspec/changes/` + 按文件存在性反推 phase + 内置 `config/tasks.yaml` 定义 8 步）改为 `.polaris/workflow.yaml` 的 5 类游标 + 阶段表 + `openspec/changes/<id>/` 文件树。**5 类 kind（coding / requirement / testcase / prototype / debug）全部可见**，phase 与游标一致，未知阶段原样显示并标注而不报错
- **端点改名**: `/api/changes` → `/api/tasks`（带 `status` / `kind` 参数）、`/api/changes/:name` → `/api/tasks/:id`、`/api/check-openspec` → `/api/check-initialized`（判据改为 `.polaris/config.yaml` 存在）；均**不保留别名、不做兼容层**
- **`/api/check` 改接 `src/core/doctor.ts`**: 替换原先 5 条硬编码的 `existsSync`（`polaris.meta.yaml` / `polaris.record.yaml` / `openspec/polaris.yaml` 等已失实路径）
- **`/api/workflow*` 改由阶段表派生**: 移除对不存在的 `config/tasks.yaml` 的读取与缓存
- **配置面板换源**: `/api/configs` 列 `.polaris/*.yaml`；`getConfig` 补越界防护。前端一级导航「规格」→「配置」
- **`/api/stats` 重定义**: 按项目汇总（`by_kind` / `by_phase` / 复选框合计），旧的 `totalChanges` / `pendingTasks` 语义作废
- **前端适配收敛在映射层**: 新字段差异集中在 `dashboard/src/utils/changeMapper.js` 与 `utils/workflow.js`，组件渲染契约不变；删除硬编码的旧 9 步模板与「四件套」Tab 常量，改为阶段表驱动；任务卡片新增「开发模式」与「通道」标签
- **dashboard 契约定稿**: `docs/specs/2026-09-18-dashboard-api-contract.md` 状态由 M1 定形转为 M2 定稿，补字段定义、归档双来源、phase 权威字段与守卫测试清单
- **面板由只读开放为可写（M3）**: 写面收敛为三个端点，每个都落到既有原语并经 `.polaris/.locks/`。`src/dashboard/**` 里除写全局注册表 `~/.polaris/projects.json`（非任务模型）外**不出现任何写文件调用**，该不变量由契约 §5.1 登记并配机械检查命令
- **推进阶段只写游标**: 不碰 `state.yaml.phase`（那是只写不读的镜像，见 phase 真相归一设计 §1.1）。目标是旁路阶段 / 未登记 / 不严格晚于当前 / 任务已归档时一律拒绝并给出可读原因 —— 原语 `update-active` 不校验 phase 取值，这层是唯一拦网。**只做推进，不做回退**（回退需写 `regressions[]` 留痕，`--set` 无数组 append 能力）
- **`/api/reveal` 收紧为 fail-closed**: 旧实现 `if (allowedRoots.length > 0)` 才校验，传空数组即放行任意路径。改为被调用方自己守住边界（空白名单直接拒绝），并抽出纯函数 `isWithinAllowedRoots`（同时修掉用 `'/'` 拼前缀在 Windows 上把 `/a/bc` 误判为 `/a/b` 子路径的问题）；判定顺序改为**先授权后存在性**，不向探测者泄漏路径是否存在
- **项目注册表口径（D4 已决）**: 注册表语义定为「所有被加入 dashboard 做可视化、且使用 polaris-flow 的项目」。新增 `addProject` 的「已 `polaris init`」校验；`listProjects` 对失效项返回 `stale` + `reason` 且**不自动删**；**不并入** `~/.polaris/polaris.yaml`（否决设计文档原倾向）。不做数据迁移，只拦新增
- **前端适配**: 看板复选框可点（仅当文件路径 === `task.plan_file`，按路径精确比对）；步骤卡下方加「推进阶段 → <名称>」两段式内联确认；完成卡片的「Archive Plan」改为接成交付清理（预演 → 列出将删路径 → 确认删除）；项目选择器对失效项显示徽标与原因。所有写操作成功后**重取详情**而不是本地改状态
- **契约定稿 M3**: `docs/specs/2026-09-18-dashboard-api-contract.md` 新增 §五「写操作」（不变量、三个端点与原语映射、拒绝面、预演口径、与自动衔接的已知依赖）；§二 路由表补 4 条并重标只读性；§八 守卫测试清单补 6 个测试文件
- **设计文档订正**: §7 D4 由「倾向并入 `polaris.yaml`」改为「已决：继续用 `~/.polaris/projects.json`」并写明语义；§5.2 表后补 M3 落地口径（只做推进、不做通用操作通道、先修 `ship-cleanup` 缺陷）
- **phase 真相归一 A 案落地（枚举与转移各收成一处）**: `state-next` 的 `PHASE_TO_SKILL` / `DEBUG_PHASE_TO_SKILL` / `resolveNextSkillName` 删除，改调 `skillForPhase`；约定固定为「游标 = 接下来要执行的阶段 ⇒ 同名映射」，例外（入口阶段 / 旁路阶段 / 技能名与阶段码未对齐的族）登记在阶段表的 `skill` 字段上。**刻意不维护第二张转移图** —— 下一阶段由技能自己决定，集中式转移表注定与技能分支冲突
- **文档不再自持 phase 枚举**: `workflow-template.yaml` 的 5 处枚举注释（coding / requirement ×2 / prototype / debug）改指阶段表；`auto-transition.md` 订正「guard `--apply`」的不存在描述并新增「阶段名的合法值」一节。各 `*.example.yaml` 的镜像注释**保留**，但加守卫测试（不含表外值、主序列一个不漏）
- **`TaskPhase` 退化为 `string`**: 原定义尾部有 `| string` 使其形同虚设，且它是第二处枚举 —— 5 类 kind 阶段序列各不相同，一个联合表达不了。合法值的唯一真相是阶段表
- **`get-active-changes` 改为按最近工作时间排序（顺序成为契约）**: 原实现按 `workflow.yaml` 的追加序返回，而各族决策点都写作「A. 续写最新一个 = 列表最后一项」—— 追加序 ≠ 最近工作，会续到错误任务。现按 `.polaris/<segment>/<task_id>/` 下一层文件 mtime 的最大值升序（写 `state.yaml` 或产物文档都算；不扫 `docs/prd` 等共享目录），目录缺失视为最旧，时间戳全相等/全缺失时稳定回落 workflow.yaml 顺序（`git clone` 后 mtime 被统一重写的场景下仍可预期）。排序收在 `src/core/hooks/workflow-entry.ts` 的 `sortByUpdatedAt` / `taskUpdatedMs`
- **`docs/workflow-hooks-call-order.md` 第 4 节**: 补 `get-active-changes` 的顺序契约与「需要本阶段候选时同时传 `--phase`」说明；修正同段落两处过期枚举（列表数 4 → 5、`--kind` 缺 `debug`）
- **`polaris update` 的门控与覆盖语义**: 指纹未变的类别整体跳过（原实现按 `manifest.version` 判等，版本号不动就永久跳过）；命中需更新的类别以 `overwrite=true` 重写 —— 原实现非 `--force` 时传 `overwrite=false`，只会新增文件、从不改写既有文件，这是「update 更新不了技能」的直接原因之一
- **update 的 lang / scope 改为先读 `.polaris/config.yaml`**: 原实现语言默认 `en`，而 `assets/en/skills/` 为空目录（仅 `.gitkeep`），于是 `polaris update` 拷贝 0 个技能仍算成功；现按「显式选项 > config > 默认」解析，语言默认回落 `zh`
- **hooks 更新走合并而非整文件替换**: update 传 `overwriteHooks: false`，不再把 `hooks.json` 整文件替换成模板，以免丢掉用户在宿主配置里的自有条目
- **update 执行顺序为「先资产、后程序」**: 程序更新后当前进程跑的仍是旧代码，先做完资产更安全
- **update 输出改为分层**: 程序层 / 资产层（逐平台列出实际重写的类别与清理计数）/ 依赖层分别成行；`--json` 返回 `plan` / `program` / `assets` / `deps` / `lockPath`
- **init 非交互语言缺省改为 `zh`**: `selectLanguage` 新增 `fallback` 参数由 `runInit` 传入已有 config 的语言，重装不会改掉既有语言
- **命令命名空间前缀改为 `psfl`**: 命令前缀与技能插件名**解耦**——技能命名空间仍为 `polaris`，命令命名空间由 `polaris` 改为 `psfl`。Claude Code / Trae 侧命令名 `/polaris:*` → `/psfl:*`（`/polaris:flow` → `/psfl:flow`、`/polaris:coding:normal` → `/psfl:coding:normal`、`/polaris:prd:readiness` → `/psfl:prd:readiness`、`/polaris:testing:create-testcase` → `/psfl:testing:create-testcase`）；Cursor 侧扁平名 `/polaris-*` → `/psfl-*`。技能名（`polaris:coding:specify` 等）、`[polaris-flow]` 状态行、`.polaris/` 目录、`polaris-flow` CLI 一律不变。新增常量 `POLARIS_COMMAND_PREFIX`（`core/config/polaris-constants.ts`），安装/布局/清理三处改为引用它：`install/commands.ts` 的 flat 文件名前缀、`install/layout.ts` 的 nested 命名空间目录、`update/prune.ts` 的命令归属判定（技能侧仍用 `POLARIS_PLUGIN_NAME`；`isOwnedEntryName` 改为接收前缀参数）。入口命令 `flow` **保留原名**，即 `/psfl:flow`，刻意**不**升为命名空间根命令——裸 `/psfl` 无动词、语义不清，且会与 `command_prefix` 占位符约定冲突（`command_prefix` 无任何代码消费，`triggers` 与落盘路径均由安装器按 `commandLayout` 推导）
- **命令资产前缀同步**: `assets/zh/commands/**` 13 个文件的 `command_prefix` 与 `triggers`、正文命令引用改为 `psfl`；技能引用（`{{SKN_SPR}}`）保持不变。`assets/zh/skills/testing/{ship,draft}` 与 `assets/zh/policies/hard-stops.md`（H8 `所有 /psfl:* 命令`、H14 `psfl:flow` 零步）内引用命令处同步为 `psfl`
- **init 欢迎语更正为现行命令名**: `messages.yaml` 的 `getStartedPolaris` / `getStartedHotfix` / `getStartedTweak` 原为陈旧的 `/polaris`、`/polaris-hotfix`、`/polaris-tweak`（对应命令当时已不存在），更正为 `/psfl:flow`、`/psfl:maintance:hotfix`、`/psfl:coding:tweak`
- **命令名文案同步**: `README-zh.md`、`docs/command-usage-guide.md`、`assets/zh/adapters/command-registration.md` 的命令名与落盘路径示例改为 `psfl`（含 nested / flat 两套对照表与平台差异段落）

### Fixed

- **`intention-validate` 的补齐指引指向不存在的命令**: `src/core/hooks/intention-validate.ts` 的「intention.md 不完整」提示写 `/polaris-flow-specify`（上一代扁平命名，当前方案里无此命令），改为 `/polaris:coding:specify`，与同目录 `worktree.ts` / `tasks-lint.ts` 的技能指路写法对齐
- **config 文档目录键**: `layout.docs.testcases` 恢复为 `testcases`，与 `PROJECT_DOCS_SUBDIRS` 和测试用例交付目录 `docs/testcases/` 一致；此前模板写成 `testing`，生成的 config 没有 `testcases` 键
- **H14 开发类清单**: `hard-stops.md` 与 `flow.md` 对齐为 M01 / M04 / C01–C03 / M03。原型 P01–P02 不进零步，旧清单里的 P01–P03 会把非开发类也套上需求预检
- **testing 技能族落盘路径**: `SKILL_FAMILIES`（`assets/layout.ts` 与 `install/skills.ts` 各一份）原为 `['coding','prd','test']`，与资产目录 `assets/<lang>/skills/testing/` 不一致——`testing` 不在族名集合内，`parseSkillAssetPath` 会把它判为独立技能，落盘成 `polaris/testing/`（含 `case/`、`acceptance/` 子目录）而非两个叶技能，导致 `polaris-flow` 菜单的 T01/T02 两项路由不到任何技能。现统一为 `['coding','prd','testing']`；族名**不可改回 `test`**，与仓库根 `test/`（单元测试）及保留目录冲突
- **decision-point 策略引用路径**: `assets/zh/policies/decision-point.md` 原指向 `polaris-flow/policies/ask-question-react-policy.md`（文件名与路径均不存在），修正为 `./policies/ask-question-react.md`；该文件是所有阻塞点的发问路由出口，坏引用会导致发问协议断链
- **OpenSpec 按平台目录落盘**: `installOpenSpec` 接收 Platform 列表；CLI 仍用 `openspecToolId`，init 后按 `contextDir`/`skillsDir`/`commandsDir` 迁入（如 trae-cn → `.trae-cn/skills`），不再把 toolId 当作平台目录
- **Superpowers 技能嵌套路径**: `installSource` 对已含 `baseDir` 的平台目录再次 `path.join(baseDir, …)`；Node `path.join` 不丢弃绝对段，会写出 `<project>/Users/.../<project>/.trae-cn/skills`。改为直接使用 `getPlatformSkillsDir`
- **平台探测双重 join**: `detectPlatforms` 对 `getPlatformContextDir` 结果不再二次 `path.join(projectPath, …)`
- **hook 返回 PLATFORM_ID**: 通用分发器在事件处理后将解析到的平台 id 写入 `HostHookEventResult.PLATFORM_ID` 与 `env.PLATFORM_ID`（Cursor SessionStart stdout 可见）
- **hook 跨平台参数**: CLI 统一接受 `--platform`；安装时替换 `_polaris-cli.sh` 的 `@PLATFORM_ID@`；SessionStart 读宿主 stdin JSON（cwd/session_id）；宿主 hooks command 改写为 `.<platform>/skills/polaris-flow/hooks/...`，不再依赖 `CLAUDE_PLUGIN_ROOT`
- **core 循环依赖**: 消除 `polaris-paths` ↔ `polaris-project-config` ↔ `platforms` 三文件 SCC；`InstallScope` 下沉为 `polaris-paths` 叶类型，config 再导出保持调用方兼容
- **core→commands 死引用**: 删除 `install.ts` 对 `commands/init` 的未使用 `PluginInstallResult` import
- **codegraph 导入路径**: `integration/codegraph.ts` 改为引用 `../command-error` 与 `../types`，修复构建失败
- **hooks**: 从 `assets/shared/hooks` 扫描并拷贝脚本；settings 中命令指向 `skills/polaris-flow/hooks/`
- **rules**: 正确解析 `skills/hard-stops.md` 源路径
- **`polaris update` 的「假成功」**: 不带 `--lang zh` 时拷贝 0 个技能，却仍写 `.polaris/installed-version = manifest.version`，随后即使补上 `--lang zh` 也会因版本相等直接 return（除非 `--force`）—— 用户以为已更新，实际技能没动。根因是「语言默认 en」叠加「把版本号当内容指纹」，两条一并修掉
- **`polaris init --yes` 装不出技能**: `selectLanguage` 在非交互下返回 `en`，而 `assets/en/skills/` 尚无内容，`polaris init --yes` 会装出 0 个技能
- **hooks 陈旧残留**: `mergeHooksMaps` 原先只剔除 incoming 事件里的托管 command，模板中已删除的整个事件组会带着旧 command 永久留在宿主配置里；现改为合并前剔除**所有**事件中的托管 command

### Tests

- **存量失败清零**: 删掉已不存在的 `command-adapters` 测试；`openspec` 改为从 `integrations/openspec` 导入，并按 trae-cn 项目目录 `.trae` 改写迁入断言（目录不一致时的迁入仍单独覆盖）；`commands-install` 的菜单技能改为 `prd:userstory`，路由编号去掉已不存在的 P03，开发类清单改为 C01–C03
- **task-state workflow 折叠**: 覆盖默认扁平 `workflow`、旧字符串 `workflow: sdd` 展开为 `workflow.mode`，以及 `workflow.tweak` / `runtime.tweak` 折进父对象后删除嵌套段和 `workflow_state`
- **commands-install**: 覆盖 claude（nested）与 trae（flat）下命令落盘路径，以及菜单命令中 5 个技能引用 `{{SKN_SPR}}` 分别展开为 `polaris:<family>:<skill>` 与 `polaris-<family>-<skill>`；新增 testing 族叶技能落盘断言（`polaris/testing/case/SKILL.md` 且 `name: polaris:testing:case`）。此前测试断言族名为 `test`，与资产目录 `testing/` 不符，3 项全部失败（命令引用断言不匹配 + 落盘路径 ENOENT），族名统一后转为全通过
- **agents-install**: 覆盖 `mapAgentTools`（trae 恒等、claude/cursor 映射去重）、安装落盘 tools/model、overwrite 跳过
- **openspec relocate**: 覆盖 trae-cn 迁入 `.trae-cn`、trae 不迁入、trae+trae-cn 双保留
- **install/layout**: 覆盖 `resolveWorktreeRoot` / `getInstallSkillBase` / `initializePolarisCommonLayout` / `initializeProjectLayout`
- **hooks TS**: `workflow-entry`（锁/RMW/op）、`draft-create`/`task-init`/`task-finalize`、`tasks-lint`、`constitution-validity`、`harness-sync`/`ship-cleanup`、`intention-validate`（缺文件/缺节/空节/通过，断言 `message`/`payload`）；session-start / detect plugin 既有覆盖保留
- **config / task-state**: 覆盖 kebab↔snake 归一、旧 `lang` 兼容、`patchPolarisConfig` / `patchTaskState` 不丢字段、constitution 读 config.path
- **session-start / detect**: 覆盖 hook IO 通道、依赖探测（可注入 HOME/PATH）、缺 `.polaris` FAIL、gitignore/workflow/session 物化、agent model 注入、WARN/FAIL exit 语义
- **install-layout / skills-install**: 覆盖 nested/flat 落盘、hooks 命令路径、agents 与 config 字段；skills 步骤不再隐式安装 agents；断言 `plan-review-agent` / `openspec-review-agent` 落盘
- **skills-install / agents-install 超时修复**: 给调用 `installPolarisForPlatform` 的 5 个用例加 `INSTALL_TIMEOUT=60s`——该调用拷贝 200+ 文件实测约 15s，默认 5s 必然超时，这些用例此前长期失败且与业务逻辑无关；顺带修正 `skills-install` 的遗留断言 `polaris:flow:clarify` → `polaris:coding:clarify`、`polaris-flow-clarify` → `polaris-coding-clarify`（资产从 `flow` 族重组为 `coding`/`prd` 族后未同步，此前被超时掩盖）；nested/flat 两处补上 testing 族叶技能落盘断言
- **generatePolarisConfig**: 覆盖从模板首次生成、已存在跳过、`--overwrite` 整文件重写，以及模板注释保留
- **yaml 模板分发**: `keepComments` 为真时保留注释、为假时去掉注释且字段修改仍生效；init 物化的 `workflow.yaml` 与插件内 `workflow-template.yaml` 不含注释行，`state.example.yaml` 分发仍保留注释
- **hooks-install**: Trae/Claude 六场景（不存在写入、合并保留用户配置、overwrite 替换 hooks）；trae-cn 写入用户目录 `hooks.json`，合并时保留已有事件，command 指向 `.trae/skills/polaris/hooks/`
- **hook-platform-params**: platform 解析优先级、stdin JSON、`_polaris-cli` 占位替换、hooks command 路径改写、SessionStart session_id
- **session-start.sh 集成**: 薄包装无 CLI 失败提示；stdin cwd/session_id 全链路落盘；CLI 路径优先于 stdin.cwd
- **update 范围解析**: 组名展开、成员命中并按安装顺序归位、大小写与空白归一、`--only` 与 `--skip` 互斥、未知项与空范围报错
- **资产指纹**: 同输入结果稳定、源内容变化只影响对应类别、新增叶技能改变 skills 指纹、`skillsLayout` / `commandLayout` / `agentToolMap` / 模型槽位 / `scope` 各自的影响面、声明但缺失的可选文件以存在位参与哈希、`requirements-engineering` 与 `README.md` 不参与 skills 指纹
- **托管文件清理**: nested 与 flat 两种布局下的陈旧文件与空目录删除、插件根不被自身删空、`openspec-*` / superpowers 技能 / 用户命令 / 同名目录不被误删、目标目录缺失时不抛错
- **`runUpdate` 端到端**: lang 与 scope 从 config 回读、`--only skills` 不落命令层文件、指纹未变时整体跳过（防「更新不了技能」回归）、`--force` 忽略指纹、`--prune` 前后对比、未检测到安装时置退出码 1 且不写 lock、`--only` 与 `--skip` 同用报错。指纹门控与 `--force` 用例通过**预置 lock 指纹**免掉真实安装（本机单次安装实测 28~34s）
- **两处存量测试 bug 修复（与本次改动无关）**: `file-system.test.ts` 从 `utils/file-system.js` 导入 `readJson`，而该函数实际在 `utils/json-io.js`；`agents-install.test.ts` 断言读 `.claude/agents/plan-reviewer.md`，而资产已改名 `plan-review-agent.md`

- **`ship-cleanup` 的静默数据丢失**: `src/core/hooks/delivery-cleanup.ts` 把 `kind` 写死 `coding`，于是对 debug / requirement / testcase / prototype 任务「删游标条目」静默失败（`delete-active` 在 `coding_tasks` 里找不到 → 过滤后列表没变 → 其 `no_tid` 校验**假通过** → exit 0），而函数接着 `rm -rf` 任务档案目录 —— 结果是**退出码 0、档案已蒸发、游标条目还在**。另 testcase 的目录是 `.polaris/testcases/<id>/`，旧实现只删 `tasks` 路径（漏删）。修法三条：`kind` 由调用方给出（CLI 缺省 `coding` 仅为兼容，面板显式传）；新增 `planDeliveryCleanup` 预检（目标不在指定 kind 的列表里就报错，并指出它实际属于哪个 kind）；删条目后**全量回读** `workflow.yaml`，只要该 id 还留在任何 kind 的列表里就中止且**不删档案**（这条不依赖任何单一 kind 的校验正确，只依赖「游标还有引用 → 档案不能删」）。CLI 加 `--kind` / `--dry-run`
- **`ship-cleanup` 成功路径漏带 `plan`**: 执行后回报的 `will_delete` 为空，面板的「删了什么」成了空话
- **前端两个悬空引用（M2 遗留）**: `dashboard/src/views/TasksPage.vue` 的 `handleTaskAction` 仍调用 `executeStepOperation` / `actionToast`，而这两个函数已随 M2 的 `useTasks` 一并删除。`vite build` 不校验未定义全局名，所以逃过了构建；任一 `@action` 都会 `ReferenceError`。一并清掉随之失效的步骤操作 UI（`stage-card-actions` / `stepOperations` / `onStepAction` / `executingOperationCode` prop / `shouldShowStepOperations`）
- **`state.yaml.phase` 的权威性误判（M2 契约遗留）**: 契约原写「以 `state.yaml.phase` 为单一真相」，实际权威是 `workflow.yaml` 游标（`state.yaml.phase` 在 `src/` 内零读取方，且 coding 族从不调用 `enter/complete-phase`，其值长期停在建任务时写的 `specify`）

- **`state-next` 的 prototype / debug 两张转移表偏移一位（自动衔接跳阶段）**: 按「游标 = 待执行阶段」的约定应为同名映射，而旧表是 `blueprint→build`、`build→ship`、`review→ship` 与 `diagnose→patch`、`patch→closeout`。净效果是**逐段跳阶段且不报错**：prototype 游标为 `build` 时派发 `ship`（跳过 `prototype:build`）、debug 三段全跳（诊断→修复→关单），`closeout` 更返回 null（`NEXT: done`，跳过关单）。实测对照见 `docs/specs/2026-09-19-phase-truth-unification-design.md` §八；这四处偏移此前被 `state-next.test.ts` 当作期望断言固化，故修它同时改了断言（单独提交 `b7799f1` 便于回退）
- **`auto-transition.md` 声称的 `guard --apply` 在代码里不存在**: 该文原写「由 guard `--apply` 完成，同时更新 `workflow.yaml` 与 `.polaris/<change_id>/state.yaml` 的 phase」——全仓 grep 只命中这份文档自身，且 `<change_id>` 路径早已失实（实际是 `.polaris/tasks/<task_id>/`）。改述真实机制（技能内联 `workflow-entry update-active`），并澄清 `state.yaml.phase` 是只写不读的镜像、权威始终是 `workflow.yaml` 的游标
- **`docs/specs/2026-09-16-debug-workflow-design.md` 自称「已定稿（已实现）· 无待决」却描述六阶段**: 该文 §2 的 `triage` / `prescribe` / `prove` 在 2026-09-17 就已合并为三阶段，但文档头部没有任何作废标记，先读它的人必然被误导（M2 期间据此做过错误判断）。加显著作废标注，指向 `assets/zh/skills/debug/README.md` 与阶段表；正文保留（它是那些设计取舍的唯一记录）

- **命令前缀改名后的安装测试期望**: `commands-install.test.ts`（落盘路径、命令名断言与 `resolveCommandDest` flat 期望）、`update-prune.test.ts`（nested / flat 命令清理的植入路径与命名）、`install-project-layout.test.ts`（`.claude/commands/*` 目录）改为 `psfl`；技能名断言（`polaris:*` / `polaris-*`）保持不变

### Removed

- **polaris 命令桩**: 删除 `assets/zh/commands/polaris.md`（正文仅一行 `Use the polaris:polaris skill.`），入口职责由 `polaris-flow` 命令承接；旧命令未做功能选择，会把用户直接丢进单一技能
- **plan-review skill**: 整目录（含 policies/references/prompts/`cross-review-agent`）移除，职责下沉到 agents + 父 skill
- **平台支持收窄**: 仅保留 claude / cursor / trae 三个目标平台，删除其余平台（codex / opencode / windsurf / qwen / qoder / gemini / copilot / kiro / cline / pi / lingma 等）的元数据、命令适配器、hook installer、规则格式、Superpowers agent 映射、OpenSpec 迁移与探测逻辑；`hookFormat` 类型从 7 值收窄到 `'claude-code'`，`rulesFormat` 从 `'md' | 'mdc' | 'copilot'` 收窄到 `'md' | 'mdc'`
- **Pi extension**: 删除 `install/pi-extension.ts` 与 `installCommands` 内 Pi 分流，Pi 平台不再走 TS extension 生成
- **死代码**: 删除无外部 import 的 `hasCodexPluginSuperpowers` / `hasOpenCodePluginSuperpowers` / `hasPluginSuperpowers` 及其辅助函数（`hasSuperpowersInPluginCache` / `hasOpenCodePolarisCommands`）
- **旧 Dashboard 启动链**: 移除 `--api-port`、`POLARIS_WEB_PATH`、`resolvePolarisWebRoot`（定位同级仓库）与 `startDashboard` 的子进程 spawn 逻辑，命令描述改为「单进程工作台」
- **绕过锁的 Dashboard 写路由**: 删除 `POST /api/changes/:name/tasks/:id`（直改 `tasks.md`）、`PUT /api/configs/:path`（直写配置文件）、`POST /api/changes/:name/steps/:stepId/operations` 与 `POST /api/changes/:name/validate`（依赖外部 `openspec` CLI）、`POST /api/compose` 与 `GET /api/schemas`。面板在 M1/M2 为只读，写操作推迟到 M3 并落到 CLI 原语
- **失效测试**: 删除 `test/ts/dashboard-resolve.test.ts`（被测的 `resolvePolarisWebRoot` 已移除）
- **Dashboard 旧模型代码**: 删除 `src/dashboard/change-scanner.ts`（按文件存在性反推 phase 的整组逻辑：`getChangePhase` / `computeStepStatuses` / `isArtifactDone` 及 6 个 check 函数）、`src/dashboard/api/changes.ts`、`src/dashboard/markdown.ts`（全仓无引用）；`api/projects.ts` 的 `getAggregateStats`（建立在旧扫描器之上）
- **Dashboard 已移除端点**: `/api/changes` 与 `/api/changes/:name`、`/api/check-openspec`、`GET /api/workflow/:kind/steps/:stepId/operations`（操作白名单属 M3）
- **前端死代码**: 删除无引用组件 `MiniProgress.vue` / `PhaseBadge.vue` 与零引用导出（`workflowMeta` / `formatRelativeTime` / `statusTagClass` / `normalizeWorkflowPhases` / `normalizeStepOperations` / `normalizeArtifactPhases`）
- **`.polaris/installed-version`**: 与 `skills-lock.json` 重复的第二处安装状态，且其门控语义已被资产指纹取代；install 状态统一由 lock 承载
- **update 相关死 i18n 键**: 删除 `npmLaunchFailed` / `npmUpdateFailed` / `npmNetworkHint` / `npmPackageUpdated` / `updatingNpmPackage` / `rulesUpdated` / `rulesFailed` / `hooksUpdated` / `hooksFailed` / `summarySkills` / `summaryCodegraph` / `allSkipped` / `installingSP` / `spSkippedByUser` / `osSkippedNoCli` / `cancelled`（全仓 grep 仅命中 `messages.yaml` 自身，从未被调用）

## 0.1.0

- Initial project scaffold
- Project positioned as all-in-one platform: install, workflow schema, skills, dashboard
- CLI entry with `--version` and `--help`
- Directory structure aligned with comet (src/cli, commands, core, dashboard, assets, test)
- Build, lint, test, and CI pipeline
- **i18n**: 安装引导文案外置至 src/commands/i18n/messages.yaml，CLI 启动时加载缓存
- **CLI**: 实现 init / update / doctor / status 命令
- **Core**: 补全 file-system、manifest 加载、workflow/doctor 模块
- **Changed**: 项目配置目录统一为 `.polaris/`

### Added

- **init**: project scope 初始化时写入 `.polaris/config.yaml`，记录 lang、created_at、workflow、phase、auto_transition 及现有功能开关

### Changed

- **plugin-check**: 增加必填 `--plugin`（openspec / superpowers），每次调用只检测单个插件；`--platform` 必填，按「先全局、后项目」回落
- **init**: 对齐 easyflow 安装流程——Plan/Install 两阶段、按平台/组件冲突策略、进度符号与汇总输出，并写入 `.polaris/skills-lock.json`
- **命令适配器**: 新增 `src/core/command-adapters/` 注册表（default/claude/codex/windsurf/gemini/pi），init 经 adapter 安装 `assets/{zh,en}/commands/`
- **Superpowers**: 改为 GitHub shallow clone + `installSource` 复制（替代 `npx skills add`）
- **OpenSpec**: CLI 改为始终 `npm install -g`，不再在目标项目目录产生 `node_modules`；init 时自动清理旧版误装产物
- **检测**: `hasSkills` 在 project scope 下只检查项目目录，不再因 `~/.trae/skills` 等主目录已有 Superpowers 误报「已存在」
- **Superpowers 克隆**: 增加 git clone 进度提示与超时错误信息，避免 OpenSpec 完成后长时间无输出被误认为卡死
- **Superpowers 回退**: GitHub clone 失败时自动回退 `npx skills add obra/superpowers`（适配国内网络/git HTTP2 问题）
- **构建**: 新增 `devops/build.sh` 本地一键构建脚本；构建完成后提示 link / node 调用方式，避免 `command not found: polaris`

### Docs

- **build.sh**: 新增 [docs/build.sh.md](docs/build.sh.md) 本地构建脚本使用说明
- **i18n**: messages.yaml 改为键优先结构（en/zh 并列）；CLI 在 parse 前加载 YAML，TRANSLATION_KEYS 由加载结果动态导出，消除手写键列表
