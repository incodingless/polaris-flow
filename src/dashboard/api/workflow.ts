import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface GeneratedArtifact {
  file?: string;
  name: string;
  description: string;
  artifact: string;
  check: string;
  section?: string;
}

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  generated?: GeneratedArtifact[];
  operations?: Operation[];
}

export interface Operation {
  code: string;
  name: string;
  /** 操作的目标 step ID */
  target?: string;
}

export interface WorkflowPhase {
  code: string;
  name: string;
  /** 下一阶段的 code，"none" 表示无下一阶段 */
  nextStep?: string;
}

export interface WorkflowGroup {
  name: string;
  steps: WorkflowStep[];
}

export interface WorkflowDef {
  id: string;
  name: string;
  canonical?: string;
  description?: string;
  phases?: WorkflowPhase[];
  groups: WorkflowGroup[];
}

export interface TasksYaml {
  workflow: WorkflowDef[];
}

/**
 * 归一化 YAML 中的 kebab-case 键为 camelCase（yaml 库不自动转换）。
 * 入参取 `unknown`：声明类型 `WorkflowPhase` 描述的是归一化**之后**的形状，
 * 归一化**之前**的原始对象带 `next-step` 这类 kebab 键，必须按未知结构收窄。
 */
function normalizePhase(raw: unknown): WorkflowPhase {
  const phase = (raw ?? {}) as Record<string, unknown>;
  const nextStep = phase['next-step'];
  return {
    code: typeof phase.code === 'string' ? phase.code : '',
    name: typeof phase.name === 'string' ? phase.name : '',
    nextStep: typeof nextStep === 'string' ? nextStep : undefined,
  };
}

const TASKS_YAML_CANDIDATES = [
  // npm 发布后：dist/config/tasks.yaml
  join(__dirname, '..', '..', '..', 'config', 'tasks.yaml'),
  // 开发时：仓库根目录 config/tasks.yaml
  join(__dirname, '..', '..', '..', '..', 'config', 'tasks.yaml'),
];

let cachedTasksYaml: TasksYaml | null | undefined;
let cachedTasksYamlPath: string | null = null;

function resolveTasksYamlPath(): string | null {
  for (const candidate of TASKS_YAML_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 读取 CLI 内置 tasks.yaml */
export function loadTasksYaml(): TasksYaml | null {
  if (cachedTasksYaml !== undefined) {
    return cachedTasksYaml;
  }
  const configPath = resolveTasksYamlPath();
  if (!configPath) {
    cachedTasksYaml = null;
    cachedTasksYamlPath = null;
    return null;
  }
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = parseYaml(raw) as TasksYaml;
    cachedTasksYamlPath = configPath;
    cachedTasksYaml = {
      workflow: (parsed.workflow || []).map((w) => ({
        ...w,
        phases: w.phases?.map(normalizePhase),
      })),
    };
    return cachedTasksYaml;
  } catch {
    cachedTasksYaml = null;
    cachedTasksYamlPath = null;
    return null;
  }
}

/** 按 schema id 匹配 workflow 定义 */
export function getWorkflowBySchema(schemaId: string): WorkflowDef | null {
  const tasks = loadTasksYaml();
  if (!tasks) return null;
  return tasks.workflow.find((w) => w.id === schemaId) ?? null;
}

/** 按 groups 顺序扁平化步骤 id 列表 */
export function flattenStepIds(workflow: WorkflowDef): string[] {
  const ids: string[] = [];
  for (const group of workflow.groups) {
    for (const step of group.steps) {
      ids.push(step.id);
    }
  }
  return ids;
}

/** 按 groups 顺序扁平化步骤对象列表（含 generated 信息） */
export function flattenSteps(workflow: WorkflowDef): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  for (const group of workflow.groups) {
    for (const step of group.steps) {
      steps.push(step);
    }
  }
  return steps;
}

/** 列出所有 workflow id */
export function listWorkflowIds(): string[] {
  const tasks = loadTasksYaml();
  return tasks ? tasks.workflow.map((w) => w.id) : [];
}

