/**
 * `revealPath` / `isWithinAllowedRoots` 的边界测试。
 *
 * 被测行为是「面板能在系统文件管理器里定位哪些路径」——这是一条安全边界，
 * 所以测试重点不是 happy path，而是**拒绝**：空白名单、白名单外、`..`。
 *
 * 放行分支会真的调 `open` / `explorer` / `xdg-open`，故 mock `node:child_process`。
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFile: (_cmd: string, _args: string[], cb: (err: Error | null) => void) => cb(null),
}));

type FilesystemApi = typeof import('../../src/dashboard/api/filesystem.js');
let api: FilesystemApi;
let tmpRoot: string;
let otherRoot: string;

beforeAll(async () => {
  api = await import('../../src/dashboard/api/filesystem.js');
  tmpRoot = mkdtempSync(path.join(os.tmpdir(), 'polaris-reveal-allowed-'));
  otherRoot = mkdtempSync(path.join(os.tmpdir(), 'polaris-reveal-other-'));
  mkdirSync(path.join(tmpRoot, 'openspec', 'changes'), { recursive: true });
  writeFileSync(path.join(tmpRoot, 'openspec', 'changes', 'a.md'), '# a\n');
  writeFileSync(path.join(otherRoot, 'secret.txt'), 'x\n');
});

describe('isWithinAllowedRoots', () => {
  it('根目录自身放行', () => {
    expect(api.isWithinAllowedRoots(tmpRoot, [tmpRoot])).toBe(true);
  });

  it('子路径放行', () => {
    expect(api.isWithinAllowedRoots(path.join(tmpRoot, 'openspec', 'changes'), [tmpRoot])).toBe(
      true,
    );
  });

  it('白名单外的兄弟目录拒绝', () => {
    expect(api.isWithinAllowedRoots(otherRoot, [tmpRoot])).toBe(false);
  });

  it('前缀相同但不是子目录时拒绝', () => {
    // `<root>-evil` 的字符串前缀包含 `<root>`，用 `'/'` 拼接判定的实现会误放行。
    const sibling = `${tmpRoot}-evil`;
    expect(sibling.startsWith(tmpRoot)).toBe(true);
    expect(api.isWithinAllowedRoots(sibling, [tmpRoot])).toBe(false);
  });

  it('空白名单拒绝任何路径（含根目录自身）', () => {
    expect(api.isWithinAllowedRoots(tmpRoot, [])).toBe(false);
  });

  it('白名单里的空串与纯空白项不构成放行', () => {
    expect(api.isWithinAllowedRoots(tmpRoot, ['', '   '])).toBe(false);
  });

  it('多根白名单里命中任一即放行', () => {
    expect(api.isWithinAllowedRoots(otherRoot, [tmpRoot, otherRoot])).toBe(true);
  });
});

describe('revealPath（fail-closed）', () => {
  it('空白名单 → 拒绝（这是本次收紧的要点：旧实现直接放行）', async () => {
    const res = await api.revealPath(tmpRoot, []);
    expect(res.ok).toBeUndefined();
    expect(res.error).toBe('缺少允许的项目根白名单');
  });

  it('不传白名单参数（默认空） → 同样拒绝', async () => {
    const res = await api.revealPath(tmpRoot);
    expect(res.error).toBe('缺少允许的项目根白名单');
  });

  it('白名单只有空串 → 拒绝', async () => {
    const res = await api.revealPath(tmpRoot, ['', '  ']);
    expect(res.error).toBe('缺少允许的项目根白名单');
  });

  it('空路径 → 拒绝', async () => {
    expect((await api.revealPath('', [tmpRoot])).error).toBe('路径不能为空');
  });

  it('含 .. 的路径 → 拒绝', async () => {
    expect((await api.revealPath(`${tmpRoot}/../etc`, [tmpRoot])).error).toBe('无效的路径');
  });

  it('白名单外路径 → 拒绝', async () => {
    const res = await api.revealPath(otherRoot, [tmpRoot]);
    expect(res.ok).toBeUndefined();
    expect(res.error).toBe('路径不在允许的项目目录内');
  });

  it('白名单外且不存在的路径 → 仍报授权失败（不泄漏存在性）', async () => {
    const res = await api.revealPath(path.join(otherRoot, 'nope'), [tmpRoot]);
    expect(res.error).toBe('路径不在允许的项目目录内');
  });

  it('白名单内但不存在 → 报路径不存在', async () => {
    const res = await api.revealPath(path.join(tmpRoot, 'nope'), [tmpRoot]);
    expect(res.error).toContain('路径不存在');
  });

  it('白名单内的子路径 → 放行（execFile 已 mock）', async () => {
    const res = await api.revealPath(path.join(tmpRoot, 'openspec'), [tmpRoot]);
    expect(res.error).toBeUndefined();
    expect(res.ok).toBe(true);
  });

  it('白名单根自身 → 放行', async () => {
    const res = await api.revealPath(tmpRoot, [tmpRoot]);
    expect(res.ok).toBe(true);
  });
});
