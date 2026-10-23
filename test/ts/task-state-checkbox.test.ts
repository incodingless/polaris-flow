/**
 * `task-state-entry set-checkbox` 单测。
 *
 * 这个 op 的存在理由是「面板勾选任务时不允许 API 直改文件」—— 勾选必须经原语、
 * 持 `.polaris/.locks/task-state-<id>.lock`，并在**同一次锁内**把 `state.yaml` 的
 * `runtime.build` 计数一起改掉。所以测试的重点是三条：
 *
 *   1. **字节保真**：只动目标行的复选框字符，缩进 / 正文 / 行尾一律不动
 *      （`tasks.md` 是人写的文件，重排会污染 diff）
 *   2. **不改盘的情形**：幂等、越界、文件不存在、路径越界 —— 都不能留下半成品
 *   3. **计数同步**：有 `runtime.build` 才同步；没有（debug 族）则**不得新建**
 *      （`loadStateObject` 缺失返回 `{}`，无脑回写会凭空造出一个空 state.yaml）
 */
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applySetCheckbox,
  countCheckboxes,
  CheckboxError,
} from '../../src/core/hooks/tasks-checkbox.js';
import { runTaskStateEntry } from '../../src/core/hooks/task-state-entry.js';

const TASKS_MD = [
  '# 任务',
  '',
  '## 第一批',
  '- [ ] 第一步',
  '  - [x] 子步骤（缩进两格）',
  '- [ ] 第三步',
  '',
].join('\n');

describe('applySetCheckbox（纯函数）', () => {
  it('勾选后其余字节逐字节不变', () => {
    const res = applySetCheckbox(TASKS_MD, 0, true);
    expect(res.changed).toBe(true);
    expect(res.before).toBe(false);
    expect(res.after).toBe(true);
    expect(res.content).toBe(TASKS_MD.replace('- [ ] 第一步', '- [x] 第一步'));
    // 逐行比对：只有第 4 行（0-based 3）不同
    const before = TASKS_MD.split('\n');
    const after = res.content.split('\n');
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      if (i === 3) continue;
      expect(`${i}:${after[i]}`).toBe(`${i}:${before[i]}`);
    }
  });

  it('序号按「第几个复选框」计，不受标题与空行影响', () => {
    // 第 2 个复选框是缩进两格那行
    const res = applySetCheckbox(TASKS_MD, 1, false);
    expect(res.lineNo).toBe(4);
    expect(res.content).toContain('  - [ ] 子步骤（缩进两格）');
    expect(res.content).toContain('- [ ] 第一步');
  });

  it('幂等：已是目标值时 changed=false 且内容完全不变', () => {
    const res = applySetCheckbox(TASKS_MD, 1, true);
    expect(res.changed).toBe(false);
    expect(res.content).toBe(TASKS_MD);
  });

  it('大写 [X] 视为已勾选，设 true 不产生改动', () => {
    const res = applySetCheckbox('- [X] 甲\n', 0, true);
    expect(res.changed).toBe(false);
    expect(res.content).toBe('- [X] 甲\n');
  });

  it('序号越界抛 CheckboxError 并报出总数', () => {
    expect(() => applySetCheckbox(TASKS_MD, 3, true)).toThrow(CheckboxError);
    expect(() => applySetCheckbox(TASKS_MD, 3, true)).toThrow(/共 3 个复选框/);
  });

  it('负序号或非整数抛错', () => {
    expect(() => applySetCheckbox(TASKS_MD, -1, true)).toThrow(CheckboxError);
    expect(() => applySetCheckbox(TASKS_MD, 1.5, true)).toThrow(CheckboxError);
  });

  it('CRLF 行尾保留', () => {
    const crlf = '# 任务\r\n- [ ] 甲\r\n- [ ] 乙\r\n';
    const res = applySetCheckbox(crlf, 1, true);
    expect(res.content).toBe('# 任务\r\n- [ ] 甲\r\n- [x] 乙\r\n');
  });

  it('无复选框时任何序号都越界', () => {
    expect(() => applySetCheckbox('# 只有标题\n', 0, true)).toThrow(/共 0 个复选框/);
  });
});

describe('countCheckboxes', () => {
  it('统计总数与已完成数；无复选框返回 null', () => {
    expect(countCheckboxes(TASKS_MD)).toEqual({ total: 3, done: 1 });
    expect(countCheckboxes('# 无复选框\n')).toBeNull();
  });
});

