/** 归一化文件路径 */
function normalizePath(file) {
  return (file?.path || file?.name || '').replace(/\\/g, '/')
}

/** 取文件名（含子目录时保留相对路径作为展示名） */
export function fileDisplayName(file) {
  const path = normalizePath(file)
  return path || file?.name || '未命名文件'
}

/** 文件唯一键，用于列表选中状态 */
export function fileKey(file) {
  return normalizePath(file) || file?.name || ''
}

/** 判断变更文件是否匹配 workflow 产出物定义 */
function artifactMatchesFile(filePath, artifact) {
  if (!artifact?.file) return false
  const artifactPath = String(artifact.file).replace(/\\/g, '/').toLowerCase()
  if (artifact.check === 'dir-has-md') {
    return filePath === artifactPath || filePath.startsWith(`${artifactPath}/`)
  }
  return filePath === artifactPath
}

/** 查找文件所属阶段编码 */
function findPhaseCodeForFile(file, artifactPhases) {
  const path = normalizePath(file).toLowerCase()
  for (const phase of artifactPhases) {
    for (const artifact of phase.artifacts || []) {
      if (artifactMatchesFile(path, artifact)) {
        return phase.code
      }
    }
  }
  return null
}

/** 按 workflow 定义将变更文件划分到各 Tab */
export function categorizeChangeFiles(
  files = [],
  artifactPhases = [],
  workflowPhases = [],
  specFiles = []
) {
  const result = {}
  const phaseCodes = new Set([
    ...workflowPhases.map((phase) => phase.code),
    ...artifactPhases.map((phase) => phase.code)
  ])
  for (const code of phaseCodes) {
    result[code] = []
  }

  if (result.specs) {
    result.specs = [...specFiles]
  }

  const assignedKeys = new Set(result.specs?.map((file) => fileKey(file)) || [])

  const otherCode = [...phaseCodes].find((code) => code === 'other')

  for (const file of files) {
    const key = fileKey(file)
    if (assignedKeys.has(key)) continue

    const phaseCode = findPhaseCodeForFile(file, artifactPhases)
    if (phaseCode && result[phaseCode]) {
      result[phaseCode].push(file)
      assignedKeys.add(key)
      continue
    }
    if (otherCode && result[otherCode]) {
      result[otherCode].push(file)
      assignedKeys.add(key)
    }
  }

  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => fileDisplayName(a).localeCompare(fileDisplayName(b)))
  }
  return result
}

/** 根据 workflow phases 与文件分组生成 Tab 列表 */
export function buildDetailTabs(workflowPhases = [], filesByTab = {}) {
  return workflowPhases.map((phase) => ({
    id: phase.code,
    label: phase.name,
    count: filesByTab[phase.code]?.length ?? 0
  }))
}

/** 取指定 Tab 下的文件列表 */
export function getTabFiles(filesByTab, tabId) {
  return filesByTab[tabId] || []
}

/** 解析 workflow phases 接口响应 */
/** 解析步骤操作接口响应 */
/** 解析 workflow artifacts 接口响应（用于文件分组） */
/** 取第一个 Tab id，用于默认选中 */
export function getDefaultDetailTabId(workflowPhases = []) {
  return workflowPhases[0]?.code || ''
}
