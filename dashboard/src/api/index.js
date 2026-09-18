const BASE = '/api'

function projectQuery(project, extraParams = {}) {
  const params = new URLSearchParams()
  if (project?.path) params.set('project', project.path)
  for (const [key, value] of Object.entries(extraParams)) {
    if (value != null && value !== '') params.set(key, value)
  }
  const qs = params.toString()
  return qs ? '?' + qs : ''
}

/** 统一解析 API 响应，返回 { data } 或 { error } */
async function parseResponse(res) {
  let data
  try {
    data = await res.json()
  } catch {
    return { error: `请求失败 (${res.status})` }
  }
  if (!res.ok || data.error) {
    return { error: data.error || `请求失败 (${res.status})` }
  }
  return { data }
}

export async function fetchProjects() {
  const res = await fetch(BASE + '/projects')
  const result = await parseResponse(res)
  if (result.error) return result
  return {
    data: {
      projects: result.data.projects || [],
      defaultProjectId: result.data.defaultProjectId ?? null
    }
  }
}

/** 设置默认项目（全局互斥） */
export async function setDefaultProject(id) {
  const res = await fetch(BASE + '/projects/default', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
  return parseResponse(res)
}

export async function addProject(name, path) {
  const res = await fetch(BASE + '/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, path })
  })
  const result = await parseResponse(res)
  if (result.error) return result
  return { data: result.data.project }
}

export async function deleteProject(id) {
  const url = BASE + '/projects?id=' + encodeURIComponent(id)
  const res = await fetch(url, { method: 'DELETE' })
  return parseResponse(res)
}

/** 列出指定目录下的子目录 */
export async function fetchDir(parentDir) {
  const url = BASE + '/dirs?path=' + encodeURIComponent(parentDir)
  const res = await fetch(url)
  const result = await parseResponse(res)
  if (result.error) return result
  return { data: result.data.dirs || [] }
}

/** 检查目录下是否存在 openspec 子目录 */
export async function fetchCheckOpenspec(dirPath) {
  const url = BASE + '/check-openspec?path=' + encodeURIComponent(dirPath)
  const res = await fetch(url)
  const result = await parseResponse(res)
  if (result.error) return result
  return { data: { exists: result.data.exists === true } }
}

/** 获取变更列表 */
export async function fetchChanges(project, filter = 'active') {
  const res = await fetch(BASE + '/changes' + projectQuery(project, { filter }))
  const result = await parseResponse(res)
  if (result.error) return result
  return {
    data: {
      tasks: result.data.tasks || [],
      counts: result.data.counts || { active: 0, archived: 0 }
    }
  }
}

/** fetchChanges 别名，兼容旧调用 */
export const fetchTasks = fetchChanges

/** 获取单个变更详情 */
export async function fetchChangeDetail(project, name) {
  const res = await fetch(
    BASE + '/changes/' + encodeURIComponent(name) + projectQuery(project)
  )
  return parseResponse(res)
}

/** 获取 workflow 阶段定义（用于查看面板 Tab） */
export async function fetchWorkflowPhases(workflowId) {
  if (!workflowId) return { error: '缺少 workflow 名称' }
  const res = await fetch(BASE + '/workflow/' + encodeURIComponent(workflowId) + '/phases')
  return parseResponse(res)
}

/** 获取 workflow 产出物定义（用于文件分组） */
export async function fetchWorkflowArtifacts(workflowId) {
  if (!workflowId) return { error: '缺少 workflow 名称' }
  const res = await fetch(BASE + '/workflow/' + encodeURIComponent(workflowId) + '/artifacts')
  return parseResponse(res)
}

/** 获取指定步骤的可执行操作列表 */
export async function fetchWorkflowStepOperations(workflowId, stepId) {
  if (!workflowId || !stepId) return { error: '缺少 workflow 或步骤' }
  const url = BASE + '/workflow/' + encodeURIComponent(workflowId)
    + '/steps/' + encodeURIComponent(stepId) + '/operations'
  const res = await fetch(url)
  return parseResponse(res)
}

/** 执行变更步骤操作（如继续、评审等） */
export async function executeChangeStepOperation(project, changeName, stepId, operation) {
  if (!changeName || !stepId || !operation?.code) {
    return { error: '缺少变更、步骤或操作' }
  }
  const url = BASE + '/changes/' + encodeURIComponent(changeName)
    + '/steps/' + encodeURIComponent(stepId) + '/operations'
    + projectQuery(project)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: operation.code,
      target: operation.target || undefined
    })
  })
  return parseResponse(res)
}

/** 对指定变更执行 openspec validate 结构校验 */
export async function validateChange(project, changeName) {
  if (!changeName) return { error: '缺少变更名称' }
  const url = BASE + '/changes/' + encodeURIComponent(changeName) + '/validate'
    + projectQuery(project)
  const res = await fetch(url, { method: 'POST' })
  return parseResponse(res)
}

export async function fetchStats() {
  const res = await fetch(BASE + '/stats')
  return res.json()
}

/** 列出项目配置文件 */
export async function fetchConfigs(project) {
  const res = await fetch(BASE + '/configs' + projectQuery(project))
  const result = await parseResponse(res)
  if (result.error) return result
  const files = Array.isArray(result.data) ? result.data : (result.data?.files || [])
  return { data: files }
}

/** 获取单个配置文件内容 */
export async function fetchConfigContent(project, configPath) {
  const res = await fetch(
    BASE + '/configs/' + configPath.split('/').map(encodeURIComponent).join('/') + projectQuery(project)
  )
  return parseResponse(res)
}

/** 在系统文件管理器中打开目录或文件 */
export async function revealPath(absPath) {
  const res = await fetch(BASE + '/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: absPath })
  })
  return parseResponse(res)
}

/** 运行项目环境诊断 */
export async function fetchCheck(project) {
  const res = await fetch(BASE + '/check' + projectQuery(project))
  return parseResponse(res)
}

/** @deprecated 使用 fetchCheck */
export async function fetchChecks(project) {
  return fetchCheck(project)
}
