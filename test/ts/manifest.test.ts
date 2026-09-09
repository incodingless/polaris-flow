import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { readFile } from 'fs/promises';

import { loadManifestConfig, readAssets } from '../../src/core/assets/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const assetsDir = path.join(projectRoot, 'assets');

describe('manifest', () => {
  it('reads asset manifest', async () => {
    const manifest = await loadManifestConfig(assetsDir);
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.langContentDirs).toContain('skills');
  });

  it('readAssets 收集 shared hooks 与 scripts', async () => {
    const assets = await readAssets('zh');
    const hooks = assets.sharedAssets.find((a) => a.dir === 'hooks');
    const scripts = assets.sharedAssets.find((a) => a.dir === 'scripts');
    expect(hooks?.files.some((f) => f.shortPath === 'session-start.sh')).toBe(true);
    expect(scripts?.files.some((f) => f.shortPath === 'workflow-entry.sh')).toBe(true);
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
