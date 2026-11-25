/**
 * polaris-preseed.cjs 单测：离线介质预种环节对三包 tgz 的处理。
 * 用临时 HOME + 子进程运行脚本，避免污染测试机真实的 ~/.polaris。
 * tar 流在测试内手工构造，不依赖系统 tar，macOS / Linux / Windows 均可跑。
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const preseedScript = path.join(projectRoot, 'devops/polaris-preseed.cjs');

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 建一个隔离的 HOME 与 bundle 骨架 */
function makeSandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'polaris-preseed-test-'));
  tempDirs.push(root);
  const home = path.join(root, 'home');
  const bundle = path.join(root, 'bundle');
  const components = path.join(bundle, 'components');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(components, { recursive: true });
  return { root, home, bundle, components };
}

/** 在沙箱 HOME 下运行 preseed */
function runPreseed(bundle: string, home: string) {
  return spawnSync(process.execPath, [preseedScript, bundle], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: 'utf8',
  });
}

/**
 * 手工构造 tgz：写 tar 头（含校验和）+ 512 对齐的数据块，再 gzip。
 * 只覆盖 preseed 会处理的普通文件与目录条目，不依赖外部命令。
 */
function createTgz(entries: Array<{ name: string; content?: string | Buffer; type?: string }>) {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, 'utf8');
    header[156] = entry.type ? entry.type.charCodeAt(0) : 0x30;
    const data =
      typeof entry.content === 'string'
        ? Buffer.from(entry.content, 'utf8')
        : (entry.content ?? Buffer.alloc(0));
    header.write(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    // 校验和字段先填空格参与求和，再按 tar 规范写回八进制值
    header.fill(0x20, 148, 156);
    const sum = header.reduce((acc, byte) => acc + byte, 0);
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
    blocks.push(header);
    if (data.length > 0) {
      const padded = Buffer.alloc(Math.ceil(data.length / 512) * 512);
      data.copy(padded);
      blocks.push(padded);
    }
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks));
}

/** 写入一个内容最简的 npm CLI tgz（本地通道只需 npm i -g，内容不参与测试） */
function writeCliTgz(dir: string, name: string) {
  fs.writeFileSync(path.join(dir, name), createTgz([{ name: 'package.json', content: '{}' }]));
}

describe('polaris-preseed 离线预种', () => {
  it('三包 local-paths 写入正确，superpowers 解包成目录', () => {
    const s = makeSandbox();
    writeCliTgz(s.components, 'openspec-1.16.1.tgz');
    writeCliTgz(s.components, 'openspec-2.1.1.tgz');
    writeCliTgz(s.components, 'codegraph-1.6.4.tgz');
    fs.writeFileSync(
      path.join(s.components, 'superpowers-7.0.1.tgz'),
      createTgz([
        { name: 'skills/', type: '5' },
        { name: 'skills/brainstorming/', type: '5' },
        { name: 'skills/brainstorming/SKILL.md', content: '# 头脑风暴' },
      ]),
    );
    fs.writeFileSync(path.join(s.bundle, 'config.ini'), 'POLARIS_NPM_REGISTRY = http://nexus/\n');

    const result = runPreseed(s.bundle, s.home);
    expect(result.status).toBe(0);

    const dest = path.join(s.home, '.polaris', 'components');
    const yaml = fs.readFileSync(path.join(s.home, '.polaris', 'polaris.yaml'), 'utf8');
    // 多版本按数字版本比较选最高，而非字典序
    expect(yaml).toContain(`openspec: "${path.join(dest, 'openspec-2.1.1.tgz')}"`);
    expect(yaml).toContain(`codegraph: "${path.join(dest, 'codegraph-1.6.4.tgz')}"`);
    // superpowers 解包后目录优先，local-paths 指向目录而非 tgz
    expect(yaml).toContain(`superpowers: "${path.join(dest, 'superpowers')}"`);
    expect(
      fs.readFileSync(path.join(dest, 'superpowers/skills/brainstorming/SKILL.md'), 'utf8'),
    ).toBe('# 头脑风暴');
  });

  it('重复执行幂等，解包目录不残留上一版文件', () => {
    const s = makeSandbox();
    const tgzPath = path.join(s.components, 'superpowers-7.0.1.tgz');
    fs.writeFileSync(
      tgzPath,
      createTgz([
        { name: 'skills/', type: '5' },
        { name: 'skills/old.md', content: '旧版' },
      ]),
    );
    expect(runPreseed(s.bundle, s.home).status).toBe(0);

    fs.writeFileSync(
      tgzPath,
      createTgz([
        { name: 'skills/', type: '5' },
        { name: 'skills/new.md', content: '新版' },
      ]),
    );
    expect(runPreseed(s.bundle, s.home).status).toBe(0);

    const skillsDir = path.join(s.home, '.polaris', 'components', 'superpowers', 'skills');
    expect(fs.readdirSync(skillsDir)).toEqual(['new.md']);
  });

  it('拒绝路径穿越、绝对路径、符号链接与 AppleDouble 条目', () => {
    const s = makeSandbox();
    fs.writeFileSync(
      path.join(s.components, 'superpowers-7.0.1.tgz'),
      createTgz([
        { name: 'skills/', type: '5' },
        { name: 'skills/SKILL.md', content: '正常条目' },
        // 以下四类都应被解包器丢弃
        { name: '../evil.txt', content: '越界' },
        { name: '/abs.txt', content: '绝对路径' },
        { name: 'link.txt', type: '2' },
        { name: '._meta', content: 'AppleDouble' },
      ]),
    );

    const result = runPreseed(s.bundle, s.home);
    expect(result.status).toBe(0);

    const dest = path.join(s.home, '.polaris', 'components', 'superpowers');
    expect(fs.readdirSync(dest)).toEqual(['skills']);
    expect(fs.existsSync(path.join(s.home, '.polaris', 'evil.txt'))).toBe(false);
    expect(fs.existsSync(path.join(s.home, '.polaris', 'components', 'abs.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dest, 'link.txt'))).toBe(false);
    expect(fs.existsSync(path.join(dest, '._meta'))).toBe(false);
  });
});
