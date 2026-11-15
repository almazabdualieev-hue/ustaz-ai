function mdInline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/⟦/g, "<mark>").replace(/⟧/g, "</mark>");
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let para = [], list = null, table = null, section = false;

  const flush = () => {
    if (para.length) { out.push(`<p>${mdInline(para.join(" "))}</p>`); para = []; }
    if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${mdInline(i)}</li>`).join("")}</${list.tag}>`); list = null; }
    if (table) {
      const [head, ...rows] = table;
      out.push(`<div class="table-wrap"><table class="lec-table"><thead><tr>${head.map((c) => `<th>${mdInline(c)}</th>`).join("")}</tr></thead>` +
        `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${mdInline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      table = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      flush();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith("```")) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join("\n")).replace(/⟦|⟧/g, "")}</code></pre>`);
      continue;
    }
    let m;
    if ((m = /^##\s+(\d+)\.\s+(.+)$/.exec(line))) {
      flush();
      if (section) out.push("</section>");
      out.push(`<section class="lec-sec" id="sec-${m[1]}" data-n="${m[1]}"><h3>§ ${m[1]}. ${mdInline(m[2])}</h3>`);
      section = true;
    } else if (/^#\s+/.test(line)) {
      flush();
    } else if (/^\s*\|/.test(line)) {
      if (para.length || list) flush();
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      (table = table || []).push(cells);
    } else if ((m = /^\s*[-*]\s+(.+)$/.exec(line)) || (m = /^\s*\d+\.\s+(.+)$/.exec(line))) {
      const tag = /^\s*\d+\./.test(line) ? "ol" : "ul";
      if (para.length || table || (list && list.tag !== tag)) flush();
      (list = list || { tag, items: [] }).items.push(m[1]);
    } else if (!line.trim()) {
      flush();
    } else {
      if (list || table) flush();
      para.push(line.trim());
    }
  }
  flush();
  if (section) out.push("</section>");
  return out.join("\n");
}

function markQuote(md, quote) {
  const q = String(quote || "").trim();
  if (q.length < 10) return md;
  const words = q.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const m = new RegExp(words.join("\\s+"), "i").exec(md);
  if (!m || m[0].includes("\n\n")) return md;
  return md.slice(0, m.index) + "⟦" + m[0] + "⟧" + md.slice(m.index + m[0].length);
}

async function openLecture(source) {
  state.viewer = { ...source, loading: true };
  render();
  try {
    const data = await api(`/api/lecture?subject=${state.subject.id}&id=${encodeURIComponent(source.lecture)}`);
    state.viewer = { ...source, data };
  } catch (err) {
    if (err.message === "unauthorized") return;
    state.viewer = { ...source, error: true };
  }
  render();
  const box = document.querySelector("#modal .modal-body");
  const target = document.querySelector("#modal mark") || document.getElementById("sec-" + source.section);
  if (box && target) {
    box.scrollTop += target.getBoundingClientRect().top - box.getBoundingClientRect().top - 24;
  }
}

function renderModal() {
  const v = state.viewer;
  if (!v) return "";
  const verifiedText = v.verified === "exact" ? t("verified_exact") : v.verified === "close" ? t("verified_close") : t("verified_no");

  let body = `<div class="typing"><span></span><span></span><span></span> ${t("loading")}</div>`;
  if (v.error) body = `<div class="msg bot error">${t("error_generic")}</div>`;
  if (v.data) {
    body = mdToHtml(markQuote(v.data.text, v.quote))
      .replace(`class="lec-sec" id="sec-${v.section}"`, `class="lec-sec target" id="sec-${v.section}"`);
  }

  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <div class="modal" id="modal" role="dialog" aria-modal="true">
      <header class="modal-head">
        <span class="card-icon small">${icon("book")}</span>
        <div class="modal-title">${v.data ? `${t("open_lecture")} ${v.data.num}. ${esc(L(v.data.title) || v.data.title.ru)}` : ""}</div>
        <button class="btn-ghost" data-action="close-modal" aria-label="${t("close")}">✕</button>
      </header>
      ${v.quote ? `
        <div class="quote-box ${v.verified ? "ok" : "bad"}">
          <div class="quote-label">${t("quote_from_ai")}:</div>
          <div class="quote-text">«${esc(v.quote)}»</div>
          <div class="quote-status">${icon(v.verified ? "check" : "x")} ${verifiedText}</div>
        </div>` : ""}
      <div class="modal-body lecture ${v.section ? "has-target" : ""}" data-target="${v.section || ""}">${body}</div>
    </div>`;
}
