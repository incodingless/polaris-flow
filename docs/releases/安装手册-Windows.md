# Polaris Flow 安装手册（Windows）

> 面向 Windows 使用者。
>
> 本文只讲「装」这一件事：装 CLI → 给项目装工作流 → 验证 → 升级/卸载。

## 一、装之前要有什么

| 条件 | 为什么需要 | 自查方法（PowerShell） |
| ---- | ---------- | ---------------------- |
| Node.js ≥ 20 | 运行 Polaris 的唯一硬依赖 | `node -v`，显示 `v20` 以上即合格 |
| npm | 装包用，随 Node.js 自带 | `npm.cmd -v` |
| **bash** | hook 与 verify 打分器是 bash 脚本（27 个 `.sh`）；**Windows 不自带** | `Get-Command bash`，见下节 |

没有 Node.js → 到 [nodejs.org](https://nodejs.org) 下载 LTS 版本安装后重开终端。

### 安装 bash

装 [Git for Windows](https://git-scm.com/download/win)，并确认 `C:\Program Files\Git\bin`（含 `bash.exe`）在系统 PATH 里。装完验证：

```powershell
Get-Command bash     # 能返回路径即就绪
```

> Git for Windows 默认安装只把 `cmd` 目录（含 `git.exe`）加进 PATH，**`bin` 目录（含 `bash.exe`）不一定加**。若 `Get-Command bash` 报错，手动把 `C:\Program Files\Git\bin` 加入系统 PATH 后重开终端。

---

## 二、安装 CLI

Nexus 聚合仓库地址（下文用 `<NEXUS>` 指代）：
`http://192.168.2.96:8081/nexus/content/groups/npm-group/`

### 第 1 步：先解决 PowerShell 执行策略（只需一次）

PowerShell 默认禁止运行 `.ps1` 文件，直接执行 `.\install.ps1` 会报「无法加载文件…因为在此系统上禁止运行脚本」。两种解法，选一种：

| 做法 | 命令 | 特点 |
| ---- | ---- | ---- |
| 单次绕过（推荐） | `powershell -ExecutionPolicy Bypass -File install.ps1` | 不改系统配置，只对这一次生效 |
| 放开当前用户策略 | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` | 一次设置长期有效；公司安全策略可能不允许 |

### 第 2 步：方式 A — 脚本（推荐）

```powershell
cd 脚本所在目录
powershell -ExecutionPolicy Bypass -File install.ps1
```

脚本会自动：校验 node ≥ 20 与 npm → 检查 bash 是否可用（只警告不阻断）→ 从 Nexus 安装 → 打印版本号。

换源（两种写法等价）：

```powershell
.\install.ps1 -Registry https://registry.npmjs.org/

$env:NPM_REGISTRY = 'https://registry.npmjs.org/'; .\install.ps1
```

### 方式 B：npm 命令

```powershell
npm.cmd install -g polaris-flow --registry <NEXUS>
```

已经配好 `.npmrc` 的机器可以省略 `--registry`，直接 `npm.cmd install -g polaris-flow`。

> **用 `npm.cmd` 而不是 `npm`**：PowerShell 里 `npm` 常解析到 `npm.ps1`，同样会被执行策略拦住，报「无法将“npm”项识别为 cmdlet」。`npm.cmd` 是批处理文件，不受策略限制。

> `npm-group` 是 Nexus 的聚合仓库：内部包与公网 npm 代理共用一个地址，因此第三方依赖也走它，内网无需额外配镜像。

### 验证

```powershell
polaris --version    # 显示版本号
polaris --help       # 列出全部用户命令
```

若提示找不到 `polaris` 命令，**关掉终端重新打开**——PATH 的变更不会刷新到已打开的窗口。

---

## 三、给项目装工作流（第一次用必做）

CLI 装好后，还要在你的项目里初始化工作流，这一步会安装技能、命令与 Harness 环境：

```powershell
cd 你的项目目录          # 路径含空格时加引号：cd "D:\my projects\demo"
polaris init
polaris doctor           # 自检 node / bash / git / openspec / schema / 技能安装状态
```

> **Windows 上重点看 `doctor` 里的 `bash` 那一项。** 它若为 fail，说明 hook 不会生效——回到第一节装 Git for Windows 并配好 PATH。

**公司网络访问 GitHub 不通时**：`polaris init` 安装 Superpowers 依赖 github.com。设 `POLARIS_GITHUB_MIRROR`（镜像基址）或 `POLARIS_SUPERPOWERS_PATH`（指向已下载的本地目录）即可绕过。

```powershell
# 仅当前窗口有效
$env:POLARIS_GITHUB_MIRROR = 'https://你的镜像基址'
polaris init

# 长期有效（设完需重开终端）
setx POLARIS_GITHUB_MIRROR "https://你的镜像基址"
```

具体配置见 `README-zh.md` 的「Superpowers 安装与网络」一节。通常由先跑通的同学统一整理后分享。

---

## 四、升级与卸载

命令与 macOS 相同，只是把 `npm` 换成 `npm.cmd`。

| 要做的事 | 命令 |
| -------- | ---- |
| 升级 CLI 程序本体 | `polaris update --only program`（或 `npm.cmd update -g polaris-flow`） |
| 更新项目内的工作流资产 | `polaris update`（缺省全量：程序 + 资产 + 第三方依赖） |
| 卸载 CLI | `npm.cmd uninstall -g polaris-flow` |

> `polaris update` 分 program / assets / deps 三层，可单独选择，详见 `README-zh.md` 的「用户命令」一节。`polaris uninstall` 目前是占位，尚未实现。

---

## 五、装不上？常见问题

| 现象 | 原因 | 处理 |
| ---- | ---- | ---- |
| `无法加载文件 …install.ps1，因为在此系统上禁止运行脚本` | PowerShell 执行策略限制 | 用 `powershell -ExecutionPolicy Bypass -File install.ps1`，或 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `无法将“npm”项识别为 cmdlet` / `无法加载文件 …npm.ps1` | `npm` 解析到 `npm.ps1`，被执行策略拦住 | 改用 `npm.cmd` |
| `EPERM: operation not permitted` | 全局安装目录无写权限（Node 装在 `C:\Program Files` 时常见） | 用「以管理员身份运行」的 PowerShell 重试 |
| 装完提示 `polaris` 不是可识别的命令 | PATH 未刷新到当前窗口 | 关掉终端重新打开 |
| hook 不执行 / verify 打分器不动（无任何报错） | PATH 里没有 `bash` | 装 Git for Windows，把 `C:\Program Files\Git\bin` 加入系统 PATH，用 `Get-Command bash` 确认 |
| `node` 找不到 | 没装 Node.js 或装后没重开终端 | 装 Node.js LTS 后重开终端 |
| `node vX is too old` | 版本低于 20 | 升级 Node.js 到 20 以上 |
| `ETIMEDOUT 192.168.2.96:8081` / 装包卡住 | 不在公司内网（家庭网络或未连 VPN） | 连内网后重试；外网机器加 `--registry https://registry.npmjs.org/` |
| `E404` 找不到 `polaris-flow` | 包未发布，或 Nexus 的 npm-hosted 未加入 npm-group 聚合 | 找维护者确认发布状态与 group 成员配置 |
| 安装的是旧版本 | Nexus 聚合仓有缓存 | `npm.cmd cache clean --force` 后重装；仍旧则找维护者确认发布版本 |
| `polaris init` 卡在 Superpowers | 访问 github.com 不通 | 见第三节的镜像配置 |
| 终端中文显示为乱码 | 控制台代码页不是 UTF-8 | 先执行 `chcp 65001`，或改用 Windows Terminal |