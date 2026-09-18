/**
 * dashboard：polaris-web 路径解析单测。
 */
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { resolvePolarisWebRoot } from '../../src/dashboard/server.js';

describe('resolvePolarisWebRoot', () => {
  it('优先使用 POLARIS_WEB_PATH', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-web-env-'));
    await mkdir(path.join(root, 'scripts'), { recursive: true });
    await writeFile(path.join(root, 'package.json'), '{}\n', 'utf-8');
    await writeFile(path.join(root, 'scripts', 'dev.sh'), '#!/bin/bash\n', 'utf-8');

    const resolved = resolvePolarisWebRoot('/nonexistent/pkg', '/nonexistent/cwd', {
      POLARIS_WEB_PATH: root,
    });
    expect(resolved).toBe(path.resolve(root));
  });

  it('找不到时返回 null', () => {
    expect(
      resolvePolarisWebRoot('/tmp/no-pkg', '/tmp/no-cwd', { POLARIS_WEB_PATH: '' }),
    ).toBeNull();
  });
});
