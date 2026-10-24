#Requires -Version 5.1
<#
.SYNOPSIS
    Polaris Flow 一键安装脚本（Windows / PowerShell 版）

.DESCRIPTION
    职责与仓库根目录的 install.sh 等价：
        校验 node >= 20 与 npm → 探测 npm 全局目录是否可写 → 全局安装 polaris-flow
        → 打印版本号与下一步提示。
    供不便使用 Git Bash 的 Windows 用户使用。

    只做全局安装 polaris-flow 本体，不提供「装到自定义前缀」的方式。原因：polaris update
    升级自身要写 npm 全局目录，装到别处只能得到一个跑得起 --version 的残件。
    全局目录不可写时脚本直接报错，不给半可用方案。

    注意分工：polaris init 必须由普通用户执行 —— 用管理员身份跑 init 会让项目里的
    .polaris/ 与平台目录归属管理员，用户之后改不了。init 需要的 openspec / codegraph
    会自动装到 %USERPROFILE%\.polaris\cli，不需要管理员权限。

    Windows 与 Linux 的差别：Windows 官方安装包的 npm 前缀默认是 %APPDATA%\npm，
    本来就在当前用户名下、也在 PATH 里，正常不需要管理员。只有前缀被指向
    C:\Program Files 这类受保护路径时，才必须用管理员身份运行。

    默认从公司内网 Nexus 3 聚合仓库安装（npm-group：hosted 内部包 + proxy 公网代理）。
    需要换源时用参数或环境变量覆盖：
        .\install.ps1 -Registry https://registry.npmjs.org/
        $env:NPM_REGISTRY = 'https://registry.npmjs.org/'; .\install.ps1

.PARAMETER Registry
    npm registry 地址。缺省取环境变量 NPM_REGISTRY，再缺省为公司 Nexus 聚合仓库。

.PARAMETER DryRun
    只打印将要执行的命令，不真正安装。等价于环境变量 POLARIS_DRY_RUN=1。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File install.ps1

.EXAMPLE
    .\install.ps1 -DryRun

.NOTES
    PowerShell 执行策略若禁止运行脚本，用上面的 -ExecutionPolicy Bypass 形式启动。
    本文件须以 UTF-8 with BOM 保存，否则 Windows PowerShell 5.1 会按 ANSI 解析导致中文乱码。
#>

[CmdletBinding()]
param(
    [string] $Registry = $env:NPM_REGISTRY,
    [switch] $DryRun   = ($env:POLARIS_DRY_RUN -eq '1')
)

# 不用 Set-StrictMode：安装脚本应尽量宽容，避免因环境细节误报而非正常退出
$ErrorActionPreference = 'Stop'

$PackageName     = 'polaris-flow'
$OpenSpecPackage = '@fission-ai/openspec@latest'
$MinNodeMajor    = 20
# 内网 Nexus 3 聚合仓库（Nexus 3 路径格式：/repository/<repoId>/）
$DefaultRegistry = 'http://192.168.103.96:8081/repository/npm-group/'

if ([string]::IsNullOrWhiteSpace($Registry)) {
    $Registry = $DefaultRegistry
}

function Write-Info {
    param([string] $Message)
    Write-Host "==> $Message"
}

function Write-Warn {
    param([string] $Message)
    Write-Host "warn: $Message" -ForegroundColor Yellow
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

function Test-Admin {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 用建临时文件的方式探测真实可写性：ACL 判断在 Windows 上容易误判（继承、所有权、虚拟化）
function Test-DirectoryWritable {
    param([string] $Path)

    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }

    # 目录可能尚未创建（全新 Node 安装、还没装过任何全局包），此时探测最近的已存在祖先目录：
    # 祖先可写即可，npm 装包时会自己把尾部目录建出来。
    $target = $Path
    while (-not (Test-Path -LiteralPath $target)) {
        $parent = Split-Path -Parent $target
        if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $target) { return $false }
        $target = $parent
    }

    $probe = Join-Path $target ('.polaris-write-probe-' + [Guid]::NewGuid().ToString('N'))
    try {
        New-Item -ItemType File -Path $probe -Force -ErrorAction Stop | Out-Null
        Remove-Item -LiteralPath $probe -Force -ErrorAction SilentlyContinue
        return $true
    }
    catch {
        return $false
    }
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

# ---------------------------------------------------------------- bundle 模式
# 检测同目录 config.ini / components/，存在则进入离线安装包模式：
# 读 config.ini 覆盖 registry，并把组件预种进 ~/.polaris/（本地目录通道 + install: 段）。
function Get-ConfigValue {
    param([string] $Key)
    $configPath = Join-Path $PSScriptRoot 'config.ini'
    if (-not (Test-Path -LiteralPath $configPath)) { return $null }
    $lines = [System.IO.File]::ReadAllLines($configPath)
    foreach ($line in $lines) {
        $t = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($t) -or $t.StartsWith('#') -or $t.StartsWith(';')) { continue }
        $eq = $t.IndexOf('=')
        if ($eq -le 0) { continue }
        $k = $t.Substring(0, $eq).Trim()
        if ($k -eq $Key) { return $t.Substring($eq + 1).Trim() }
    }
    return $null
}

$bundleMode = $false
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'config.ini')) { $bundleMode = $true }
if (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'components')) { $bundleMode = $true }

