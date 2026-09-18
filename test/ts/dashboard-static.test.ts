/**
 * Dashboard 静态托管单测：路径解析、路径穿越防护、MIME 判定。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { contentTypeOf, resolveStaticPath } from '../../src/dashboard/static.js';

/** 造一个最小的前端产物目录 */
function fixture(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'polaris-web-root-'));
  writeFileSync(path.join(root, 'index.html'), '<div id="app"></div>');
  mkdirSync(path.join(root, 'assets'));
  writeFileSync(path.join(root, 'assets', 'index.js'), 'console.log(1)');
  return root;
}

describe('resolveStaticPath', () => {
  it('根路径映射到 index.html', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/')).toBe(path.join(root, 'index.html'));
  });

  it('命中真实文件', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/assets/index.js')).toBe(path.join(root, 'assets', 'index.js'));
  });

  it('忽略 query 串', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/assets/index.js?v=1')).toBe(
      path.join(root, 'assets', 'index.js'),
    );
  });

  it('拒绝路径穿越', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/../../etc/passwd')).toBeNull();
  });

  it('拒绝百分号编码的路径穿越', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });

  it('不存在返回 null', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/nope.js')).toBeNull();
  });

  it('目录本身返回 null', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/assets')).toBeNull();
  });

  it('非法百分号编码不抛异常', () => {
    const root = fixture();
    expect(resolveStaticPath(root, '/%zz')).toBeNull();
  });
});

describe('contentTypeOf', () => {
  it('覆盖前端产物常用类型', () => {
    expect(contentTypeOf('a.html')).toContain('text/html');
    expect(contentTypeOf('a.js')).toContain('javascript');
    expect(contentTypeOf('a.css')).toContain('text/css');
    expect(contentTypeOf('a.svg')).toContain('image/svg+xml');
    expect(contentTypeOf('a.woff2')).toContain('font/woff2');
  });

  it('大小写不敏感', () => {
    expect(contentTypeOf('a.PNG')).toBe('image/png');
  });

  it('未知扩展名回退二进制流', () => {
    expect(contentTypeOf('a.unknown')).toBe('application/octet-stream');
  });
});
