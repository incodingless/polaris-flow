/**
 * `polaris-flow config get`：读取 `.polaris/config.yaml` 中的配置项。
 *
 * 读取口径分两类：
 * - `language`：**特殊**——输出归一化 ID（`zh` / `en`），`--json` 附显示名；
 *   这是 `scripts/get-language-name.mjs` 依赖的既有契约，不得改。
 * - 其他键：按**点路径**读取（`platform` / `test.commands.unit` / `scorer.weights` /
 *   `constitution_required` / `kind` …）。标量直接打印，对象 / 数组打印 JSON；
 *   路径不存在 → 退出码 2。
 *
 * 为什么泛化：技能此前只能「用自然语言读 config.yaml」，即由执行者直接解析 YAML ——
 * 一旦缩进 / 引号 / 嵌套写法变化就静默读到错值。收成一条只读命令后，读取口径只有一处。
 */
import path from 'path';

import {
  LANGUAGE_CODES,
  LANGUAGES,
  type Languages,
  loadPolarisConfig,
} from '../core/config/polaris-project-config.js';

export type ConfigGetOptions = {
  json?: boolean;
};

/** 将配置中的语言 ID 规范化为 en | zh */
export function normalizeConfigLanguageId(raw: string | undefined): Languages {
  const value = raw?.trim();
  if (!value) {
    return 'zh';
  }
  if (value === 'zh-CN' || value === 'zh_CN' || value === 'zh-cn') {
    return 'zh';
  }
  if (value === 'en-US' || value === 'en_US' || value === 'en-us') {
    return 'en';
  }
  if (LANGUAGE_CODES.includes(value as Languages)) {
    return value as Languages;
  }
  return 'zh';
}

/** 将语言 ID 翻译为 manifest 中的显示名称 */
export function resolveLanguageName(languageId: Languages): string {
  const match = LANGUAGES.find((entry) => entry.code === languageId);
  return match?.name ?? languageId;
}

/**
 * 按点路径读取配置值；缺失返回 undefined。
 * 只穿透对象层，不索引数组（与 `task-state-entry get` 的口径一致）。
 */
export function getConfigByPath(obj: unknown, dotted: string): unknown {
  if (!dotted) return undefined;
  let cur: unknown = obj;
  for (const part of dotted.split('.').filter(Boolean)) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * 读取指定配置键并输出到 stdout。
 * 未知路径返回 exit 2（**不**静默输出空串——静默会让调用方以为「配了但为空」）。
 */
export async function configGetCommand(
  key: string,
  projectPath: string,
  options: ConfigGetOptions = {},
): Promise<void> {
  const cwd = path.resolve(projectPath || process.cwd());
  const normalizedKey = key.trim();
  const config = await loadPolarisConfig(cwd);

  if (normalizedKey === 'language') {
    const language = normalizeConfigLanguageId(config?.language);
    const languageName = resolveLanguageName(language);
    if (options.json) {
      console.log(JSON.stringify({ language, language_name: languageName }));
      return;
    }
    console.log(language);
    return;
  }

  const value = getConfigByPath(config, normalizedKey);
  if (value === undefined) {
    const payload = {
      error: `config key not found: ${normalizedKey}`,
      hint: '按点路径读取，如 platform / test.commands.unit / scorer.weights',
    };
    if (options.json) {
      console.log(JSON.stringify(payload));
    } else {
      console.error(payload.error);
    }
    process.exitCode = 2;
    return;
  }

  if (options.json) {
    console.log(JSON.stringify({ [normalizedKey]: value }));
    return;
  }
  console.log(typeof value === 'object' ? JSON.stringify(value) : String(value));
}
