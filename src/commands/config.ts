/**
 * `polaris-flow config get`：读取 `.polaris/config.yaml` 中的配置项。
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
 * 读取指定配置键并输出到 stdout。
 * 当前仅支持 `language`；未知键返回 exit 2。
 */
export async function configGetCommand(
  key: string,
  projectPath: string,
  options: ConfigGetOptions = {},
): Promise<void> {
  const cwd = path.resolve(projectPath || process.cwd());
  const normalizedKey = key.trim();

  if (normalizedKey !== 'language') {
    const payload = { error: `unsupported config key: ${normalizedKey}`, supported: ['language'] };
    if (options.json) {
      console.log(JSON.stringify(payload));
    } else {
      console.error(payload.error);
    }
    process.exitCode = 2;
    return;
  }

  const config = await loadPolarisConfig(cwd);
  const language = normalizeConfigLanguageId(config?.language);
  const languageName = resolveLanguageName(language);

  if (options.json) {
    console.log(JSON.stringify({ language, language_name: languageName }));
    return;
  }

  console.log(language);
}
