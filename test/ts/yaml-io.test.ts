/**
 * renderYamlTemplate：模板分发时按 keepComments 决定是否留下注释。
 */
import { describe, expect, it } from 'vitest';

import { renderYamlTemplate } from '../../src/utils/yaml-io.js';

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
