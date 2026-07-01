import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LANGUAGES = ['en', 'zh'] as const;

export type Language = (typeof LANGUAGES)[number];

/** 翻译 key，加载后由 messages.yaml 动态确定 */
export type TranslationKey = string;

/** 加载完成后从 YAML 导出的全部 key */
export let TRANSLATION_KEYS: readonly string[] = [];

let translations: Record<Language, Record<string, string>> | null = null;

function getDefaultConfigPath(): string {
  return path.resolve(__dirname, 'messages.yaml');
}

function normalizeLanguage(lang: string | undefined): Language {
  return lang === 'zh' ? 'zh' : 'en';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseTranslationEntry(
  key: string,
  value: unknown,
  configPath: string,
): Record<Language, string> {
  if (!isRecord(value)) {
    throw new Error(
      `i18n config key "${key}" must be an object with en/zh strings in ${configPath}`,
    );
  }

  const result = {} as Record<Language, string>;

  for (const language of LANGUAGES) {
    const text = value[language];
    if (typeof text !== 'string') {
      throw new Error(`i18n config key "${key}" missing "${language}" in ${configPath}`);
    }
    result[language] = text;
  }

  return result;
}

function parseMessagesYaml(
  raw: string,
  configPath: string,
): Record<Language, Record<string, string>> {
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`i18n config YAML parse error in ${configPath}: ${message}`, { cause: error });
  }

  if (!isRecord(parsed)) {
    throw new Error(`i18n config root must be an object in ${configPath}`);
  }

  const en: Record<string, string> = {};
  const zh: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'version') {
      continue;
    }

    const entry = parseTranslationEntry(key, value, configPath);
    en[key] = entry.en;
    zh[key] = entry.zh;
  }

  if (Object.keys(en).length === 0) {
    throw new Error(`i18n config contains no translation keys in ${configPath}`);
  }

  return { en, zh };
}

function finalizeKeys(en: Record<string, string>): void {
  TRANSLATION_KEYS = Object.freeze(Object.keys(en));
}

/** 从 YAML 加载 i18n 配置并写入内存缓存 */
export async function loadI18n(configPath?: string): Promise<void> {
  const filePath = configPath ?? getDefaultConfigPath();
  const raw = await readFile(filePath, 'utf-8');
  translations = parseMessagesYaml(raw, filePath);
  finalizeKeys(translations.en);
}

export function isI18nLoaded(): boolean {
  return translations !== null;
}

export function t(lang: string | undefined, key: TranslationKey): string {
  if (!translations) {
    throw new Error('i18n not loaded, call loadI18n() first');
  }

  const language = normalizeLanguage(lang);
  const text = translations[language][key] ?? translations.en[key];

  if (text === undefined) {
    throw new Error(`i18n unknown key "${key}"`);
  }

  return text;
}
