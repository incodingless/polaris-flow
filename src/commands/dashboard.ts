/**
 * `polaris dashboard`：启动本地工作台。
 *
 * 单进程单端口（默认 3700），同一端口提供 `/api/*` 与前端静态资源；就绪后自动打开浏览器。
 * 端口校验与错误上报在此层完成，`src/dashboard/server.ts` 只负责起服务。
 */
import path from 'path';

import { startDashboard } from '../dashboard/server.js';

/** 默认端口（沿用旧 Dashboard API 端口，取代原先 5173/3700 的双默认） */
export const DEFAULT_DASHBOARD_PORT = 3700;

export type DashboardOptions = {
  /** 服务端口，默认 3700 */
  port?: string;
  /** 是否自动打开浏览器；Commander 的 `--no-open` 使其默认 true */
  open?: boolean;
  /** 只起 API，不做静态托管（供 dashboard/ 内 vite dev 使用） */
  apiOnly?: boolean;
};

/** 解析端口；非整数或越界返回 null */
function parsePort(raw: string | undefined): number | null {
  const port = Number(raw ?? DEFAULT_DASHBOARD_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return null;
  }
  return port;
}

/**
 * 启动工作台；失败时置 `process.exitCode = 1`，不把异常抛给 Commander。
 */
export async function runDashboard(rawPath: string, options: DashboardOptions = {}): Promise<void> {
  const port = parsePort(options.port);
  if (port === null) {
    console.error(`[dashboard] 无效端口：${options.port}（应为 1-65535 的整数）`);
    process.exitCode = 1;
    return;
  }

  try {
    await startDashboard({
      port,
      projectPath: path.resolve(rawPath || process.cwd()),
      open: options.open !== false,
      apiOnly: options.apiOnly === true,
    });
  } catch (err) {
    console.error(`[dashboard] ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

/**
 * dashboard 命令入口。
 */
export async function dashboardCommand(
  projectPath: string,
  options: DashboardOptions,
): Promise<void> {
  await runDashboard(projectPath, options);
}
