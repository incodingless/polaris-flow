import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: false
})

/**
 * 将 Markdown 转为 HTML（GFM：标题、列表、表格、任务清单、代码块等）
 */
export function renderMarkdown(md) {
  if (!md) return ''
  const text = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return marked.parse(text)
}

/** 判断文件是否按 Markdown 渲染 */
export function isMarkdownFile(file) {
  const name = (file?.name || file?.path || '').toLowerCase()
  return name.endsWith('.md') || name.endsWith('.markdown')
}
