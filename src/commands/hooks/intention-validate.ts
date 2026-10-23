/**
 * `polaris intention-validate` 命令。
 */
import { runIntentionValidate } from '../../core/hooks/intention-validate.js';

/** 运行 intention-validate：stdout JSON / stderr 阻断信息 / exitCode */
export async function intentionValidateCommand(filePath: string): Promise<void> {
  const result = await runIntentionValidate(filePath);
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[intention-validate] 阻断：${result.message}`);
  }
  process.exitCode = result.exitCode;
}