if ($bundleMode) {
    Write-Info '检测到离线安装包（bundle 模式）'
    $cfgRegistry = Get-ConfigValue 'POLARIS_NPM_REGISTRY'
    if (-not [string]::IsNullOrWhiteSpace($cfgRegistry)) {
        $Registry = $cfgRegistry
    }
    $preseed = Join-Path $PSScriptRoot 'polaris-preseed.cjs'
    if (Test-Path -LiteralPath $preseed) {
        & node $preseed $PSScriptRoot
        if ($LASTEXITCODE -ne 0) {
            Write-Warn '预种 ~/.polaris 失败（不影响本机包安装；polaris init 时仍可用 env/CLI 覆盖）'
        }
    }
}

# ---------------------------------------------------------------- 全局目录探测

# $npmExe prefix -g 取到的是可执行入口所在目录（Windows 上即全局 bin），安装要写这里
$globalPrefix = $null
try {
    $prefixOutput = (& $npmExe prefix -g 2>$null | Select-Object -First 1)
    if (-not [string]::IsNullOrWhiteSpace($prefixOutput)) {
        $globalPrefix = $prefixOutput.Trim()
    }
}
catch {
    $globalPrefix = $null
}

if ([string]::IsNullOrWhiteSpace($globalPrefix)) {
    Write-Warn '无法获取 npm 全局目录，跳过可写性检查（若随后出现 EPERM/EACCES，请以管理员身份重跑）'
}
elseif (Test-DirectoryWritable $globalPrefix) {
    Write-Info "Global prefix: $globalPrefix"
}
else {
    Write-Host ''
    Write-ErrorMessage "npm 全局目录 $globalPrefix 当前用户不可写，装下去也不会是可用的安装。"
    Write-Host '  原因：polaris update 升级自身要写这个目录，'
    Write-Host '        换成自定义 prefix 只能让 polaris 命令本身跑起来，升级时仍会失败。'
    Write-Host '        （polaris init 不受影响：它要的伴生 CLI 会自动装到用户目录）'
    Write-Host ''
    Write-Host '  选一条：'
    Write-Host '    1) 以管理员身份重新运行（推荐）'
    Write-Host '         右键「Windows PowerShell」→「以管理员身份运行」，然后：'
    Write-Host '         powershell -ExecutionPolicy Bypass -File install.ps1'
    Write-Host '    2) 先把 npm 全局前缀改回当前用户目录（改完重开终端）'
    Write-Host "         $npmExe config set prefix `"`$env:APPDATA\npm`""
    Write-Host ''
    Write-Host "  提示：当前是否管理员 = $(if (Test-Admin) { '是' } else { '否' })"
    exit 1
}

# ---------------------------------------------------------------- 安装

Write-Info "Installing $PackageName via npm"
Write-Info "Using registry: $Registry"

if ($DryRun) {
    Write-Info "[dry-run] 将执行: $npmExe install -g $PackageName --registry $Registry"
    exit 0
}

& $npmExe install -g $PackageName --registry $Registry
if ($LASTEXITCODE -ne 0) {
    Write-ErrorMessage "npm install failed with exit code $LASTEXITCODE"
    Write-Host '   常见原因：'
    Write-Host '   - E401 / E403：Nexus 未开放匿名读，或发布账号无权限（找维护者）'
    Write-Host '   - E404：包未发布，或 npm-hosted 未加入 npm-group 聚合成员'
    Write-Host '   - ETIMEDOUT：不在公司内网 / 未连 VPN'
    Write-Host '   - EPERM / EACCES：全局目录不可写，以管理员身份重跑；不要改用 --prefix 绕开'
    exit 1
}

# ---------------------------------------------------------------- 验证

# npm 全局 bin 目录可能尚未进入当前进程的 PATH，直接定位刚装好的入口更可靠
$polarisEntry = $null
if (-not [string]::IsNullOrWhiteSpace($globalPrefix)) {
    $candidate = Join-Path $globalPrefix 'polaris.cmd'
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

# 伴生 CLI 由 polaris init 按需安装（全局不可写时落 %USERPROFILE%\.polaris\cli）。
# 这里只提示管理员可选预装，省掉每个使用者首次 init 的下载等待。
$MissingDeps = @()
if (-not (Get-Command openspec -ErrorAction SilentlyContinue)) {
    $MissingDeps += $OpenSpecPackage
}
if (-not (Get-Command codegraph -ErrorAction SilentlyContinue)) {
    $MissingDeps += '@colbymchenry/codegraph@latest'
}
if ($MissingDeps.Count -gt 0) {
    Write-Host ''
    Write-Host '可选：顺手预装伴生 CLI（不装也行，polaris init 会自动装到用户目录）：'
    Write-Host "    $npmExe install -g $($MissingDeps -join ' ') --registry $Registry"
    Write-Host ''
    Write-Host '注意：初始化项目必须由普通用户执行，不要用管理员身份跑 polaris init。'
}

Write-Host ''
Write-Host 'Next steps:'
Write-Host '    polaris init <path>   # 在目标项目中初始化 Polaris Flow 工作流'
Write-Host '    polaris --version     # 提示找不到命令时，关掉终端重开'
Write-Host '    polaris --help        # 查看全部命令'
