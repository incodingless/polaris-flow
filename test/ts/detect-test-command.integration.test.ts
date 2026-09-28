/**
 * detect-test-command.sh 集成测试：驱动 test/shell/detect-test-command.sh 的回归夹具。
 *
 * 夹具本身是纯 bash（可手动跑：`bash test/shell/detect-test-command.sh`），
 * 这里只负责让它进入 `npx vitest run`，使这批复现场景在 CI 里真的被执行。
 * 断言数少于预期会失败——防止场景被删掉后无人察觉。
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '../..');
const fixture = path.join(projectRoot, 'test/shell/detect-test-command.sh');
const scriptUnderTest = path.join(projectRoot, 'assets/shared/scripts/detect-test-command.sh');

/** 夹具输出带 ANSI 颜色，断言前先剥掉。 */
function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function runFixture(cwd: string = projectRoot): { status: number | null; output: string } {
  const result = spawnSync('bash', [fixture], { cwd, encoding: 'utf-8' });
  return { status: result.status, output: stripAnsi(`${result.stdout}${result.stderr}`) };
}

const EXPECTED_CASES = 44;

describe('detect-test-command.sh 回归夹具', () => {
  it('被测脚本存在（夹具的运行前提）', () => {
    expect(existsSync(scriptUnderTest)).toBe(true);
  });

  it(`${EXPECTED_CASES} 个回归场景全绿`, () => {
    const { status, output } = runFixture();
    const counts = output.match(/通过 (\d+) \/ 失败 (\d+)/);
    expect(counts, `夹具未输出统计行：\n${output}`).not.toBeNull();

    const passed = Number(counts![1]);
    const failed = Number(counts![2]);
    expect(failed, `夹具失败用例：\n${output}`).toBe(0);
    expect(
      passed,
      `场景数变少（${passed} < ${EXPECTED_CASES}）——是删了场景，还是夹具提前退出了？\n${output}`,
    ).toBeGreaterThanOrEqual(EXPECTED_CASES);
    expect(status, output).toBe(0);
  });

  it('从任意 CWD 运行仍能自定位被测脚本', () => {
    const { status, output } = runFixture('/');
    expect(status, output).toBe(0);
  });
});
