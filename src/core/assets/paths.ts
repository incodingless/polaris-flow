/**
 * 解析仓库内 assets/ 目录绝对路径。
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 返回发布包/仓库根下的 assets 目录 */
export function getAssetsDir(): string {
  return path.resolve(__dirname, '..', '..', '..', 'assets');
}
