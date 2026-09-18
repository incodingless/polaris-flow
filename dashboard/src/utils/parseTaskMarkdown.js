const UNGROUPED_TITLE = '未分组'
const HEADING_RE = /^(#{1,3})\s+(.+)/
const CHECKBOX_RE = /^\s*- \[(.)\] (.+)/

/** 计算分组进度统计 */
function sectionStats(items) {
  const totalCount = items.length
  const doneCount = items.filter((item) => item.done).length
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0
  return { doneCount, totalCount, pct }
}

/** 创建空分组 */
function createSection(id, title) {
  return {
    id,
    title,
    items: [],
    doneCount: 0,
    totalCount: 0,
    pct: 0
  }
}

/** 刷新分组进度字段 */
function finalizeSection(section) {
  const stats = sectionStats(section.items)
  section.doneCount = stats.doneCount
  section.totalCount = stats.totalCount
  section.pct = stats.pct
  return section
}

/**
 * 将 Markdown 解析为任务看板数据结构
 * @param {string} content - 文件原始内容
 * @param {string} [fallbackTitle=''] - 无 # 标题时的回退标题
 */
export function parseTaskMarkdown(content, fallbackTitle = '') {
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = text.split('\n')

  let docTitle = ''
  let currentSection = null
  let sectionIndex = 0
  let taskIndex = 0
  const sections = []

  function ensureSection(title = UNGROUPED_TITLE) {
    if (currentSection && currentSection.title === title) return currentSection
    currentSection = createSection(`section-${sectionIndex++}`, title)
    sections.push(currentSection)
    return currentSection
  }

  for (const line of lines) {
    const headingMatch = line.match(HEADING_RE)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      if (level === 1) {
        // 文档标题只取首个一级标题，避免后续误用 # 的任务行覆盖标题
        if (!docTitle) docTitle = title
        continue
      }
      if (level >= 2) {
        currentSection = createSection(`section-${sectionIndex++}`, title)
        sections.push(currentSection)
        continue
      }
    }

    const checkboxMatch = line.match(CHECKBOX_RE)
    if (checkboxMatch) {
      const section = currentSection || ensureSection()
      section.items.push({
        index: taskIndex++,
        text: checkboxMatch[2].trim(),
        done: checkboxMatch[1].toLowerCase() === 'x'
      })
    }
  }

  const finalizedSections = sections.map(finalizeSection).filter((section) => section.totalCount > 0)
  const overallTotal = finalizedSections.reduce((sum, section) => sum + section.totalCount, 0)
  const overallDone = finalizedSections.reduce((sum, section) => sum + section.doneCount, 0)
  const overallPct = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0

  return {
    title: docTitle || fallbackTitle || '任务文档',
    sections: finalizedSections,
    overallDone,
    overallTotal,
    overallPct
  }
}