describe('runTaskStateEntry set-checkbox', () => {
  let root: string;
  let statePath: string;
  let tasksPath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'polaris-checkbox-'));
    statePath = path.join(root, '.polaris', 'tasks', 'feat-a', 'state.yaml');
    tasksPath = path.join(root, 'openspec', 'changes', 'feat-a', 'tasks.md');
    await mkdir(path.dirname(statePath), { recursive: true });
    await mkdir(path.dirname(tasksPath), { recursive: true });
    await writeFile(
      statePath,
      [
        'kind: coding',
        'change_id: "feat-a"',
        'phase: build',
        'runtime:',
        '  build:',
        '    total_tasks: 3',
        '    completed_tasks: 1',
        '',
      ].join('\n'),
      'utf-8',
    );
    await writeFile(tasksPath, TASKS_MD, 'utf-8');
  });

  const run = (over: Record<string, unknown> = {}) =>
    runTaskStateEntry({
      op: 'set-checkbox',
      repoRoot: root,
      taskId: 'feat-a',
      kind: 'coding',
      skill: 'test',
      file: 'openspec/changes/feat-a/tasks.md',
      index: 0,
      checked: true,
      ...over,
    } as never);

  it('勾选后文件改动，且 state.yaml 计数同锁同步', async () => {
    const res = await run();
    expect(res.exitCode).toBe(0);
    expect(await readFile(tasksPath, 'utf-8')).toBe(
      TASKS_MD.replace('- [ ] 第一步', '- [x] 第一步'),
    );
    const state = await readFile(statePath, 'utf-8');
    expect(state).toContain('total_tasks: 3');
    expect(state).toContain('completed_tasks: 2');
  });

  it('幂等：重复执行不产生任何写入（mtime 不变）', async () => {
    await run();
    const fileStat = await stat(tasksPath);
    const stateStat = await stat(statePath);
    // 等 10ms 以便 mtime 变化可观测
    await new Promise((r) => setTimeout(r, 10));
    const res = await run();
    expect(res.exitCode).toBe(0);
    expect((await stat(tasksPath)).mtimeMs).toBe(fileStat.mtimeMs);
    expect((await stat(statePath)).mtimeMs).toBe(stateStat.mtimeMs);
  });

  it('state.yaml 无 runtime.build 时只改文件，不得新建 state.yaml', async () => {
    // debug 族：无 runtime.build 块
    const dbgDir = path.join(root, '.polaris', 'tasks', 'dbg-a');
    await mkdir(dbgDir, { recursive: true });
    const dbgTasks = path.join(root, 'openspec', 'changes', 'dbg-a', 'tasks.md');
    await mkdir(path.dirname(dbgTasks), { recursive: true });
    await writeFile(dbgTasks, TASKS_MD, 'utf-8');

    const res = await run({
      taskId: 'dbg-a',
      kind: 'debug',
      file: 'openspec/changes/dbg-a/tasks.md',
    });
    expect(res.exitCode).toBe(0);
    expect(await readFile(dbgTasks, 'utf-8')).toBe(
      TASKS_MD.replace('- [ ] 第一步', '- [x] 第一步'),
    );
    // 关键：不得凭空生成 state.yaml
    await expect(readFile(path.join(dbgDir, 'state.yaml'), 'utf-8')).rejects.toThrow();
  });

  it('序号越界 → 失败且文件未改动', async () => {
    const before = await readFile(tasksPath, 'utf-8');
    const res = await run({ index: 99 });
    expect(res.exitCode).toBe(3);
    expect(res.message).toMatch(/越界/);
    expect(await readFile(tasksPath, 'utf-8')).toBe(before);
  });

  it('目标文件不存在 → 失败', async () => {
    const res = await run({ file: 'openspec/changes/nope/tasks.md' });
    expect(res.exitCode).toBe(2);
    expect(res.message).toMatch(/不存在/);
  });

  it('路径越出项目根 → 失败且不读盘', async () => {
    for (const bad of ['../../etc/passwd', '/etc/passwd', 'openspec/../../etc/passwd']) {
      const res = await run({ file: bad });
      expect(res.exitCode).toBe(3);
    }
  });

  it('缺少 --index / --checked → 参数错误', async () => {
    expect((await run({ index: undefined })).exitCode).toBe(3);
    expect((await run({ checked: undefined })).exitCode).toBe(3);
  });

  it('并发勾选不同行：靠 task-state 锁串行，两条都生效', async () => {
    const [a, b] = await Promise.all([run({ index: 0 }), run({ index: 2 })]);
    expect(a.exitCode).toBe(0);
    expect(b.exitCode).toBe(0);
    const after = await readFile(tasksPath, 'utf-8');
    expect(after).toContain('- [x] 第一步');
    expect(after).toContain('- [x] 第三步');
    expect(after).toContain('  - [x] 子步骤（缩进两格）');
  });
});
