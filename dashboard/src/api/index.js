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

/** 检查目录是否已 polaris init（判据：.polaris/config.yaml 存在） */
export async function fetchCheckInitialized(dirPath) {
  const url = BASE + '/check-initialized?path=' + encodeURIComponent(dirPath)
  const res = await fetch(url)
  const result = await parseResponse(res)
  if (result.error) return result
  return { data: { exists: result.data.exists === true } }
}

/**
 * 获取任务列表。
 * @param {object} project 当前项目（取 path 作为 ?project=）
 * @param {{status?: 'active'|'archived'|'all', kind?: string}} options
 */
export async function fetchTasks(project, options = {}) {
  const { status = 'active', kind } = options
  const res = await fetch(BASE + '/tasks' + projectQuery(project, { status, kind }))
  const result = await parseResponse(res)
  if (result.error) return result
  return {
    data: {
      tasks: result.data.tasks || [],
      counts: result.data.counts || { active: 0, archived: 0, by_kind: {} }
    }
  }
}

/** 获取单个任务详情 */
export async function fetchTaskDetail(project, taskId, kind) {
  const res = await fetch(
    BASE + '/tasks/' + encodeURIComponent(taskId) + projectQuery(project, { kind })
  )
  return parseResponse(res)
}

/**
 * 校验任务的计划文件（只读，跑 CLI 的 tasks-lint）。
 * 响应形状：{ pass: boolean|null, violations: string[], file: string, reason: string }
 * `pass` 为 null 表示「没有可校验的计划文件」，不是失败。
 */
export async function fetchTaskPlanLint(project, taskId, kind) {
  const res = await fetch(
    BASE +
      '/tasks/' +
      encodeURIComponent(taskId) +
      '/plan-lint' +
      projectQuery(project, { kind })
  )
  return parseResponse(res)
}

/**
 * 推进任务的阶段（写）。
 *
 * 只写游标，且后端只接受**严格更晚**的阶段（回退留痕属后续切片）。
 * `kind` 带上是为了让后端在 id 重名时能定位到正确的游标数组。
 */
export async function advanceTaskPhase(project, taskId, to, kind) {
  const res = await fetch(
    BASE + '/tasks/' + encodeURIComponent(taskId) + '/phase' + projectQuery(project, { kind }),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to })
    }
  )
  return parseResponse(res)
}

/**
 * 勾选计划文件的一行（写）。
 *
 * `index` 是**第几个复选框（0-based，按出现顺序）**，不是行号 —— 与看板渲染的
 * `item.index` 同源。`file` 可省略，省略时后端按产物表推导计划文件（前端不需要
 * 知道各 kind 的计划文件在哪）。
 */
export async function setTaskCheckbox(project, taskId, index, checked, options = {}) {
  const { file, kind } = options
  const res = await fetch(
    BASE + '/tasks/' + encodeURIComponent(taskId) + '/checkbox' + projectQuery(project, { kind }),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, checked, file })
    }
  )
  return parseResponse(res)
}

/**
 * 交付清理（**不可逆**）。
 *
 * 必须显式二选一：`dryRun: true` 只返回将删除的路径与将移除的游标条目，
 * 真删要再调一次且不带 dryRun（后端要求 body 里出现 confirm:true）——
 * 「默认执行」的默认值在这种操作上等于没有确认。
 */
export async function cleanupTask(project, taskId, options = {}) {
  const { dryRun = false, kind } = options
  const res = await fetch(
    BASE + '/tasks/' + encodeURIComponent(taskId) + '/cleanup' + projectQuery(project, { kind }),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dryRun ? { dry_run: true } : { confirm: true })
    }
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

export async function fetchStats(project) {
  const res = await fetch(BASE + '/stats' + projectQuery(project))
  return parseResponse(res)
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

