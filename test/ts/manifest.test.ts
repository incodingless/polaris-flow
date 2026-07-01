import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { readFile } from 'fs/promises';

import { readAssetManifest, resolveManifestAssets } from '../../src/core/manifest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const assetsDir = path.join(projectRoot, 'assets');

describe('manifest', () => {
  it('reads asset manifest', async () => {
    const manifest = await readAssetManifest(assetsDir);
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.langContentDirs).toContain('skills');
  });

  it('resolves empty skills when assets dirs are missing', async () => {
    const resolved = await resolveManifestAssets(assetsDir, 'en');
    expect(Array.isArray(resolved.skills)).toBe(true);
    expect(resolved.version).toBe('0.1.0');
  });
});

describe('workflow fixture', () => {
  it('parses workflow yaml structure', async () => {
    const raw = await readFile(
      path.join(__dirname, '..', 'fixtures', 'workflow', 'workflow.yaml'),
      'utf-8',
    );
    const parsed = parseYaml(raw) as { changes: Array<{ id: string }> };
    expect(parsed.changes[0]?.id).toBe('add-feature-x');
  });
});
