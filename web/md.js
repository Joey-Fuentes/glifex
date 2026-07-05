// Minimal markdown renderer for problem statements and editorials.
// Deliberately tiny (headings, fenced code, inline code, bold, lists, paras)
// and ESCAPE-FIRST: all input is HTML-escaped before any markup is applied,
// so no content can inject markup regardless of provenance.
function renderMarkdown(src) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc(src).split("\n");
  const out = [];
  let inCode = false, inList = false, para = [];

  const flushPara = () => {
    if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; }
  };
  const flushList = () => { if (inList) { out.push("</ul>"); inList = false; } };
  const inline = (s) => s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>");

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      flushPara(); flushList();
      out.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode; continue;
    }
    if (inCode) { out.push(raw); continue; }
    const h = raw.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushPara(); flushList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const li = raw.match(/^\s*[-*]\s+(.*)$/) || raw.match(/^\s*\d+\.\s+(.*)$/);
    if (li) { flushPara(); if (!inList) { out.push("<ul>"); inList = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (!raw.trim()) { flushPara(); flushList(); continue; }
    para.push(raw.trim());
  }
  flushPara(); flushList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}
if (typeof module !== "undefined") module.exports = { renderMarkdown };
if (typeof window !== "undefined") window.renderMarkdown = renderMarkdown;
