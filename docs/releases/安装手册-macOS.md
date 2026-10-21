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
| AI 编码工具 | `polaris init` 要往里面装工作流 | Claude Code / Trae / Cursor 三者之一，能在终端启动即可 |

没有 Node.js → 到 [nodejs.org](https://nodejs.org) 下载 LTS 版本安装后重开终端。

> pnpm 不需要——那是维护者本地开发用的，使用者只碰 npm（随 Node.js 自带）。

---

## 二、安装 CLI（两种方式选一）

Nexus 聚合仓库地址（下文用 `<NEXUS>` 指代）：
`http://192.168.2.96:8081/nexus/content/groups/npm-group/`

### 方式 A：一条命令脚本（推荐）

先从内网拿到脚本文件（由先跑通的同学分享，或从代码库下载），然后：

```bash
bash install.sh
```

脚本做三件事：校验 node/npm 与版本（不合格直接报错并给指引）→ 从公司 Nexus 安装 `polaris-flow` → 打印版本号与下一步提示。

> 脚本默认指向 `<NEXUS>`，内网机器无需任何额外配置。外网机器或需要换源时：

```bash
NPM_REGISTRY=https://registry.npmjs.org bash install.sh
```

### 方式 B：npm 命令

```bash
npm install -g polaris-flow --registry <NEXUS>
```

已经配好 `.npmrc` 的机器可以省略 `--registry`，直接 `npm install -g polaris-flow`。

> `npm-group` 是 Nexus 的聚合仓库：内部包与公网 npm 代理共用一个地址，因此第三方依赖也走它，内网无需额外配镜像。

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

> `polaris update` 分 program / assets / deps 三层，可单独选择，详见 `README-zh.md` 的「用户命令」一节。`polaris uninstall` 目前是占位，尚未实现。

---

## 五、装不上？常见问题

| 现象 | 原因 | 处理 |
| ---- | ---- | ---- |
| `node: command not found` | 没装 Node.js 或装后没重开终端 | 装 Node.js LTS 后重开终端 |
| `node vX is too old` | 版本低于 20 | 升级 Node.js 到 20 以上 |
| `EACCES permission denied`（npm 全局安装时） | 当前用户无全局目录写权限 | 推荐用 [nvm](https://github.com/nvm-sh/nvm) 重新管理 Node.js；**不要用 sudo 装全局包** |
| `ETIMEDOUT 192.168.2.96:8081` / 装包卡住 | 不在公司内网（家庭网络或未连 VPN） | 连内网后重试；外网机器加 `--registry https://registry.npmjs.org/` |
| `E404` 找不到 `polaris-flow` | 包未发布，或 Nexus 的 npm-hosted 未加入 npm-group 聚合 | 找维护者确认发布状态与 group 成员配置 |
| 安装的是旧版本 | Nexus 聚合仓有缓存 | `npm cache clean --force` 后重装；仍旧则找维护者确认发布版本 |
| `polaris init` 卡在 Superpowers | 访问 github.com 不通 | 见第三节的镜像配置 |
| `polaris: command not found`（刚装完） | 当前 shell 的 PATH 缓存未刷新 | 执行 `hash -r`，或关掉终端重开 |