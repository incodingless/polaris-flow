import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { getPolarisConfigPath } from '../../core/assets/polaris-paths.js';

/**
 * 注册表条目（**持久化形状**）。语义见 `docs/specs/2026-09-18-dashboard-integration-design.md` §7 D4：
 * 这里存的是「所有被加入 dashboard 做可视化、且使用 polaris-flow 的项目」。
 */
export interface ProjectItem {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

/**
 * 面向界面的形状：在持久化字段上叠加**运行期判定**（不写回文件）。
 *
 * 为什么不把 stale 存进注册表：它是「当下这一刻成立与否」的事实，存下来就会变旧，
 * 而变旧的表现是「目录早就回来了、面板还标着失效」。每次读时算，永远准。
 */
export interface ProjectView extends ProjectItem {
  /** 目录不存在，或不再是 polaris-flow 项目 */
  stale: boolean;
  /** stale 的原因；正常时为空串 */
  reason: string;
}

interface ProjectsData {
  projects: ProjectItem[];
  /** 全局唯一的默认项目 ID */
  defaultProjectId?: string | null;
}

/**
 * 注册表文件位置。
 *
 * 支持 `POLARIS_PROJECTS_FILE` 覆盖：**单测必须用它**，否则会往用户真实的
 * `~/.polaris/projects.json` 里写测试数据。刻意做成函数而不是常量 ——
 * 常量在模块加载时求值，测试来不及设环境变量。
 */
function projectsFile(): string {
  return process.env.POLARIS_PROJECTS_FILE?.trim() || join(homedir(), '.polaris', 'projects.json');
}

function readProjects(): ProjectsData {
  const file = projectsFile();
  if (!existsSync(file)) {
    return { projects: [] };
  }
  try {
    const raw = readFileSync(file, 'utf8');
    return JSON.parse(raw) as ProjectsData;
  } catch {
    return { projects: [] };
  }
}

function writeProjects(data: ProjectsData): void {
  const file = projectsFile();
  const dir = dirname(file);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(file, JSON.stringify(data, null, 2));
}

/** 判定一项是否失效，并给出可读原因 */
function inspect(project: ProjectItem): ProjectView {
  if (!existsSync(project.path)) {
    return { ...project, stale: true, reason: '目录不存在' };
  }
  if (!existsSync(getPolarisConfigPath(project.path))) {
    return { ...project, stale: true, reason: '不是 polaris-flow 项目（缺 .polaris/config.yaml）' };
  }
  return { ...project, stale: false, reason: '' };
}

/**
 * 列出注册项目。**失效项照常返回并标记，不自动删除** —— 目录可能是临时移走的，
 * 自动清理会丢掉用户自己加进来的选择；删除只能是用户的动作。
 */
export function listProjects(_projectRoot: string): {
  projects: ProjectView[];
  defaultProjectId: string | null;
} {
  const store = readProjects();
  const defaultProjectId = store.defaultProjectId ?? null;
  const validDefault =
    defaultProjectId && store.projects.some((p) => p.id === defaultProjectId)
      ? defaultProjectId
      : null;
  return { projects: store.projects.map(inspect), defaultProjectId: validDefault };
}

export function addProject(body: string): { project?: ProjectView; error?: string } {
  let data: { name?: string; path?: string };
  try {
    data = JSON.parse(body) as { name?: string; path?: string };
  } catch {
    return { error: '无效的 JSON 请求体' };
  }
  if (!data.name || !data.name.trim()) {
    return { error: '项目别名不能为空' };
  }
  if (!data.path || !data.path.trim()) {
    return { error: '项目路径不能为空' };
  }
  const projectPath = data.path.trim();
  if (!existsSync(projectPath)) {
    return { error: `目录不存在: ${projectPath}` };
  }
  // D4 的语义是「使用 polaris-flow 的项目」，所以这里必须校验已 init ——
  // 只校验「目录存在」会让任意目录都能进注册表，之后每个面板都展现空列表。
  // 判据与 `GET /api/check-initialized` 同源（走 polaris-paths，不自己拼路径）。
  if (!existsSync(getPolarisConfigPath(projectPath))) {
    return {
      error: `该目录不是 polaris-flow 项目（未找到 .polaris/config.yaml）: ${projectPath}。请先在该目录执行 polaris init`,
    };
  }

  const store = readProjects();
  if (store.projects.some((p) => p.path === projectPath)) {
    return { error: '该项目路径已存在' };
  }

  const project: ProjectItem = {
    id: randomUUID(),
    name: data.name.trim(),
    path: projectPath,
    createdAt: new Date().toISOString(),
  };

  store.projects.push(project);
  if (!store.defaultProjectId || !store.projects.some((p) => p.id === store.defaultProjectId)) {
    store.defaultProjectId = project.id;
  }
  writeProjects(store);

  return { project: inspect(project) };
}

export function removeProjectById(id: string): { ok?: boolean; error?: string } {
  if (!id?.trim()) {
    return { error: '缺少项目 ID' };
  }

  const store = readProjects();
  const idx = store.projects.findIndex((p) => p.id === id);
  if (idx === -1) {
    return { error: '项目不存在' };
  }

  const removedId = store.projects[idx]!.id;
  store.projects.splice(idx, 1);
  if (store.defaultProjectId === removedId) {
    store.defaultProjectId = store.projects[0]?.id ?? null;
  }
  writeProjects(store);

  return { ok: true };
}

export function deleteProject(body: string): { ok?: boolean; error?: string } {
  if (!body?.trim()) {
    return { error: '缺少项目 ID' };
  }

  let data: { id?: string };
  try {
    data = JSON.parse(body) as { id?: string };
  } catch {
    return { error: '无效的 JSON 请求体' };
  }

  if (!data.id) {
    return { error: '缺少项目 ID' };
  }

  return removeProjectById(data.id);
}

/** 设置默认项目（全局互斥） */
export function setDefaultProject(body: string): {
  ok?: boolean;
  defaultProjectId?: string;
  error?: string;
} {
  const data = JSON.parse(body) as { id?: string };
  if (!data.id) {
    return { error: '缺少项目 ID' };
  }

  const store = readProjects();
  if (!store.projects.some((p) => p.id === data.id)) {
    return { error: '项目不存在' };
  }

  store.defaultProjectId = data.id;
  writeProjects(store);

  return { ok: true, defaultProjectId: data.id };
}

// getAggregateStats 已移除：它建立在 openspec 时代的 change-scanner 之上（按 openspec/changes 聚合
// tasksTotal/tasksDone）。/api/stats 改为按项目汇总，实现见 api/tasks.ts 的 computeTaskStats。
