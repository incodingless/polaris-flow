/**
 * Dashboard API 路由表：把 `/api/*` 请求分发到 `api/` 下的处理器。
 *
 * 定位：`src/dashboard/` 是传输层（HTTP 编解码、路由、序列化），业务语义一律下沉 `src/core/`。
 * 数据源与响应形状见 `docs/specs/2026-09-18-dashboard-api-contract.md`（M2 定稿）。
 *
 * 只读性：除下列三类外全部只读 ——
 *   - `projects` 的注册表维护（写 `~/.polaris/`，非任务模型）
 *   - `reveal`（调系统文件管理器，不改文件）
 *   - **M3 的三个写端点**：`POST /api/tasks/:id/phase`、`POST /api/tasks/:id/cleanup`、
 *     `POST /api/tasks/:id/checkbox` —— 它们一律转调 `src/core/hooks/*` 的原语并持
 *     `.polaris/.locks/`，**本层不写任何文件**（见契约 §五）。
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

  const body =
    method === 'POST' || method === 'PUT' || method === 'DELETE' ? await parseBody(req) : '';
  await handleApiRoute(method, pathname, url, body, res, projectRoot);
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

/** 取查询参数（reqUrl 里没有 `?` 时返回空表） */
function queryOf(reqUrl: string): URLSearchParams {
  const qIdx = reqUrl.indexOf('?');
  return new URLSearchParams(qIdx === -1 ? '' : reqUrl.slice(qIdx + 1));
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
    const tasksApi = await import('./api/tasks.js');
    const configsApi = await import('./api/configs.js');
    const projectsApi = await import('./api/projects.js');
    const filesystemApi = await import('./api/filesystem.js');
    const workflowApi = await import('./api/workflow.js');

    // ---- 任务 ----

    // GET /api/tasks?status=active|archived|all&kind=
    if (method === 'GET' && pathname === '/api/tasks') {
      const q = queryOf(reqUrl);
      const statusParam = q.get('status');
      const status = statusParam === 'archived' || statusParam === 'all' ? statusParam : 'active';
      return json(
        res,
        await tasksApi.listTasks(projectRoot, { status, kind: q.get('kind') ?? undefined }),
      );
    }

    // GET /api/tasks/:id/plan-lint?kind= —— 只读：跑 tasks-lint 校验计划文件
    const lintMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/plan-lint$/);
    if (method === 'GET' && lintMatch) {
      const id = decodeURIComponent(lintMatch[1]!);
      return json(
        res,
        await tasksApi.lintTaskPlan(projectRoot, id, queryOf(reqUrl).get('kind') ?? undefined),
      );
    }

    // POST /api/tasks/:id/phase —— 推进阶段（写；经 workflow-entry 原语 + workflow.lock）
    const phaseMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/phase$/);
    if (method === 'POST' && phaseMatch) {
      const id = decodeURIComponent(phaseMatch[1]!);
      return json(
        res,
        await tasksApi.advanceTaskPhase(
          projectRoot,
          id,
          body,
          queryOf(reqUrl).get('kind') ?? undefined,
        ),
      );
    }

    // POST /api/tasks/:id/checkbox —— 勾选 tasks.md（写；经 task-state-entry 原语 + task-state 锁）
    const checkboxMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/checkbox$/);
    if (method === 'POST' && checkboxMatch) {
      const id = decodeURIComponent(checkboxMatch[1]!);
      return json(
        res,
        await tasksApi.setTaskCheckbox(
          projectRoot,
          id,
          body,
          queryOf(reqUrl).get('kind') ?? undefined,
        ),
      );
    }

    // POST /api/tasks/:id/cleanup —— 交付清理（写，不可逆；须显式 dry_run 或 confirm）
    const cleanupMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/cleanup$/);
    if (method === 'POST' && cleanupMatch) {
      const id = decodeURIComponent(cleanupMatch[1]!);
      return json(
        res,
        await tasksApi.cleanupTask(projectRoot, id, body, queryOf(reqUrl).get('kind') ?? undefined),
      );
    }

    // GET /api/tasks/:id?kind= —— 列表项 + 文件树 + 产物
    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (method === 'GET' && taskMatch) {
      const id = decodeURIComponent(taskMatch[1]!);
      return json(
        res,
        await tasksApi.getTaskDetail(projectRoot, id, queryOf(reqUrl).get('kind') ?? undefined),
      );
    }

    // ---- 配置（只读） ----

    if (method === 'GET' && pathname === '/api/configs') {
      return json(res, configsApi.listConfigs(projectRoot));
    }

    const configGetMatch = pathname.match(/^\/api\/configs\/(.+)$/);
    if (method === 'GET' && configGetMatch) {
      return json(res, configsApi.getConfig(projectRoot, decodeURIComponent(configGetMatch[1]!)));
    }

    // ---- 项目注册表 ----

    if (method === 'GET' && pathname === '/api/projects') {
      return json(res, projectsApi.listProjects(projectRoot));
    }
    if (method === 'POST' && pathname === '/api/projects') {
      return json(res, projectsApi.addProject(body));
    }
    if (method === 'DELETE' && pathname === '/api/projects') {
      const id = queryOf(reqUrl).get('id');
      if (id) {
        return json(res, projectsApi.removeProjectById(id));
      }
      return json(res, projectsApi.deleteProject(body));
    }
    if (method === 'PUT' && pathname === '/api/projects/default') {
      return json(res, projectsApi.setDefaultProject(body));
    }

    // ---- 统计 / 目录 ----

    if (method === 'GET' && pathname === '/api/stats') {
      return json(res, await tasksApi.computeTaskStats(projectRoot));
    }
    if (method === 'GET' && pathname === '/api/dirs') {
      return json(res, filesystemApi.listDirs(queryOf(reqUrl).get('path') ?? ''));
    }

    // ---- 诊断 ----

    // GET /api/check-initialized?path= —— 判据是 `.polaris/config.yaml` 存在
    if (method === 'GET' && pathname === '/api/check-initialized') {
      return json(res, filesystemApi.checkInitialized(queryOf(reqUrl).get('path') ?? ''));
    }
    if (method === 'GET' && pathname === '/api/check') {
      return json(res, await (await import('./api/check.js')).runChecks(projectRoot));
    }

    // ---- 零风险动作：在系统文件管理器中定位 ----
    // 白名单口径 = 当前项目根 + 已注册项目根（去重、剔空）。
    // `revealPath` 是 fail-closed，所以这里给出空名单时结果就是拒绝 —— 正是期望行为。
    if (method === 'POST' && pathname === '/api/reveal') {
      let payload: { path?: string } = {};
      try {
        payload = body ? JSON.parse(body) : {};
      } catch {
        return json(res, { error: '无效的 JSON 请求体' });
      }
      const projectList = projectsApi.listProjects(defaultProjectRoot);
      const allowedRoots = [
        ...new Set(
          [
            defaultProjectRoot,
            projectRoot,
            ...(projectList.projects || []).map((p: { path: string }) => p.path),
          ].filter((root): root is string => Boolean(root && root.trim())),
        ),
      ];
      return json(res, await filesystemApi.revealPath(payload.path ?? '', allowedRoots));
    }

    // ---- 流程定义（数据源 = src/core/config/task-kind-layout.ts 的阶段表） ----

    const phasesMatch = pathname.match(/^\/api\/workflow\/([^/]+)\/phases$/);
    if (method === 'GET' && phasesMatch) {
      return json(res, workflowApi.getWorkflowPhases(decodeURIComponent(phasesMatch[1]!)));
    }

    const artifactMatch = pathname.match(/^\/api\/workflow\/([^/]+)\/artifacts$/);
    if (method === 'GET' && artifactMatch) {
      return json(res, workflowApi.getWorkflowArtifacts(decodeURIComponent(artifactMatch[1]!)));
    }

    if (method === 'GET' && pathname === '/api/workflow') {
      return json(res, workflowApi.getWorkflowListResponse());
    }

    // 以下端点已移除，不再提供（依据：设计文档 §5.1 / §5.2 与「首发只读」）：
    //   /api/changes、/api/changes/:name        —— 改名 /api/tasks
    //   POST /api/changes/:name/tasks/:id       —— 直改 tasks.md，绕过 .locks/；M3 经原语重建
    //   POST /api/changes/:name/steps/:stepId/operations —— 依赖外部 openspec CLI + POLARIS_CONTINUE_CMD
    //   POST /api/changes/:name/validate        —— 依赖外部 openspec CLI
    //   PUT  /api/configs/:path                 —— 直写配置文件，绕过 .locks/
    //   POST /api/compose、GET /api/schemas     —— 由 M3 的 CLI 原语承接
    //   /api/check-openspec                     —— 改名 /api/check-initialized
    //   GET /api/workflow/:kind/steps/:stepId/operations —— 操作白名单属 M3，M2 无操作可列

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
