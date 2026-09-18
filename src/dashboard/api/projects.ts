import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { computeStats } from '../change-scanner.js';

export interface ProjectItem {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

interface ProjectsData {
  projects: ProjectItem[];
  /** 全局唯一的默认项目 ID */
  defaultProjectId?: string | null;
}

const PROJECTS_FILE = join(homedir(), '.polaris', 'projects.json');

function readProjects(): ProjectsData {
  if (!existsSync(PROJECTS_FILE)) {
    return { projects: [] };
  }
  try {
    const raw = readFileSync(PROJECTS_FILE, 'utf8');
    return JSON.parse(raw) as ProjectsData;
  } catch {
    return { projects: [] };
  }
}

function writeProjects(data: ProjectsData): void {
  const dir = dirname(PROJECTS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
}

export function listProjects(_projectRoot: string): {
  projects: ProjectItem[];
  defaultProjectId: string | null;
} {
  const store = readProjects();
  const defaultProjectId = store.defaultProjectId ?? null;
  const validDefault =
    defaultProjectId && store.projects.some((p) => p.id === defaultProjectId)
      ? defaultProjectId
      : null;
  return { projects: store.projects, defaultProjectId: validDefault };
}

export function addProject(body: string): { project?: ProjectItem; error?: string } {
  const data = JSON.parse(body) as { name?: string; path?: string };
  if (!data.name || !data.name.trim()) {
    return { error: '项目别名不能为空' };
  }
  if (!data.path || !data.path.trim()) {
    return { error: '项目路径不能为空' };
  }
  if (!existsSync(data.path)) {
    return { error: `目录不存在: ${data.path}` };
  }

  const store = readProjects();
  if (store.projects.some((p) => p.path === data.path)) {
    return { error: '该项目路径已存在' };
  }

  const project: ProjectItem = {
    id: randomUUID(),
    name: data.name.trim(),
    path: data.path.trim(),
    createdAt: new Date().toISOString(),
  };

  store.projects.push(project);
  if (!store.defaultProjectId || !store.projects.some((p) => p.id === store.defaultProjectId)) {
    store.defaultProjectId = project.id;
  }
  writeProjects(store);

  return { project };
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

export function getAggregateStats(): {
  totalTasks: number;
  doneTasks: number;
  pendingTasks: number;
} {
  const store = readProjects();
  let totalTasks = 0,
    doneTasks = 0;

  for (const p of store.projects) {
    if (!existsSync(p.path)) continue;
    const stats = computeStats(p.path);
    totalTasks += stats.totalTasks;
    doneTasks += stats.doneTasks;
  }

  return { totalTasks, doneTasks, pendingTasks: totalTasks - doneTasks };
}
