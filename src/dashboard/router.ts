/**
 * Dashboard API 路由表：把 `/api/*` 请求分发到 `api/` 下的处理器。
 *
 * 定位：`src/dashboard/` 是传输层（HTTP 编解码、路由、序列化），业务语义一律下沉 `src/core/`。
 * 来源：由 polaris-cli 的 `src/core/dashboard/router.ts` 复制并入（见 scripts/migrate-dashboard.js）。
 *
 * 注意：数据源目前仍是 openspec 时代的模型（读 `openspec/changes/`），M2 再切换到
 * `.polaris/workflow.yaml` + `state.yaml`。契约见 docs/specs/2026-09-18-dashboard-api-contract.md。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';

function parseBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
  });
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  projectRoot: string,
): Promise<void> {
  const url = req.url ?? '/';
  const idx = url.indexOf('?');
  const pathname = idx === -1 ? url : url.slice(0, idx);
  const method = req.method ?? 'GET';

  // API routes
  if (pathname.startsWith('/api/')) {
    const body =
      method === 'POST' || method === 'PUT' || method === 'DELETE' ? await parseBody(req) : '';
    handleApiRoute(method, pathname, url, body, res, projectRoot);
    return;
  }

  // All other requests: API server status
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ message: 'polaris dashboard API server', endpoints: '/api/*' }));
}

/** 从 ?project= 解析项目根目录，用于多项目仪表盘 */
export function resolveProjectRoot(reqUrl: string, defaultRoot: string): string {
  const qIdx = reqUrl.indexOf('?');
  if (qIdx === -1) return defaultRoot;
  const project = new URLSearchParams(reqUrl.slice(qIdx + 1)).get('project');
  if (project && existsSync(project)) {
    return project;
  }
  return defaultRoot;
}

