# Polaris Flow 安装手册（macOS / Linux）

> 面向 macOS 使用者；Linux 的步骤与此完全相同。
> 本文只讲「装」这一件事：装 CLI → 给项目装工作流 → 验证 → 升级/卸载。
> 命令怎么用、每个命令的流程，见《使用帮助》（`docs/使用帮助.md`）与《命令使用说明》（`docs/命令使用说明.md`）。

---

## 一、装之前要有什么

| 条件 | 为什么需要 | 自查方法 |
| ---- | ---------- | -------- |
| Node.js ≥ 20 | 运行 Polaris 的唯一硬依赖 | `node -v`，显示 `v20` 以上即合格 |
| npm | 装包用，随 Node.js 自带 | `npm -v` |
| bash | hook 与 verify 打分器是 bash 脚本（27 个 `.sh`）；macOS / Linux 系统自带 | `bash --version` |
| sudo 权限（仅 Linux 系统级 node） | 全局目录 `/usr/lib/node_modules` 属于 root，普通用户写不进去 | `sudo -v` 不报错即合格 |

没有 Node.js → 到 [nodejs.org](https://nodejs.org) 下载 LTS 版本安装后重开终端。

> pnpm 不需要——那是维护者本地开发用的，使用者只碰 npm（随 Node.js 自带）。

---

## 二、安装 CLI（两种方式选一）

Nexus 3 聚合仓库地址（下文用 `<NEXUS>` 指代）：
`http://192.168.103.96:8081/repository/npm-group/`

### 方式 A：一条命令脚本（推荐）

先从内网拿到脚本文件（由先跑通的同学分享，或从代码库下载），然后：

```bash
bash install.sh          # macOS / 用 nvm 的机器
sudo bash install.sh     # Linux 系统级 node（yum / apt 装的）
```

脚本做三件事：校验 node/npm 与版本（不合格直接报错并给指引）→ 从公司 Nexus 3 安装 `polaris-flow` → 打印版本号与下一步提示。

> **Linux 上必须 `sudo`**：系统级 node 的全局目录是 `/usr/lib/node_modules`，属于 root。普通用户装进去会 `EACCES`；改装到自己目录虽然能装上，但 `polaris` 不在系统 PATH 上，且 `polaris init` 装 openspec、`polaris update` 升级自身时仍要写全局目录，照样失败——等于装了个只能跑 `--version` 的残件。所以**脚本只支持全局安装**，遇到不可写会直接拒绝并让你用 `sudo` 重跑，不提供用户级安装。
>
> 只想看会执行什么命令而不真装：加 `POLARIS_DRY_RUN=1`。

> 脚本默认指向 `<NEXUS>`，内网机器无需任何额外配置。确需换源（例如临时指向其他镜像）时用环境变量覆盖：

```bash
sudo NPM_REGISTRY=http://其他地址/repository/npm-group/ bash install.sh   # Linux
NPM_REGISTRY=http://其他地址/repository/npm-group/ bash install.sh        # macOS / nvm
```

### 方式 B：npm 命令

```bash
sudo npm install -g polaris-flow --registry <NEXUS>     # Linux 系统级 node
npm install -g polaris-flow --registry <NEXUS>          # macOS / nvm 管理的 node
```

在 Linux 上若不加 `sudo`，会写 `/usr/lib/node_modules` 并报 `EACCES`；此时不要改用 `--prefix` 绕过去（理由同方式 A 的说明），直接加 `sudo`。

> `npm-group` 是 Nexus 3 的聚合仓库：`npm-hosted` 存公司内部的包，`npm-proxy` 代理公网 npm，group 把两者合成一个地址。因此第三方依赖也走它，内网无需额外配镜像。
>
> 发布只能发到 `npm-hosted`，`npm-group` 只用于读取——所以使用者只需要记住 `<NEXUS>` 这一个地址。

### 验证

```bash
polaris --version    # 显示版本号
polaris --help       # 列出全部用户命令
```

---

## 三、给项目装工作流（第一次用必做）

CLI 装好后，还要在你的项目里初始化工作流，这一步会安装技能、命令与 Harness 环境：

```bash
cd 你的项目目录
polaris init
polaris doctor       # 自检 node / bash / git / openspec / schema / 技能安装状态，全部 ✓ 即就绪
```

> **Linux 上先一次性装好 openspec**：`polaris init` 会执行 `npm install -g @fission-ai/openspec@latest`。普通用户没有全局目录写权限时，这一步会失败（不会中断 init，但 OpenSpec 集成装不上）。由管理员执行一次即可，之后普通用户 `init` 即使升级被拒也会自动降级用已装版本：
>
> ```bash
> sudo npm install -g @fission-ai/openspec@latest
> ```

**init 会装两个图表工具**：`archify`（架构 / 时序 / 数据流 / ERD / 类图等 10 类结构化图，带 schema 校验）与 `diagram-design`（13 类编辑级视觉图，可吃 Mermaid 源码）。它们落在 `.claude/skills/archify/` 与 `.claude/skills/diagram-design/`，**不进 `polaris/` 命名空间、不占命令菜单**——只在你要出一张「能贴进文档、发给人看」的图时才用得上。设计文档正文的图仍是 Mermaid，由 `design` 阶段产出。

安装走「GitHub 优先、本地兜底」：先把技能拉到 `~/.polaris/components/bundled-skills/`（已有则跳过），再拷进项目。**网络慢或超时只会打印一行失败提示，不影响 init 其余步骤**；本地已有副本时照常安装。离线安装包已内置这两个技能，不会联网。想指定本地源：`POLARIS_BUNDLED_SKILLS_SOURCE=<目录> polaris init`（指定后不联网）。

**公司网络访问 GitHub 不通时**：`polaris init` 安装 Superpowers 依赖 github.com。设 `POLARIS_GITHUB_MIRROR`（镜像基址）或 `POLARIS_SUPERPOWERS_PATH`（指向已下载的本地目录）即可绕过：

```bash
POLARIS_GITHUB_MIRROR=https://你的镜像基址 polaris init
```

具体配置见 `README-zh.md` 的「Superpowers 安装与网络」一节。通常由先跑通的同学统一整理后分享。

---

## 四、升级与卸载

| 要做的事 | 命令 |
| -------- | ---- |
| 升级 CLI 程序本体 | `polaris update --only program`（或 `npm update -g polaris-flow`） |
| 更新项目内的工作流资产 | `polaris update`（缺省全量：程序 + 资产 + 第三方依赖） |
| 卸载 CLI | `npm uninstall -g polaris-flow` |

> Linux 上用 `sudo` 做的全局安装，升级与卸载也要带 `sudo`（`sudo npm uninstall -g polaris-flow` 等）；不带会因写全局目录而报 `EACCES`。

> `polaris update` 分 program / assets / deps 三层，可单独选择，详见 `README-zh.md` 的「用户命令」一节。`polaris uninstall` 目前是占位，尚未实现。

---

## 五、装不上？常见问题

| 现象 | 原因 | 处理 |
| ---- | ---- | ---- |
| `node: command not found` | 没装 Node.js 或装后没重开终端 | 装 Node.js LTS 后重开终端 |
| `node vX is too old` | 版本低于 20 | 升级 Node.js 到 20 以上 |
| `EACCES ... mkdir '/usr/lib/node_modules/polaris-flow'` | 系统级 Node（apt / yum 装的）把全局目录放在 `/usr/lib/node_modules`，普通用户无写权限 | 加 `sudo` 重装：`sudo bash install.sh`。脚本本身也会检测到这一点并直接拒绝用户级安装，而不是装出一个 `polaris` 找不到的半成品 |
| `polaris: command not found`（刚装完） | 当前 shell 缓存着旧的命令位置，`/usr/bin` 已生效但没刷新 | `hash -r`，或关掉终端重开；仍不行用 `which -a polaris` 确认装在 `/usr/bin/polaris` |
| `已不再支持用户级安装` | 用了旧文档里的 `--user-prefix` | 去掉该参数，改用 `sudo bash install.sh` |
| `E401 Unauthorized` / `Unable to authenticate` | Nexus 3 没开放匿名读，连装包都要求登录 | 找维护者给 `nx-anonymous` 角色加上 `npm-group` 的 browse / read 权限 |
| `ETIMEDOUT 192.168.103.96:8081` / 装包卡住 | 不在公司内网（家庭网络或未连 VPN） | 连内网后重试 |
| `E404` 找不到 `polaris-flow` | 包未发布，或 `npm-hosted` 未加入 `npm-group` 成员列表 | 找维护者确认发布状态与 group 成员配置 |
| 安装的是旧版本 | Nexus 3 聚合仓有缓存 | `npm cache clean --force` 后重装；仍旧则找维护者确认发布版本 |
| `polaris init` 卡在 Superpowers | 访问 github.com 不通 | 见第三节的镜像配置 |