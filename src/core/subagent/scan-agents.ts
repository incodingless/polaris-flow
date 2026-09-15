/**
 * 按 platform-probe.md 扫描项目级 subagent，并组装与 subagent-probe 同构的快照。
 * SessionStart 落盘用；不做派发决策。
 */
import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';

import {
  resolveSubagentCapability,
  type PlatformDegradation,
} from '../domain/platforms.js';

/** probe 输出中的单个 agent 条目 */
export type SubagentAgentEntry = {
  id: string;
  path?: string;
  description: string;
  tools: string[];
  task_types: string[];
  source: 'directory' | 'builtin';
  selected: boolean;
};

/** 与 subagent-probe 技能输出同构的快照 */
export type SubagentProbeSnapshot = {
  platform: string;
  supports_subagent: boolean;
  platform_degradation: PlatformDegradation;
  agents: SubagentAgentEntry[];
  matched_agents: SubagentAgentEntry[];
  subagent_id_found: boolean;
  reason: string;
};

/** Cursor 目录为空时的 builtin Task 回退表 */
const CURSOR_BUILTINS: Omit<SubagentAgentEntry, 'selected'>[] = [
  {
    id: 'generalPurpose',
    description: '通用子代理：复杂检索、多步任务',
    tools: [],
    task_types: [],
    source: 'builtin',
  },
  {
    id: 'explore',
    description: '只读代码库探索',
    tools: [],
    task_types: ['code_explore', 'research'],
    source: 'builtin',
  },
  {
    id: 'shell',
    description: '命令执行专责',
    tools: [],
    task_types: ['command_exec'],
    source: 'builtin',
  },
];

/**
 * 返回该平台应扫描的相对目录列表（相对 repo 根，正斜杠语义由调用方归一）。
 * 始终含 `.agents/`；仅 cursor 追加 `.cursor/agents/`（与 platform-probe 表一致）。
 */
export function getSubagentScanRelativeDirs(platformId: string): string[] {
  const id = platformId.trim();
  if (id === 'cursor') {
    return ['.agents', path.join('.cursor', 'agents')];
  }
  return ['.agents'];
}

/**
 * 解析 agent 文件前 15 行 frontmatter 中的 description / tools / task_types。
 */
export function parseAgentFrontmatterHead(head: string): {
  description: string | null;
  tools: string[];
  task_types: string[];
} {
  let description: string | null = null;
  let tools: string[] = [];
  let task_types: string[] = [];
  for (const raw of head.split(/\r?\n/).slice(0, 15)) {
    const line = raw.trim();
    if (line.startsWith('description:')) {
      description = line.slice('description:'.length).trim().slice(0, 120);
    } else if (line.startsWith('tools:')) {
      tools = splitCommaList(line.slice('tools:'.length));
    } else if (line.startsWith('task_types:')) {
      task_types = splitCommaList(line.slice('task_types:'.length));
    }
  }
  return { description, tools, task_types };
}

/**
 * 逗号分隔列表 trim；空串 → []。
 */
function splitCommaList(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 递归收集目录下所有 .md 绝对路径。
 */
async function listMarkdownFilesRecursive(dirAbs: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dirAbs, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = path.join(dirAbs, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listMarkdownFilesRecursive(full)));
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      out.push(full);
    } else if (ent.isSymbolicLink()) {
      try {
        const st = await stat(full);
        if (st.isDirectory()) {
          out.push(...(await listMarkdownFilesRecursive(full)));
        } else if (st.isFile() && ent.name.endsWith('.md')) {
          out.push(full);
        }
      } catch {
        /* 断链忽略 */
      }
    }
  }
  return out;
}

/**
 * 扫描单个相对目录，返回目录型 agent；path 相对 repo 根（正斜杠），同 path 由调用方去重。
 */
