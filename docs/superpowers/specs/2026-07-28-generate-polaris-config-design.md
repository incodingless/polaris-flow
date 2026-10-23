# Design: generatePolarisConfig 从模板生成项目配置

日期：2026-07-28  
状态：已批准（待实现）

## 目标

在 `generatePolarisConfig`（`src/core/install.ts`）中，基于 `assets/shared/templates/config.example.yaml` 生成 `.polaris/config.yaml`：读模板 → 覆盖运行时字段 → 写盘，并尽量保留模板注释。

## 非目标

- 不在本次写入 `plugin_root`、`plugins` 版本等模板外字段
- 不合并已有配置的旧值（overwrite 时整文件按模板重生）
- 不改动 `createDefaultProjectPolarisConfig` / `formatPolarisConfigYaml`（旧路径可后续清理）
- 不实现 `generateWorkflowConfig`（保持既有未实现状态，除非另开任务）

## 决策摘要

| 项 | 选择 |
|----|------|
| 生成策略 | 读模板 → 解析 → 覆盖动态字段 → 写回 |
| 注释 | 保留（`yaml` Document API + `keepSourceTokens`） |
| 动态字段 | `language`、`platform`、`scope`、`install-time`、`main-repo-root`、`worktree-dir` |
| 其余字段 | 原样保留模板默认值 |
| 实现手段 | `yaml` `parseDocument`（方案 1） |

## 写盘条件

| 条件 | 行为 |
|------|------|
| config 不存在 | 从模板生成并写入 |
| config 已存在且 `overwrite === false` | 跳过，不改文件 |
| config 已存在且 `overwrite === true` | 整文件按模板重新生成，再覆盖 6 个动态字段（不合并旧值） |

`overwrite` 默认 `false`，从 `polaris init` 的 `InitOptions.overwrite` 传入：

`initPolarisConfig(..., overwrite)` → `generatePolarisConfig(..., overwrite)`。

## 流程

1. 解析目标路径 `getPolarisConfigPath(projectPath)`
2. 若文件存在且非 overwrite → return
3. `readFile(getConfigExampleYamlSrc(), 'utf-8')`
4. `parseDocument(text, { keepSourceTokens: true })`
5. 覆盖字段：
   - `language` ← 入参 `language`
   - `platform` ← `platforms.map((p) => p.id)`（模板值为平台 id，如 `trae`，非展示名）
   - `scope` ← 入参 `scope`
   - `install-time` ← `new Date().toISOString()`
   - `main-repo-root` ← `path.resolve(projectPath)`
   - `worktree-dir` ← `resolveWorktreeRoot(projectPath, scope)`
6. `writeFile(configPath, String(doc) + 保证末尾换行)`；**不**使用 `writeYamlFile`（会丢注释）
7. 移除当前半成品逻辑（未完成的 `copyIfMissing` + 未定义 `config` 对象等）

## 代码落点

- 主逻辑：`src/core/install.ts` 内 `generatePolarisConfig`
- 可选：同文件或 `src/core/install/` 下抽出 `applyConfigTemplateOverrides(doc, …)`，便于单测
- 调用链：`src/commands/init.ts` 将 `options.overwrite` 传入 `initPolarisConfig`
- 路径工具复用：`getConfigExampleYamlSrc`、`getPolarisConfigPath`、`resolveWorktreeRoot`

## 错误处理

- 模板文件缺失或不可读 → 抛错，由 `init` 现有 catch 汇报失败
- Document 解析失败 → 抛错，不写半成品文件

## 测试

放在 `test/ts/`（如 `generate-polaris-config.test.ts` 或扩展既有 install/config 测试）：

1. 目标不存在 → 生成文件，6 个动态字段正确，模板中其它键（如 `kind`、`model`）仍在
2. 目标已存在且 `overwrite=false` → 文件内容不变
3. 目标已存在且 `overwrite=true` → 内容按新模板+新动态字段重写
4. 生成结果中仍含至少一处模板注释（如 `# 基础配置` 或字段旁行内注释）

## 与现有类型的关系

- 落盘键名保持模板的 kebab-case（`install-time`、`main-repo-root` 等）
- 运行时读取仍走 `normalizePolarisConfig`（kebab → snake），无需本次改加载逻辑
- `ProjectPolarisConfig` 类型与模板字段差异（如 `platforms` vs `platform`）不在本次对齐；加载侧若缺 `platform`→`platforms` 映射，另开任务

## 验收标准

- `polaris init` 首次安装写出完整、带注释的 `config.yaml`
- `--overwrite`（或等价 overwrite 选项）会重写该文件
- 无 overwrite 时二次 init 不破坏已有 config
