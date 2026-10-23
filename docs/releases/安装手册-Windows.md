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
| 全局目录可写 | npm 全局目录若在 `C:\Program Files` 下，普通用户装不进去 | `npm.cmd prefix -g`，见下方说明 |

没有 Node.js → 到 [nodejs.org](https://nodejs.org) 下载 LTS 版本安装后重开终端。

### 需要管理员权限吗

**通常不需要。** Windows 版 Node.js 把 npm 全局前缀默认设在 `%APPDATA%\npm`（即 `C:\Users\<你>\AppData\Roaming\npm`），这个目录本来就在你名下、也在 PATH 里，`npm.cmd install -g` 直接就能写。

**只有这种情况需要**：`npm.cmd prefix -g` 输出的是 `C:\Program Files\nodejs` 之类受保护路径（常见于把 Node 装成「所有用户」并手动改过前缀）。此时要么用管理员身份运行脚本，要么把前缀改回用户目录。

> **为什么要卡这一条**：Polaris 不是装完 CLI 就结束了。`polaris init` 会用 `npm install -g` 装 openspec，`polaris update` 会升级自己，两者都要写全局目录。所以装到一个「能写、且在 PATH 上」的全局目录才算有效安装——用 `--prefix` 换到别处只能让 `polaris --version` 跑起来，后续步骤照样失败。脚本会先探测，不可写就直接报错，不给你半可用的结果。

### 安装 bash

装 [Git for Windows](https://git-scm.com/download/win)，并确认 `C:\Program Files\Git\bin`（含 `bash.exe`）在系统 PATH 里。装完验证：

```powershell
Get-Command bash     # 能返回路径即就绪
```

> Git for Windows 默认安装只把 `cmd` 目录（含 `git.exe`）加进 PATH，**`bin` 目录（含 `bash.exe`）不一定加**。若 `Get-Command bash` 报错，手动把 `C:\Program Files\Git\bin` 加入系统 PATH 后重开终端。

---

## 二、安装 CLI

Nexus 3 聚合仓库地址（下文用 `<NEXUS>` 指代）：
`http://192.168.103.96:8081/repository/npm-group/`

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

脚本按顺序做四件事：

1. 校验 node ≥ 20 与 npm；不合格直接报错并给指引。
2. 检查 bash 是否可用——**只警告不阻断**（缺了 hook 不生效，但不影响安装）。
3. 探测 `npm.cmd prefix -g` 指向的全局目录能否写入；**不可写就退出**，并提示用管理员身份重跑或修正前缀，不会改用自定义前缀硬装。
4. 从 Nexus 3 安装 `polaris-flow`，随后定位入口打印版本号；若 `openspec` 尚未安装，顺带给出安装命令。

需要管理员权限时（判据见第一节）：从开始菜单打开「Windows PowerShell（管理员）」，再执行同一条命令。脚本会探测全局目录，普通身份够用时不会要求提权。

只想看脚本会执行什么命令而不真装：

```powershell
.\install.ps1 -DryRun
# 等价写法
$env:POLARIS_DRY_RUN = '1'; .\install.ps1
```

确需换源（例如临时指向其他镜像）时，两种写法等价：

```powershell
.\install.ps1 -Registry http://其他地址/repository/npm-group/

$env:NPM_REGISTRY = 'http://其他地址/repository/npm-group/'; .\install.ps1
```

### 方式 B：npm 命令

```powershell
npm.cmd install -g polaris-flow --registry <NEXUS>
```

已经配好 `.npmrc` 的机器可以省略 `--registry`，直接 `npm.cmd install -g polaris-flow`。

若报 `EPERM` / `EACCES`，说明全局目录不可写：换成管理员身份的 PowerShell 重跑同一条命令，**不要加 `--prefix` 绕过去**（理由同第一节，会得到半可用的安装）。

> **用 `npm.cmd` 而不是 `npm`**：PowerShell 里 `npm` 常解析到 `npm.ps1`，同样会被执行策略拦住，报「无法将“npm”项识别为 cmdlet」。`npm.cmd` 是批处理文件，不受策略限制。

> `npm-group` 是 Nexus 3 的聚合仓库：`npm-hosted` 存公司内部的包，`npm-proxy` 代理公网 npm，group 把两者合成一个地址。因此第三方依赖也走它，内网无需额外配镜像。发布只能发到 `npm-hosted`，`npm-group` 只用于读取。

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

> **`polaris init` 会顺带装 openspec**（`npm install -g @fission-ai/openspec@latest`）。全局前缀是默认的 `%APPDATA%\npm` 时，普通用户自己就能装上；如果当初是**管理员**装到 `C:\Program Files` 下的，这一步会因权限失败（不会中断 init，但 OpenSpec 集成会缺件）。由管理员预先装一次即可，之后普通用户 `init` 即使升级被拒也会沿用现有版本：
>
> ```powershell
> # 管理员 PowerShell
> npm.cmd install -g @fission-ai/openspec@latest --registry http://192.168.103.96:8081/repository/npm-group/
> ```

**公司网络访问 GitHub 不通时**：`polaris init` 安装 Superpowers 依赖 github.com。设 `POLARIS_GITHUB_MIRROR`（镜像基址）或 `POLARIS_SUPERPOWERS_PATH`（指向已下载的本地目录）即可绕过。

**init 会装两个图表工具**：`archify`（架构 / 时序 / 数据流 / ERD / 类图等 10 类结构化图，带 schema 校验）与 `diagram-design`（13 类编辑级视觉图，可吃 Mermaid 源码）。它们落在 `.claude\skills\archify\` 与 `.claude\skills\diagram-design\`，**不进 `polaris\` 命名空间、不占命令菜单**——只在你要出一张「能贴进文档、发给人看」的图时才用得上。设计文档正文的图仍是 Mermaid，由 `design` 阶段产出。

安装走「GitHub 优先、本地兜底」：先把技能拉到 `%USERPROFILE%\.polaris\components\bundled-skills\`（已有则跳过），再拷进项目。**网络慢或超时只会打印一行失败提示，不影响 init 其余步骤**；本地已有副本时照常安装。离线安装包已内置这两个技能，不会联网。想指定本地源：`$env:POLARIS_BUNDLED_SKILLS_SOURCE = 'D:\path\to\bundled-skills'; polaris init`（指定后不联网）。

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

> 如果当初是用**管理员身份**装到 `C:\Program Files` 下的，升级与卸载也要在管理员 PowerShell 里做（不带会报 `EPERM`）；装在默认的 `%APPDATA%\npm` 则普通窗口即可。

> `polaris update` 分 program / assets / deps 三层，可单独选择，详见 `README-zh.md` 的「用户命令」一节。`polaris uninstall` 目前是占位，尚未实现。

---

## 五、装不上？常见问题

| 现象 | 原因 | 处理 |
| ---- | ---- | ---- |
| `无法加载文件 …install.ps1，因为在此系统上禁止运行脚本` | PowerShell 执行策略限制 | 用 `powershell -ExecutionPolicy Bypass -File install.ps1`，或 `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `无法将“npm”项识别为 cmdlet` / `无法加载文件 …npm.ps1` | `npm` 解析到 `npm.ps1`，被执行策略拦住 | 改用 `npm.cmd` |
| `error: npm 全局目录 … 当前用户不可写`（脚本主动退出） | `npm.cmd prefix -g` 指向 `C:\Program Files` 等受保护路径，`polaris init` / `update` 同样写不进去 | 用管理员 PowerShell 重跑；或执行 `npm.cmd config set prefix "$env:APPDATA\npm"` 后重开终端再跑。**不要加 `--prefix` 硬装** |
| `EPERM: operation not permitted` | 用手工 `npm.cmd install -g` 时装到了受保护目录 | 同上一行 |
| 装完提示 `polaris` 不是可识别的命令 | PATH 未刷新到当前窗口 | 关掉终端重新打开 |
| hook 不执行 / verify 打分器不动（无任何报错） | PATH 里没有 `bash` | 装 Git for Windows，把 `C:\Program Files\Git\bin` 加入系统 PATH，用 `Get-Command bash` 确认 |
| `node` 找不到 | 没装 Node.js 或装后没重开终端 | 装 Node.js LTS 后重开终端 |
| `node vX is too old` | 版本低于 20 | 升级 Node.js 到 20 以上 |
| `E401 Unauthorized` / `Unable to authenticate` | Nexus 3 没开放匿名读，连装包都要求登录 | 找维护者给 `nx-anonymous` 角色加上 `npm-group` 的 browse / read 权限 |
| `ETIMEDOUT 192.168.103.96:8081` / 装包卡住 | 不在公司内网（家庭网络或未连 VPN） | 连内网后重试 |
| `E404` 找不到 `polaris-flow` | 包未发布，或 `npm-hosted` 未加入 `npm-group` 成员列表 | 找维护者确认发布状态与 group 成员配置 |
| 安装的是旧版本 | Nexus 3 聚合仓有缓存 | `npm.cmd cache clean --force` 后重装；仍旧则找维护者确认发布版本 |
| `polaris init` 卡在 Superpowers | 访问 github.com 不通 | 见第三节的镜像配置 |
| 终端中文显示为乱码 | 控制台代码页不是 UTF-8 | 先执行 `chcp 65001`，或改用 Windows Terminal |