/** GET /api/workflow 响应：返回完整 workflow 列表 */
export function getWorkflowListResponse(): { workflows: WorkflowDef[]; error?: string } {
  const tasks = loadTasksYaml();
  if (!tasks) {
    const tried = TASKS_YAML_CANDIDATES.join(', ');
    return { workflows: [], error: `tasks.yaml 不存在或无法解析，已尝试: ${tried}` };
  }
  return { workflows: tasks.workflow };
}

export interface ArtifactPhaseGroup {
  code: string;
  name: string;
  artifacts: Array<{
    stepId: string;
    file?: string;
    name: string;
    description: string;
    check: string;
  }>;
}

/** 从 workflow 获取 phase 名称映射 */
function buildPhaseNameMap(workflow: WorkflowDef): Map<string, string> {
  const map = new Map<string, string>();
  if (workflow.phases) {
    for (const p of workflow.phases) {
      map.set(p.code, p.name);
    }
  }
  return map;
}

/** GET /api/workflow/:id/artifacts 响应：按产物阶段分组返回产出物信息 */
export function getWorkflowArtifacts(schemaId: string): {
  workflowId: string;
  workflowName: string;
  phases: ArtifactPhaseGroup[];
  error?: string;
} {
  const workflow = getWorkflowBySchema(schemaId);
  if (!workflow) {
    return {
      workflowId: schemaId,
      workflowName: '',
      phases: [],
      error: `未找到 schema "${schemaId}" 对应的 workflow`,
    };
  }

  const phaseNameMap = buildPhaseNameMap(workflow);
  const phaseMap = new Map<string, ArtifactPhaseGroup['artifacts']>();

  for (const group of workflow.groups) {
    for (const step of group.steps) {
      if (!step.generated) continue;
      for (const artifact of step.generated) {
        const phase = artifact.artifact;
        if (!phaseMap.has(phase)) {
          phaseMap.set(phase, []);
        }
        phaseMap.get(phase)!.push({
          stepId: step.id,
          file: artifact.file,
          name: artifact.name,
          description: artifact.description,
          check: artifact.check,
        });
      }
    }
  }

  const phaseOrder = (workflow.phases || []).map((p) => p.code);
  const phases: ArtifactPhaseGroup[] = [];
  for (const code of phaseOrder) {
    const artifacts = phaseMap.get(code);
    if (artifacts && artifacts.length > 0) {
      phases.push({ code, name: phaseNameMap.get(code) || code, artifacts });
    }
  }
  for (const [code, artifacts] of phaseMap) {
    if (!phaseOrder.includes(code)) {
      phases.push({ code, name: phaseNameMap.get(code) || code, artifacts });
    }
  }

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    phases,
  };
}

/** GET /api/workflow/:id/phases 响应：返回 workflow 的阶段定义 */
export function getWorkflowPhases(schemaId: string): {
  workflowId: string;
  workflowName: string;
  phases: WorkflowPhase[];
  error?: string;
} {
  const workflow = getWorkflowBySchema(schemaId);
  if (!workflow) {
    return {
      workflowId: schemaId,
      workflowName: '',
      phases: [],
      error: `未找到 schema "${schemaId}" 对应的 workflow`,
    };
  }
  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    phases: workflow.phases || [],
  };
}

/** 获取指定 step 的操作列表 */
export function getStepOperations(schemaId: string, stepId: string): Operation[] {
  const workflow = getWorkflowBySchema(schemaId);
  if (!workflow) return [];
  const steps = flattenSteps(workflow);
  const step = steps.find((s) => s.id === stepId);
  return step?.operations || [];
}

/** 测试用：清除 tasks.yaml 缓存 */
export function clearTasksYamlCache(): void {
  cachedTasksYaml = undefined;
  cachedTasksYamlPath = null;
}

/** 测试用：返回当前加载的 tasks.yaml 路径 */
export function getTasksYamlPathForTest(): string | null {
  loadTasksYaml();
  return cachedTasksYamlPath;
}
