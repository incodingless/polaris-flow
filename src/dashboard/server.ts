/**
 * `polaris dashboard`：定位兄弟项目 polaris-web 并启动其本地开发栈（API + Vue）。
 * 前端在 polaris-web；API 由 polaris-web/scripts/dev.sh 拉起 polaris-cli。
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type StartDashboardOptions = {
  /** Vue 前端端口（POLARIS_WEB_PORT） */
  port: number;
  /** API 端口（POLARIS_API_PORT），默认 3700 */
  apiPort?: number;
  /** 要可视化的项目根；默认 process.cwd() */
  projectPath?: string;
  /** 启动后打开浏览器 */
  open?: boolean;
};

/**
 * 解析 polaris-flow 包根目录（含 package.json / bin）。
 */
export function resolvePackageRoot(fromUrl: string = import.meta.url): string {
  // dist/dashboard/server.js → 上两级为包根；源码直跑时同构
  return path.resolve(path.dirname(fileURLToPath(fromUrl)), '../..');
}

/**
 * 解析 polaris-web 根目录。
 * 优先级：POLARIS_WEB_PATH → 包根兄弟 → cwd 兄弟。
 */
export function resolvePolarisWebRoot(
  packageRoot: string = resolvePackageRoot(),
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const candidates: string[] = [];
  const fromEnv = (env.POLARIS_WEB_PATH ?? '').trim();
  if (fromEnv) candidates.push(path.resolve(fromEnv));
  candidates.push(path.resolve(packageRoot, '..', 'polaris-web'));
  candidates.push(path.resolve(cwd, '..', 'polaris-web'));

  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'package.json')) && existsSync(path.join(dir, 'scripts', 'dev.sh'))) {
      return dir;
    }
  }
  return null;
}

/**
 * 启动 polaris-web 开发栈；阻塞至子进程退出。
 */
export async function startDashboard(options: StartDashboardOptions): Promise<void> {
  const webRoot = resolvePolarisWebRoot();
  if (!webRoot) {
    throw new Error(
      '未找到 polaris-web。请将仓库放在 polaris-flow 同级目录，或设置环境变量 POLARIS_WEB_PATH 指向 polaris-web 根目录。',
    );
  }

  const script = path.join(webRoot, 'scripts', 'dev.sh');
  const projectPath = path.resolve(options.projectPath ?? process.cwd());
  const webPort = options.port;
  const apiPort = options.apiPort ?? 3700;

  if (!Number.isFinite(webPort) || webPort < 1 || webPort > 65535) {
    throw new Error(`无效的前端端口: ${options.port}`);
  }
  if (!Number.isFinite(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error(`无效的 API 端口: ${apiPort}`);
  }

  console.log(`[dashboard] polaris-web: ${webRoot}`);
  console.log(`[dashboard] 项目: ${projectPath}`);
  console.log(`[dashboard] 前端 http://localhost:${webPort}  API http://localhost:${apiPort}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn('bash', [script, projectPath], {
      cwd: webRoot,
      env: {
        ...process.env,
        POLARIS_WEB_PORT: String(webPort),
        POLARIS_API_PORT: String(apiPort),
      },
      stdio: 'inherit',
    });

    child.on('error', (err) => {
      reject(new Error(`无法启动 polaris-web: ${err.message}`));
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        resolve();
        return;
      }
      if (code === 0 || code === null) {
        resolve();
        return;
      }
      reject(new Error(`polaris-web 退出码 ${code}`));
    });

    if (options.open) {
      const url = `http://localhost:${webPort}`;
      // 延迟打开：等 vite 起来；失败忽略
      setTimeout(() => {
        const cmd =
          process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
        spawn(cmd, [url], { stdio: 'ignore', shell: process.platform === 'win32' }).unref();
      }, 2500);
    }
  });
}
