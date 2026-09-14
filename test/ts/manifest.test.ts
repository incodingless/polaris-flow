import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { readFile } from 'fs/promises';

import {
  isIgnoredAssetPath,
  loadManifestConfig,
  normalizeIgnoredFiles,
  readAssets,
} from '../../src/core/assets/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const assetsDir = path.join(projectRoot, 'assets');

describe('manifest', () => {
  it('reads asset manifest', async () => {
    const manifest = await loadManifestConfig(assetsDir);
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.langContentDirs).toContain('skills');
    expect(manifest.ignoredFiles).toEqual(expect.arrayContaining(['README.md', '.DS_Store']));
  });

  it('readAssets 收集 shared hooks 与 scripts', async () => {
    const assets = await readAssets('zh');
    const hooks = assets.sharedAssets.find((a) => a.dir === 'hooks');
    const scripts = assets.sharedAssets.find((a) => a.dir === 'scripts');
    expect(hooks?.files.some((f) => f.shortPath === 'session-start.sh')).toBe(true);
    expect(scripts?.files.some((f) => f.shortPath === 'workflow-entry.sh')).toBe(true);
  });

  it('readAssets 按 ignoredFiles 跳过任意层级 README.md 与 .DS_Store', async () => {
    const assets = await readAssets('zh');
    const skills = assets.langDirAssets.find((a) => a.dir === 'skills');
    expect(skills).toBeTruthy();
    expect(skills!.files.some((f) => f.shortPath.replace(/\\/g, '/').endsWith('README.md'))).toBe(
      false,
    );
    expect(skills!.files.some((f) => f.shortPath.replace(/\\/g, '/').endsWith('.DS_Store'))).toBe(
      false,
    );
    expect(
      skills!.files.some((f) => f.shortPath.replace(/\\/g, '/') === 'coding/specify/SKILL.md'),
    ).toBe(true);

    const hooks = assets.sharedAssets.find((a) => a.dir === 'hooks');
    expect(hooks?.files.some((f) => f.shortPath === 'README.md')).toBe(false);
  });
});

describe('isIgnoredAssetPath', () => {
  it('精确 / basename / 目录树同名均命中', () => {
    const ignored = normalizeIgnoredFiles([
      'skills/README.md',
      'skills/.DS_Store',
      'README.md',
    ]);
    expect(isIgnoredAssetPath('skills/README.md', ignored)).toBe(true);
    expect(isIgnoredAssetPath('skills/prd/README.md', ignored)).toBe(true);
    expect(isIgnoredAssetPath('skills/coding/design/.DS_Store', ignored)).toBe(true);
    expect(isIgnoredAssetPath('hooks/README.md', ignored)).toBe(true);
    expect(isIgnoredAssetPath('coding/specify/SKILL.md', ignored)).toBe(false);
  });
});

describe('workflow fixture', () => {
  it('parses workflow yaml structure', async () => {
    const raw = await readFile(
      path.join(__dirname, '..', 'fixtures', 'workflow', 'workflow.yaml'),
      'utf-8',
    );
    const parsed = parseYaml(raw) as {
      change_tasks: Array<{ task_id: string; phase: string }>;
    };
    expect(parsed.change_tasks[0]?.task_id).toBe('add-feature-x');
    expect(parsed.change_tasks[0]?.phase).toBe('plan');
  });
});
