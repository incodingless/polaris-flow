/**
 * renderYamlTemplate：模板分发时按 keepComments 决定是否留下注释。
 * removeYamlTopLevelKeys：就地清理废弃键，不动其余内容与注释。
 */
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';

import { removeYamlTopLevelKeys, renderYamlTemplate } from '../../src/utils/yaml-io.js';

const TEMPLATE = `# 标题
foo: 1  # 行内
bar: []
`;

describe('renderYamlTemplate', () => {
  it('keepComments 且不改文档时原样保留注释', () => {
    expect(renderYamlTemplate(TEMPLATE, { keepComments: true })).toBe(TEMPLATE);
  });

  it('keepComments 为 false 时丢掉注释，改字段仍然生效', () => {
    const text = renderYamlTemplate(TEMPLATE, {
      keepComments: false,
      transform: (doc) => {
        doc.set('foo', 2);
      },
    });
    expect(text).not.toMatch(/^\s*#/m);
    expect(text).not.toContain('行内');
    expect(text).toContain('foo: 2');
    expect(text).toContain('bar:');
  });

  it('keepComments 为 true 且改字段时注释还在', () => {
    const text = renderYamlTemplate(TEMPLATE, {
      keepComments: true,
      transform: (doc) => {
        doc.set('foo', 2);
      },
    });
    expect(text).toContain('# 标题');
    expect(text).toContain('foo: 2');
  });

  it('workflow 模板去掉注释后仍留下五个游标列表', async () => {
    const { readFile } = await import('fs/promises');
    const { getWorkflowTemplateYamlSrc } = await import('../../src/core/assets/manifest.js');
    const raw = await readFile(getWorkflowTemplateYamlSrc(), 'utf-8');
    expect(raw).toMatch(/^\s*#/m);
    const text = renderYamlTemplate(raw, { keepComments: false });
    expect(text).not.toMatch(/^\s*#/m);
    expect(text).toContain('coding_tasks:');
    expect(text).toContain('requirement_tasks:');
    expect(text).toContain('testcase_tasks:');
    expect(text).toContain('prototype_tasks:');
    expect(text).toContain('debug_tasks:');
  });
});

describe('removeYamlTopLevelKeys', () => {
  async function writeTemp(content: string): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'polaris-yaml-'));
    const file = path.join(dir, 'config.yaml');
    await writeFile(file, content, 'utf-8');
    return file;
  }

  it('删掉目标键，保留其余键与注释', async () => {
    const file = await writeTemp(
      ['# 配置说明', 'version: "1"', 'plugins:', '  - id: a', '', 'port: 1', ''].join('\n'),
    );
    expect(await removeYamlTopLevelKeys(file, ['plugins'])).toBe(true);

    const text = await readFile(file, 'utf-8');
    expect(text).not.toContain('plugins');
    expect(text).not.toContain('id: a');
    expect(text).toContain('# 配置说明');
    expect(text).toContain('version: "1"');
    expect(text).toContain('port: 1');
  });

  it('键不存在时不写文件（返回 false，mtime 不变）', async () => {
    const file = await writeTemp('version: "1"\n');
    expect(await removeYamlTopLevelKeys(file, ['plugins'])).toBe(false);
  });

  it('文件不存在时返回 false 而不抛', async () => {
    expect(await removeYamlTopLevelKeys(path.join(os.tmpdir(), 'nope-xyz.yaml'), ['plugins'])).toBe(
      false,
    );
  });
});
