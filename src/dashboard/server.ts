/**
 * `polaris dashboard`：单进程单端口的本地工作台服务。
 *
 * 同一端口同时提供：
 *   - `/api/*` —— 交给 `router.ts` 分发（只读；写操作见设计文档 §5.2）
 *   - 其余路径 —— 托管 `<包根>/dist/web/` 下的 vite 产物（`static.ts`）
 *
 * 就绪后自动打开浏览器；`--api-only` 可只起 API，供 `dashboard/` 内的 vite dev server 做 HMR 开发。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleRequest } from './router.js';
import { serveStatic } from './static.js';

export type StartDashboardOptions = {
  /** 服务端口 */
  port: number;
  /** 要可视化的项目根；默认 process.cwd() */
  projectPath?: string;
  /** 就绪后自动打开浏览器；默认 true */
  open?: boolean;
  /** 只起 API，不做静态托管（供 dashboard/ 内的 vite dev 使用） */
  apiOnly?: boolean;
};

/**
 * 前端产物根 `<包根>/dist/web`。
 * 从 `dist/dashboard/server.js` 或 `src/dashboard/server.ts` 上溯两级都得到包根（两者同深度）。
 */
export function resolveWebRoot(fromUrl: string = import.meta.url): string {
  return path.resolve(path.dirname(fileURLToPath(fromUrl)), '..', '..', 'dist', 'web');
}

/** 用系统默认方式打开浏览器；失败静默忽略（不阻断服务） */
export function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    const child = spawn(cmd, [url], {
      stdio: 'ignore',
      detached: true,
      shell: process.platform === 'win32',
    });
    child.on('error', () => {
      /* 打不开浏览器不影响服务 */
    });
    child.unref();
  } catch {
    /* 同上 */
  }
}

/**
 * 启动工作台。服务进入监听状态后返回；进程因 http server 持有句柄而继续存活。
 */
export async function startDashboard(options: StartDashboardOptions): Promise<void> {
  const { port } = options;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`无效端口：${port}`);
  }

  const apiOnly = options.apiOnly === true;
  const webRoot = resolveWebRoot();
  const projectRoot = path.resolve(options.projectPath ?? process.cwd());

  // 产物缺失时提前失败，不静默降级成「只起 API」
  if (!apiOnly && !existsSync(path.join(webRoot, 'index.html'))) {
    throw new Error(
      `未找到前端产物：${webRoot}\n  请先构建：pnpm run build（或 pnpm run build:web）`,
    );
  }

  const server = createServer((req, res) => {
    const url = req.url ?? '/';

    if (url.startsWith('/api/')) {
      // handleRequest 内部已兜底，这里再兜一层，避免未捕获的异步拒绝打挂进程
      void handleRequest(req, res, projectRoot).catch((err: unknown) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        res.end(JSON.stringify({ error: (err as Error).message }));
      });
      return;
    }

    if (apiOnly) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'API-only 模式：前端请用 `npm run dev`（dashboard/ 内）访问 vite dev server',
        }),
      );
      return;
    }

    if (!serveStatic(req, res, webRoot)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
    }
  });

  const host = '127.0.0.1';
  await new Promise<void>((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(
        new Error(
          err.code === 'EADDRINUSE'
            ? `端口 ${port} 已被占用。换一个端口：polaris dashboard --port <n>`
            : `启动失败：${err.message}`,
        ),
      );
    });
    server.listen(port, host, () => {
      server.removeAllListeners('error');
      server.on('error', (err: Error) => {
        console.error(`[dashboard] ${err.message}`);
        process.exitCode = 1;
      });
      resolve();
    });
  });

  const origin = `http://${host}:${port}`;
  console.log(`[dashboard] 项目  ${projectRoot}`);
  console.log(`[dashboard] API   ${origin}/api`);
  console.log(
    apiOnly
      ? '[dashboard] 前端  仅 API 模式（请另起 dashboard/ 的 vite dev）'
      : `[dashboard] 前端  ${origin}`,
  );
  console.log('[dashboard] 按 Ctrl+C 停止');

  // 已在监听，此时开浏览器不会出现「页面先于服务」的竞态
  if (options.open !== false) {
    openBrowser(origin);
  }
}
