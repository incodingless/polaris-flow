import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it, vi } from 'vitest';

import {
  TRANSLATION_KEYS,
  isI18nLoaded,
  loadI18n,
  t,
} from '../../src/commands/i18n/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', 'fixtures', 'i18n');
const validFixture = path.join(fixturesDir, 'messages.yaml');

describe('i18n', () => {
  it('loads valid fixture and returns Chinese translation', async () => {
    await loadI18n(validFixture);
    expect(isI18nLoaded()).toBe(true);
    expect(t('zh', 'settingUp')).toBe('正在设置 Comet：');
  });

  it('defaults to English when language is undefined', async () => {
    await loadI18n(validFixture);
    expect(t(undefined, 'settingUp')).toBe('Setting up Comet in');
  });

  it('exports TRANSLATION_KEYS from loaded YAML', async () => {
    await loadI18n(validFixture);
    expect(TRANSLATION_KEYS.length).toBeGreaterThan(0);
    for (const key of TRANSLATION_KEYS) {
      expect(t('en', key)).toBeTypeOf('string');
      expect(t('zh', key)).toBeTypeOf('string');
    }
  });

  it('production messages.yaml loads and exposes all keys', async () => {
    const productionYaml = path.join(
      __dirname,
      '..',
      '..',
      'src',
      'commands',
      'i18n',
      'messages.yaml',
    );
    await loadI18n(productionYaml);
    expect(TRANSLATION_KEYS.length).toBeGreaterThan(0);
    for (const key of TRANSLATION_KEYS) {
      expect(t('en', key)).toBeTypeOf('string');
      expect(t('zh', key)).toBeTypeOf('string');
    }
  });

  it('throws when zh sub-key is missing', async () => {
    await expect(loadI18n(path.join(fixturesDir, 'missing-zh.yaml'))).rejects.toThrow(
      /missing "zh"/,
    );
  });

  it('throws when a translation entry is missing zh', async () => {
    await expect(loadI18n(path.join(fixturesDir, 'key-mismatch.yaml'))).rejects.toThrow(
      /missing "zh"/,
    );
  });

  it('throws on invalid entry structure', async () => {
    await expect(loadI18n(path.join(fixturesDir, 'invalid-entry.yaml'))).rejects.toThrow(
      /missing "en"/,
    );
  });

  it('throws when t() is called with unknown key', async () => {
    await loadI18n(validFixture);
    expect(() => t(undefined, 'nonExistentKey')).toThrow(/unknown key "nonExistentKey"/);
  });

  it('throws when t() is called before loadI18n()', async () => {
    vi.resetModules();
    const fresh = await import('../../src/commands/i18n/index.js');
    expect(() => fresh.t(undefined, 'settingUp')).toThrow(/i18n not loaded/);
  });
});
