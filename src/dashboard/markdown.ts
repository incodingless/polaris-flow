export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  let html = '';
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = '';
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let paragraphLines: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      html += `<p>${paragraphLines.map(inlineFormat).join('<br>')}</p>\n`;
      paragraphLines = [];
    }
  }

  function flushList() {
    if (inList) {
      html += `</${listType}>\n`;
      inList = false;
    }
  }

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const langAttr = codeLang ? ` class="language-${codeLang}"` : '';
        html += `<pre><code${langAttr}>${escapeHtml(codeContent.trim())}</code></pre>\n`;
        codeContent = '';
        codeLang = '';
        inCodeBlock = false;
      } else {
        flushParagraph();
        flushList();
        codeLang = line.slice(3).trim();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1]!.length;
      html += `<h${level}>${inlineFormat(headingMatch[2]!)}</h${level}>\n`;
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-*_]{3,}\s*$/)) {
      flushParagraph();
      flushList();
      html += '<hr>\n';
      continue;
    }

    // Checkbox (must come before unordered list to match first)
    const cbMatch = line.match(/^(\s*)- \[(.)\] (.+)/);
    if (cbMatch) {
      flushParagraph();
      if (!inList || listType !== 'ul') {
        flushList();
        html += '<ul class="task-list">\n';
        listType = 'ul';
        inList = true;
      }
      const checked = cbMatch[2] !== ' ';
      html += `<li class="task-item"><input type="checkbox" disabled${checked ? ' checked' : ''}>${inlineFormat(cbMatch[3]!)}</li>\n`;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^(\s*)- (.+)/);
    if (ulMatch) {
      flushParagraph();
      if (!inList || listType !== 'ul') {
        flushList();
        html += '<ul>\n';
        listType = 'ul';
        inList = true;
      }
      html += `<li>${inlineFormat(ulMatch[2]!)}</li>\n`;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\s*)\d+\. (.+)/);
    if (olMatch) {
      flushParagraph();
      if (!inList || listType !== 'ol') {
        flushList();
        html += '<ol>\n';
        listType = 'ol';
        inList = true;
      }
      html += `<li>${inlineFormat(olMatch[2]!)}</li>\n`;
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      flushParagraph();
      flushList();
      continue;
    }

    // Paragraph
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();

  if (html === '') {
    html = `<p>${escapeHtml(md)}</p>`;
  }

  return html;
}

function inlineFormat(text: string): string {
  // Inline code (backticks)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Images
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  return text;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