async function handleApiRoute(
  method: string,
  pathname: string,
  reqUrl: string,
  body: string,
  res: ServerResponse,
  defaultProjectRoot: string,
): Promise<void> {
  const projectRoot = resolveProjectRoot(reqUrl, defaultProjectRoot);
  try {
    const changesApi = await import('./api/changes.js');
    const configsApi = await import('./api/configs.js');
    const projectsApi = await import('./api/projects.js');
    const filesystemApi = await import('./api/filesystem.js');
    const workflowApi = await import('./api/workflow.js');

    // GET /api/changes
    if (method === 'GET' && pathname === '/api/changes') {
      const filterParam =
        new URLSearchParams(reqUrl.slice(reqUrl.indexOf('?'))).get('filter') || 'active';
      const filter = filterParam === 'all' || filterParam === 'archived' ? filterParam : 'active';
      return json(res, changesApi.listChanges(projectRoot, filter));
    }

    // GET /api/changes/:name
    const changeMatch = pathname.match(/^\/api\/changes\/([^/]+)$/);
    if (method === 'GET' && changeMatch) {
      return json(res, changesApi.getChange(projectRoot, changeMatch[1]!));
    }

    // 以下写路由在并入时刻意移除，不在 M1 提供：
    //   POST /api/changes/:name/tasks/:id            —— 直改 tasks.md，绕过 .locks/；M3 经原语重建
    //   POST /api/changes/:name/steps/:stepId/operations —— 依赖外部 openspec CLI + POLARIS_CONTINUE_CMD
    //   POST /api/changes/:name/validate             —— 依赖外部 openspec CLI
    //   PUT  /api/configs/:path                      —— 直写配置文件，绕过 .locks/
    //   POST /api/compose、GET /api/schemas          —— 由 M3 的 CLI 原语承接
    // 依据：设计文档 §5.1 / §5.2 与「首发只读」决策。

    // GET /api/configs
    if (method === 'GET' && pathname === '/api/configs') {
      return json(res, configsApi.listConfigs(projectRoot));
    }

    // GET /api/configs/:path*
    const configGetMatch = pathname.match(/^\/api\/configs\/(.+)$/);
    if (method === 'GET' && configGetMatch) {
      return json(res, configsApi.getConfig(projectRoot, configGetMatch[1]!));
    }

    // GET /api/projects
    if (method === 'GET' && pathname === '/api/projects') {
      return json(res, projectsApi.listProjects(projectRoot));
    }

    // POST /api/projects
    if (method === 'POST' && pathname === '/api/projects') {
      return json(res, projectsApi.addProject(body));
    }

    // DELETE /api/projects
    if (method === 'DELETE' && pathname === '/api/projects') {
      const qs = reqUrl.includes('?')
        ? new URLSearchParams(reqUrl.slice(reqUrl.indexOf('?')))
        : null;
      const id = qs?.get('id');
      if (id) {
        return json(res, projectsApi.removeProjectById(id));
      }
      return json(res, projectsApi.deleteProject(body));
    }

    // PUT /api/projects/default
    if (method === 'PUT' && pathname === '/api/projects/default') {
      return json(res, projectsApi.setDefaultProject(body));
    }

    // GET /api/stats
    if (method === 'GET' && pathname === '/api/stats') {
      return json(res, projectsApi.getAggregateStats());
    }

    // GET /api/dirs?path=
    if (method === 'GET' && pathname === '/api/dirs') {
      const qs = reqUrl.includes('?')
        ? new URLSearchParams(reqUrl.slice(reqUrl.indexOf('?')))
        : null;
      const dirPath = qs?.get('path') ?? '';
      return json(res, filesystemApi.listDirs(dirPath));
    }

    // GET /api/check-openspec?path=
    if (method === 'GET' && pathname === '/api/check-openspec') {
      const qs = reqUrl.includes('?')
        ? new URLSearchParams(reqUrl.slice(reqUrl.indexOf('?')))
        : null;
      const dirPath = qs?.get('path') ?? '';
      return json(res, filesystemApi.checkOpenspec(dirPath));
    }

    // GET /api/check
    if (method === 'GET' && pathname === '/api/check') {
      const checkApi = await import('./api/check.js');
      return json(res, checkApi.runChecks(projectRoot));
    }

    // POST /api/reveal
    if (method === 'POST' && pathname === '/api/reveal') {
      let payload: { path?: string } = {};
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        return json(res, { error: '无效的 JSON 请求体' });
      }
      const targetPath = payload.path ?? '';
      const projectsApi = await import('./api/projects.js');
      const projectList = projectsApi.listProjects(defaultProjectRoot);
      const allowedRoots = [
        defaultProjectRoot,
        projectRoot,
        ...(projectList.projects || []).map((p: { path: string }) => p.path),
      ];
      const result = await filesystemApi.revealPath(targetPath, allowedRoots);
      return json(res, result);
    }

    // GET /api/workflow/:id/phases
    const phasesMatch = pathname.match(/^\/api\/workflow\/([^/]+)\/phases$/);
    if (method === 'GET' && phasesMatch) {
      return json(res, workflowApi.getWorkflowPhases(phasesMatch[1]!));
    }

    // GET /api/workflow/:id/steps/:stepId/operations
    const opsMatch = pathname.match(/^\/api\/workflow\/([^/]+)\/steps\/([^/]+)\/operations$/);
    if (method === 'GET' && opsMatch) {
      return json(res, workflowApi.getStepOperations(opsMatch[1]!, opsMatch[2]!));
    }

    // GET /api/workflow/:id/artifacts
    const artifactMatch = pathname.match(/^\/api\/workflow\/([^/]+)\/artifacts$/);
    if (method === 'GET' && artifactMatch) {
      return json(res, workflowApi.getWorkflowArtifacts(artifactMatch[1]!));
    }

    // GET /api/workflow
    if (method === 'GET' && pathname === '/api/workflow') {
      return json(res, workflowApi.getWorkflowListResponse());
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'API not found' }));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: (err as Error).message }));
  }
}

function json(res: ServerResponse, data: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
