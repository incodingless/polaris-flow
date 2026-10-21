#Requires -Version 5.1
<#
.SYNOPSIS
    Polaris Flow 一键安装脚本（Windows / PowerShell 版）

.DESCRIPTION
    职责与仓库根目录的 install.sh 完全等价：
        校验 node >= 20 与 npm → 从公司 Nexus 安装 polaris-flow → 打印版本号与下一步提示。
    供不便使用 Git Bash 的 Windows 用户使用。

    默认从公司内网 Nexus 聚合仓库安装（npm-group：内部包 + 公网 npm 代理）。
    需要换源时用参数或环境变量覆盖：
        .\install.ps1 -Registry https://registry.npmjs.org/
        $env:NPM_REGISTRY = 'https://registry.npmjs.org/'; .\install.ps1

.PARAMETER Registry
    npm registry 地址。缺省取环境变量 NPM_REGISTRY，再缺省为公司 Nexus 聚合仓库。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install.ps1

.EXAMPLE
    .\install.ps1 -Registry https://registry.npmjs.org/

.NOTES
    PowerShell 执行策略若禁止运行脚本，用上面的 -ExecutionPolicy Bypass 形式启动。
    本文件须以 UTF-8 with BOM 保存，否则 Windows PowerShell 5.1 会按 ANSI 解析导致中文乱码。
#>

[CmdletBinding()]
param(
    [string] $Registry = $env:NPM_REGISTRY
)

# 不用 Set-StrictMode：安装脚本应尽量宽容，避免因环境细节误报而非正常退出
$ErrorActionPreference = 'Stop'

$PackageName     = 'polaris-flow'
$MinNodeMajor    = 20
# 内网 Nexus 聚合仓库（Nexus 2 路径格式：/nexus/content/groups/<repoId>/）
$DefaultRegistry = 'http://192.168.2.96:8081/nexus/content/groups/npm-group/'

if ([string]::IsNullOrWhiteSpace($Registry)) {
    $Registry = $DefaultRegistry
}

function Write-Info {
    param([string] $Message)
    Write-Host "==> $Message"
}

function Write-ErrorMessage {
    param([string] $Message)
    Write-Host "error: $Message" -ForegroundColor Red
}

function Stop-Install {
    param([string] $Message)
    Write-ErrorMessage $Message
    exit 1
}

# ---------------------------------------------------------------- 环境校验

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    Stop-Install 'node not found. Install Node.js 20+ first: https://nodejs.org'
}

$nodeVersion = (& node -v).Trim()
# 用 String.Split() 而非 -split：后者在只有一段时返回字符串，[0] 会取到首字符
$majorText = ($nodeVersion -replace '^v', '').Split('.')[0]
if ($majorText -notmatch '^\d+$') {
    Stop-Install "cannot parse node version: $nodeVersion"
}
if ([int] $majorText -lt $MinNodeMajor) {
    Stop-Install "node $nodeVersion is too old. Polaris Flow requires Node.js >= $MinNodeMajor."
}

# Windows 上 npm 以 npm.cmd 形式提供，同时可能还有一个 npm.ps1。
# 优先用 npm.cmd：npm.ps1 会被 PowerShell 执行策略拦住，报「无法加载文件」。
$npmExe = $null
if (Get-Command npm.cmd -ErrorAction SilentlyContinue) {
    $npmExe = 'npm.cmd'
}
elseif (Get-Command npm -ErrorAction SilentlyContinue) {
    $npmExe = 'npm'
}
else {
    Stop-Install 'npm not found. It ships with Node.js; reinstall Node.js 20+ if it is missing.'
}

# bash 缺失不阻断安装，但必须明确告知：hook 与打分器是 bash 脚本，缺了会静默失效
$bashCommand = Get-Command bash -ErrorAction SilentlyContinue
if (-not $bashCommand) {
    $portableBash = 'C:\Program Files\Git\bin\bash.exe'
    Write-Host ''
    Write-Host '注意：PATH 中未找到 bash。' -ForegroundColor Yellow
    Write-Host '  Polaris Flow 的 hook 与 verify 打分器以 bash 脚本编写，缺少 bash 时：'
    Write-Host '    - polaris init 仍可完成，但写入宿主配置的 hook 不会生效'
    Write-Host '    - verify 阶段的打分器无法运行'
    Write-Host '  解决：安装 Git for Windows（https://git-scm.com/download/win），'
    if (Test-Path $portableBash) {
        Write-Host "        该机已存在 ${portableBash}，只需把 'C:\Program Files\Git\bin' 加入系统 PATH 后重开终端。"
    }
    else {
        Write-Host "        安装时勾选把 Git 加入 PATH，或手动把 'C:\Program Files\Git\bin' 加入系统 PATH 后重开终端。"
    }
    Write-Host ''
}

# ---------------------------------------------------------------- 安装

Write-Info "Installing $PackageName via npm"
Write-Info "Using registry: $Registry"
& $npmExe install -g $PackageName --registry $Registry
if ($LASTEXITCODE -ne 0) {
    Stop-Install "npm install failed with exit code $LASTEXITCODE"
}

# ---------------------------------------------------------------- 验证

# npm 全局 bin 目录可能尚未进入当前进程的 PATH，直接定位刚装好的入口更可靠
$polarisEntry = $null
$npmPrefix = (& $npmExe prefix -g 2>$null | Select-Object -First 1)
if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($npmPrefix)) {
    $candidate = Join-Path $npmPrefix.Trim() 'polaris.cmd'
    if (Test-Path $candidate) {
        $polarisEntry = $candidate
    }
}
if (-not $polarisEntry) {
    $resolved = Get-Command polaris -ErrorAction SilentlyContinue
    if ($resolved) {
        $polarisEntry = $resolved.Source
    }
}

if ($polarisEntry) {
    Write-Info 'Installed:'
    & $polarisEntry --version
}
else {
    Write-Host ''
    Write-Host '注意：安装已完成，但当前终端还找不到 polaris 命令。' -ForegroundColor Yellow
    Write-Host '  关掉终端重新打开后再执行：polaris --version'
}

Write-Host ''
Write-Host 'Next steps:'
Write-Host '    polaris init <path>   # 在目标项目中初始化 Polaris Flow 工作流'
Write-Host '    polaris --version     # 提示找不到命令时，关掉终端重开'
Write-Host '    polaris --help        # 查看全部命令'
