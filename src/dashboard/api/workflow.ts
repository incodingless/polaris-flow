/**
 * 流程定义 API（`/api/workflow*`）。
 *
 * 数据源是 `src/core/config/task-kind-layout.ts` 的阶段表与产物表 —— **单一真相**。
 * 旧实现读 CLI 内置的 `config/tasks.yaml`（openspec 时代的 8 步流程定义），
 * 该文件在本仓并不存在，已随 polaris-cli 退役，故整块替换。
 */
import {
  getKindArtifacts,
  getKindGroups,
  getKindLabel,
  getKindPhases,
} from '../../core/config/task-kind-layout.js';
import {
  parseWorkflowTaskKind,
  WORKFLOW_TASK_KINDS,
  WORKFLOW_TASK_KIND_HELP,
  workflowTaskKindErrorMessage,
  type WorkflowTaskKind,
} from '../../core/config/workflow-state.js';

export type PhasePayload = {
  code: string;
  name: string;
  group: string;
  optional: boolean;
  bypass: boolean;
};

export type KindWorkflowPayload = {
  /** 即契约里的 `workflowId` */
  kind: WorkflowTaskKind;
  label: string;
  groups: string[];
  phases: PhasePayload[];
};

export type ArtifactPhasePayload = {
  code: string;
  name: string;
  artifacts: Array<{
    relPath: string;
    kind: 'file' | 'dir';
    checkboxes: boolean;
  }>;
};

/** 阶段表 → 响应形状 */
function toPhases(kind: WorkflowTaskKind): PhasePayload[] {
  return getKindPhases(kind, { includeBypass: true }).map((phase) => ({
    code: phase.code,
    name: phase.name,
    group: phase.group,
    optional: phase.optional === true,
    bypass: phase.bypass === true,
  }));
}

/** 非法 kind 的统一错误响应 */
function kindError(raw: string | undefined): { error: string } {
  return { error: raw ? `未知的任务类型 "${raw}"` : workflowTaskKindErrorMessage() };
}

/** GET /api/workflow */
export function getWorkflowListResponse(): { kinds: KindWorkflowPayload[] } {
  return {
    kinds: WORKFLOW_TASK_KINDS.map((kind) => ({
      kind,
      label: getKindLabel(kind),
      groups: getKindGroups(kind),
      phases: toPhases(kind),
    })),
  };
}

/** GET /api/workflow/:kind/phases —— 按 UI 分组返回阶段定义 */
export function getWorkflowPhases(kindRaw: string):
  | {
      kind: WorkflowTaskKind;
      label: string;
      groups: Array<{ name: string; phases: PhasePayload[] }>;
    }
  | { error: string } {
  const kind = parseWorkflowTaskKind(kindRaw);
  if (!kind) {
    return kindError(kindRaw);
  }
  // 旁路阶段单独成组（default 组里不出现），便于前端按需渲染
  const mainPhases = toPhases(kind).filter((p) => !p.bypass);
  const bypassPhases = toPhases(kind).filter((p) => p.bypass);

  const groups = getKindGroups(kind).map((name) => ({
    name,
    phases: mainPhases.filter((p) => p.group === name),
  }));
  if (bypassPhases.length > 0) {
    groups.push({ name: '旁路', phases: bypassPhases });
  }

  return { kind, label: getKindLabel(kind), groups };
}

/** GET /api/workflow/:kind/artifacts —— 按阶段返回产物定义 */
export function getWorkflowArtifacts(
  kindRaw: string,
): { kind: WorkflowTaskKind; label: string; phases: ArtifactPhasePayload[] } | { error: string } {
  const kind = parseWorkflowTaskKind(kindRaw);
  if (!kind) {
    return kindError(kindRaw);
  }

  const phaseNameOf = new Map(
    getKindPhases(kind, { includeBypass: true }).map((p) => [p.code, p.name]),
  );
  const order: string[] = [];
  const byPhase = new Map<string, ArtifactPhasePayload['artifacts']>();

  for (const artifact of getKindArtifacts(kind)) {
    if (!byPhase.has(artifact.phase)) {
      byPhase.set(artifact.phase, []);
      order.push(artifact.phase);
    }
    for (const relPath of artifact.relPaths) {
      byPhase.get(artifact.phase)!.push({
        relPath,
        kind: artifact.kind,
        checkboxes: artifact.checkboxes === true,
      });
    }
  }

  return {
    kind,
    label: getKindLabel(kind),
    phases: order.map((code) => ({
      code,
      name: phaseNameOf.get(code) ?? code,
      artifacts: byPhase.get(code)!,
    })),
  };
}

/** 供路由错误提示复用 */
export const KIND_HELP = WORKFLOW_TASK_KIND_HELP;
