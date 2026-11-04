function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return t;
}

export function renderMarkdown(src, { tryIt = false } = {}) {
  const lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  const flushPara = (buf) => {
    if (!buf.length) return;
    html += `<p>${inline(buf.join(" "))}</p>`;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim().split(/\s+/)[0] || "";
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      const code = buf.join("\n");
      html += `<pre class="codeblock" data-lang="${escapeHtml(lang)}"><code>${escapeHtml(code)}</code></pre>`;
      if (tryIt && (lang === "python" || lang === "py" || lang === "sql")) {
        html += `<div class="trybar"><button type="button" class="btn ghost" data-act="try" data-lang="${escapeHtml(lang)}" data-code="${encodeURIComponent(code)}">Try it</button></div>`;
      }
      continue;
    }
    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      html += `<h${level}>${inline(h[2])}</h${level}>`;
      i += 1;
      continue;
    }
    if (/^(\s*[-*])\s+/.test(line)) {
      html += "<ul>";
      while (i < lines.length && /^(\s*[-*])\s+/.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`;
        i += 1;
      }
      html += "</ul>";
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      html += "<ol>";
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        html += `<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`;
        i += 1;
      }
      html += "</ol>";
      continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith("```") && !/^#{1,3}\s/.test(lines[i]) && !/^(\s*[-*]|\s*\d+\.)\s+/.test(lines[i])) {
      buf.push(lines[i].trim());
      i += 1;
    }
    flushPara(buf);
  }
  return html;
}