async function scanDirectoryAgents(
  repoRoot: string,
  relativeDir: string,
): Promise<SubagentAgentEntry[]> {
  const absDir = path.join(repoRoot, relativeDir);
  const files = await listMarkdownFilesRecursive(absDir);
  const agents: SubagentAgentEntry[] = [];
  for (const absFile of files) {
    let head: string;
    try {
      const raw = await readFile(absFile, 'utf-8');
      head = raw.split(/\r?\n/).slice(0, 15).join('\n');
    } catch {
      continue;
    }
    const parsed = parseAgentFrontmatterHead(head);
    if (!parsed.description) continue;
    const rel = path.relative(repoRoot, absFile).split(path.sep).join('/');
    agents.push({
      id: path.basename(absFile, '.md'),
      path: rel,
      description: parsed.description,
      tools: parsed.tools,
      task_types: parsed.task_types,
      source: 'directory',
      selected: false,
    });
  }
  return agents;
}

/**
 * 按 platform-probe 策略扫描可用 subagent；不支持则返回 []。
 */
export async function scanSubagents(
  repoRoot: string,
  platformId: string,
): Promise<SubagentAgentEntry[]> {
  const cap = resolveSubagentCapability(platformId);
  if (!cap.supportsSubagent) {
    return [];
  }
  const seen = new Set<string>();
  const agents: SubagentAgentEntry[] = [];
  for (const relDir of getSubagentScanRelativeDirs(platformId)) {
    for (const agent of await scanDirectoryAgents(repoRoot, relDir)) {
      const key = agent.path ?? agent.id;
      if (seen.has(key)) continue;
      seen.add(key);
      agents.push(agent);
    }
  }
  if (agents.length === 0 && platformId.trim() === 'cursor') {
    return CURSOR_BUILTINS.map((b) => ({ ...b, selected: false }));
  }
  return agents;
}

/**
 * 按 task_type 预筛 matched_agents（专精在前，通用在后）。
 */
export function matchAgentsByTaskType(
  agents: SubagentAgentEntry[],
  taskType: string | undefined,
): SubagentAgentEntry[] {
  if (!taskType?.trim()) {
    return agents.map((a) => ({ ...a }));
  }
  const t = taskType.trim();
  const specialized = agents.filter((a) => a.task_types.includes(t));
  const general = agents.filter((a) => a.task_types.length === 0);
  return [...specialized, ...general].map((a) => ({ ...a }));
}

/**
 * 在快照上应用 subagent_id / task_type 过滤（供缓存命中后复用）。
 */
export function applyProbeFilters(
  snapshot: SubagentProbeSnapshot,
  options: { subagent_id?: string; task_type?: string } = {},
): SubagentProbeSnapshot {
  const agents = snapshot.agents.map((a) => ({ ...a, selected: false }));
  let subagent_id_found = false;
  const want = options.subagent_id?.trim();
  if (want) {
    for (const a of agents) {
      if (a.id === want) {
        a.selected = true;
        subagent_id_found = true;
      }
    }
  }
  const matched_agents = matchAgentsByTaskType(agents, options.task_type);
  return {
    ...snapshot,
    agents,
    matched_agents,
    subagent_id_found,
  };
}

/**
 * 组装与 subagent-probe 输出同构的会话快照（无调用方过滤时 matched=agents）。
 */
export async function buildSubagentProbeSnapshot(
  repoRoot: string,
  platformId: string,
  options?: { reason?: string; agents?: SubagentAgentEntry[] },
): Promise<SubagentProbeSnapshot> {
  const id = platformId.trim();
  const cap = resolveSubagentCapability(id);
  const agents =
    options?.agents ??
    (cap.supportsSubagent ? await scanSubagents(repoRoot, id) : []);
  let reason = options?.reason;
  if (!reason) {
    if (cap.platformDegradation === 'inline') {
      reason = 'host_forced_inline';
    } else if (cap.platformDegradation === 'unsupported') {
      reason = 'unknown_platform';
    } else if (agents.length === 0) {
      reason = 'scan_empty';
    } else {
      reason = 'ok';
    }
  }
  return {
    platform: id,
    supports_subagent: cap.supportsSubagent,
    platform_degradation: cap.platformDegradation,
    agents,
    matched_agents: agents.map((a) => ({ ...a })),
    subagent_id_found: false,
    reason,
  };
}
