function emptyMat() {
  return { title: "", text: "", titleKk: "", result: null, checking: false, error: null, confirmed: false, published: false };
}

function renderMaterials() {
  const M = state.mat;
  const s = state.subject;
  const R = M.result;

  const list = s.topics.map((tp, i) => `
    <div class="mat-item">
      <span class="topic-num">${i + 1}</span>
      <div class="mat-item-body">
        <button class="link-btn" data-action="view-topic" data-id="${tp.id}">${esc(L(tp.title) || tp.title.ru)}</button>
        <span class="tag">${tp.custom ? t("custom_lecture") : t("builtin_lecture")}</span>
      </div>
      ${tp.custom ? `<button class="btn-ghost small" data-action="mat-delete" data-id="${tp.id}" ${M.checking ? "disabled" : ""}>${t("mat_delete")}</button>` : ""}
    </div>`).join("");

  const result = R ? `
    <div class="mat-result">
      <div class="grade-sub">${t("mat_issues")}</div>
      ${R.issues.length ? R.issues.map((i) => `
        <div class="issue ${i.severity}">
          <div class="issue-head">${icon(i.severity === "error" ? "x" : "half")} <b>${t(i.severity === "error" ? "mat_error" : "mat_warning")}</b>
            ${i.quoteFound ? "" : `<span class="tag">${t("mat_quote_missing")}</span>`}</div>
          <div class="issue-quote">«${format(i.quote)}»</div>
          <div>${format(i.problem)}</div>
          ${i.suggestion ? `<div class="issue-fix"><b>${t("mat_fix")}:</b> ${format(i.suggestion)}</div>` : ""}
        </div>`).join("") : `<div class="review ok">${icon("check")} <div>${t("mat_no_issues")}</div></div>`}
      ${R.issues.length ? `<p class="hint">${t("mat_edit_hint")}</p>` : ""}

      <div class="grade-sub">${t("mat_sections")}</div>
      <ol class="mat-sections">${R.sections.map((x) => `<li>${esc(x.title)} <span class="muted-text">· ${x.chars} ${t("mat_chars")}</span></li>`).join("")}</ol>

      <label class="field">${t("mat_title_kk")}
        <input data-mat="titleKk" value="${esc(M.titleKk)}">
      </label>
      <label class="confirm">
        <input type="checkbox" data-mat="confirmed" ${M.confirmed ? "checked" : ""}>
        <span>${t("mat_confirm")}</span>
      </label>
      <button class="btn btn-primary" data-action="mat-publish" ${M.checking ? "disabled" : ""}>${icon("check")} ${t("mat_publish")}</button>
    </div>` : "";

  return `
    <div class="work">
      <aside class="sidebar mat-list">
        <div class="sidebar-title">${t("mat_list")}</div>
        ${list}
      </aside>
      <section class="panel">
        <header class="panel-head">
          <span class="card-icon small">${icon("book")}</span>
          <div>
            <div class="panel-title">${t("mode_materials")} · ${t("mat_new")}</div>
            <div class="panel-sub">${L(s.name)}</div>
          </div>
        </header>
        <div class="panel-body">
          ${M.published ? `<div class="review ok">${icon("check")} <div>${t("mat_published")}</div></div>` : ""}
          <label class="field">${t("mat_title")}
            <input data-mat="title" value="${esc(M.title)}" maxlength="120">
          </label>
          <label class="field">${t("mat_text")}
            <textarea data-mat="text" rows="12" maxlength="12000">${esc(M.text)}</textarea>
          </label>
          <div class="mat-actions">
            <span class="hint">${t("mat_text_hint")} · <span id="mat-count">${M.text.length}</span></span>
            <label class="btn-ghost file-btn">${icon("filePlus")} ${t("mat_file")}
              <input type="file" id="mat-file" accept=".txt,.md,text/plain,text/markdown" hidden>
            </label>
            <button class="btn btn-primary" data-action="mat-check" ${M.checking ? "disabled" : ""}>${icon("shield")} ${t("mat_check")}</button>
          </div>
          ${M.checking ? `<div class="steps"><div class="step active">${icon("shield")} ${t("mat_checking")}</div></div>` : ""}
          ${M.error ? `<div class="msg bot error">${esc(M.error)}</div>` : ""}
          ${result}
        </div>
      </section>
    </div>`;
}

async function matCheck() {
  const M = state.mat;
  Object.assign(M, { checking: true, error: null, result: null, confirmed: false, published: false });
  render();
  try {
    const data = await apiAI("/api/materials", { action: "check", subject: state.subject.id, title: M.title, text: M.text });
    M.result = data;
    M.titleKk = data.titleKk || M.titleKk;
  } catch (err) {
    if (err.message === "unauthorized") return;
    M.error = errorText(err);
  }
  M.checking = false;
  render();
}

async function matPublish() {
  const M = state.mat;
  if (!M.confirmed) { M.error = t("mat_confirm"); render(); return; }
  M.checking = true;
  render();
  try {
    await api("/api/materials", {
      action: "publish", subject: state.subject.id, title: M.title, titleKk: M.titleKk,
      markdown: M.result.markdown, confirmed: true,
    });
    await reloadSubject();
    state.mat = { ...emptyMat(), published: true };
  } catch (err) {
    if (err.message === "unauthorized") return;
    M.error = errorText(err);
    M.checking = false;
  }
  render();
}

async function matDelete(id) {
  if (!confirm(t("mat_delete_confirm"))) return;
  try {
    await api("/api/materials", { action: "delete", subject: state.subject.id, id });
    await reloadSubject();
  } catch (err) {
    if (err.message === "unauthorized") return;
    state.mat.error = errorText(err);
  }
  render();
}

async function reloadSubject() {
  await loadSubjects();
  state.subject = state.subjects.find((x) => x.id === state.subject.id);
}

document.addEventListener("input", (e) => {
  const f = e.target.dataset?.mat;
  if (!f || f === "confirmed") return;
  state.mat[f] = e.target.value;
  if (f === "text") {
    const c = document.getElementById("mat-count");
    if (c) c.textContent = e.target.value.length;
  }
});

document.addEventListener("change", async (e) => {
  if (e.target.dataset?.mat === "confirmed") state.mat.confirmed = e.target.checked;
  if (e.target.id === "mat-file" && e.target.files[0]) {
    const file = e.target.files[0];
    state.mat.text = (await file.text()).slice(0, 12000);
    if (!state.mat.title) state.mat.title = file.name.replace(/\.(txt|md)$/i, "");
    state.mat.result = null;
    render();
  }
});
