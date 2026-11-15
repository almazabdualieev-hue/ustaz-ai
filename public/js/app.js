const MODES = [
  { id: "explain", icon: "chat", role: "student" },
  { id: "socrat", icon: "help", role: "student", main: true },
  { id: "quiz", icon: "check", role: "student" },
  { id: "exam", icon: "award", role: "student" },
  { id: "tests", icon: "filePlus", role: "teacher" },
  { id: "materials", icon: "book", role: "teacher" },
  { id: "analytics", icon: "chart", role: "teacher" },
];

const PHOTO_MODES = ["explain", "socrat", "exam"];

const SUBJECT_ICONS = { informatics: "code", math: "sigma" };

const state = {
  user: null,
  subjects: [],
  screen: "home",
  subject: null,
  mode: null,
  topic: null,
  messages: [],
  busy: false,
  quiz: { started: false, question: 0, done: false },
  exam: { ticket: null, graded: false },
  tests: { count: 5, questions: [], step: null, batch: 0, batches: 0 },
  analytics: null,
  viewer: null,
  photo: null,
  mat: emptyMat(),
  loginError: false,
};

let SOURCES = [];

function srcChip(s) {
  if (!s) return "";
  const i = SOURCES.push(s) - 1;
  const ok = s.verified === "exact" || s.verified === "close";
  const tip = !s.quote ? "" : ok ? (s.verified === "exact" ? t("verified_exact") : t("verified_close")) : t("verified_no");
  return `<button class="source ${s.quote ? (ok ? "verified" : "unverified") : ""}" data-src="${i}" title="${esc(tip)}">
    ${icon("book")} <span>${esc(s.label)}</span>${s.quote ? `<span class="v-icon">${icon(ok ? "check" : "x")}</span>` : ""}
  </button>`;
}

function getToken() {
  try { return localStorage.getItem("ustaz-token"); } catch (e) { return null; }
}

function userFromToken(token) {
  try {
    const data = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    return data.exp > Date.now() ? { login: data.login, role: data.role } : null;
  } catch (e) { return null; }
}

function logout() {
  try { localStorage.removeItem("ustaz-token"); } catch (e) {}
  Object.assign(state, { user: null, screen: "home", subject: null, mode: null, messages: [] });
  render();
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + getToken() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== "/api/login") { logout(); throw new Error("unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "error"), { code: data.error, retry: data.retry });
  return data;
}

async function apiAI(path, body) {
  try {
    return await api(path, body);
  } catch (err) {
    if (!["timeout", "overloaded"].includes(err.code)) throw err;
    await new Promise((r) => setTimeout(r, 2000));
    return await api(path, body);
  }
}

const ICONS = {
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  sigma: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  half: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.5 13 17 22l-5-3-5 3 1.5-9"/>',
  filePlus: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-4"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z"/><path d="M4 19.5V22h16"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  bulb: '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
};

function icon(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

const L = (obj) => obj[LANG];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function format(text) {
  return esc(text)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => `<pre><code>${code.replace(/\n$/, "")}</code></pre>`)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

function renderLogin() {
  return `
    <div class="login-wrap">
      <form class="card login-card" id="login-form">
        <span class="card-icon">${icon("lock")}</span>
        <h1>${t("login_title")}</h1>
        <p class="muted-text">${t("login_sub")}</p>
        <label class="field">${t("login_label")}
          <input name="login" autocomplete="username" required autofocus>
        </label>
        <label class="field">${t("password_label")}
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        ${state.loginError ? `<div class="form-error">${t("login_error")}</div>` : ""}
        <button class="btn btn-primary btn-wide" type="submit">${t("login_btn")}</button>
      </form>
    </div>`;
}

function renderHome() {
  return `
    <section class="hero">
      <h1>${t("hero_title")}</h1>
      <p>${t("hero_text")}</p>
      <div class="badges">
        <span class="badge">${icon("book")} ${t("badge_materials")}</span>
        <span class="badge">${icon("link")} ${t("badge_source")}</span>
        <span class="badge">${icon("shield")} ${t("badge_honest")}</span>
      </div>
    </section>

    <h2 class="section-title">${t("choose_subject")}</h2>
    <div class="grid grid-2">
      ${state.subjects.map((s) => `
        <button class="card subject-card" data-subject="${s.id}">
          <span class="card-icon">${icon(SUBJECT_ICONS[s.id] || "book")}</span>
          <span class="card-title">${L(s.name)}</span>
          <span class="card-meta">${s.topics.length} ${t("topics_count")}</span>
          <ul class="topic-preview">
            ${s.topics.map((tp) => `<li>${L(tp.title)}</li>`).join("")}
          </ul>
        </button>`).join("")}
    </div>`;
}

function modeCards(role) {
  return `<div class="grid grid-2">
    ${MODES.filter((m) => m.role === role).map((m) => `
      <button class="card mode-card ${m.main ? "is-main" : ""}" data-mode="${m.id}">
        <span class="card-icon">${icon(m.icon)}</span>
        <span class="card-title">${t("mode_" + m.id)}
          ${m.main ? `<span class="pill">${t("main_feature")}</span>` : ""}
        </span>
        <span class="card-desc">${t("mode_" + m.id + "_desc")}</span>
      </button>`).join("")}
  </div>`;
}

function renderModes() {
  const teacher = state.user.role === "teacher";
  return `
    <button class="link-back" data-action="home">${icon("back")} ${t("back")}</button>
    <h1 class="page-title">${L(state.subject.name)}</h1>
    ${teacher ? `<h2 class="section-title">${t("for_teacher")}</h2>${modeCards("teacher")}` : ""}
    <h2 class="section-title">${teacher ? t("for_student") : t("choose_mode")}</h2>
    ${modeCards("student")}`;
}

const topicTitle = (id) => {
  const tp = state.subject.topics.find((x) => x.id === id);
  return tp ? L(tp.title) : "";
};

function renderSidebar(allowAll) {
  return `
    <aside class="sidebar">
      <div class="sidebar-title">${t("topics")}</div>
      ${allowAll ? `<button class="topic ${state.topic === null ? "active" : ""}" data-topic="">${t("all_topics")}</button>` : ""}
      ${state.subject.topics.map((tp, i) => `
        <button class="topic ${state.topic === tp.id ? "active" : ""}" data-topic="${tp.id}" ${state.busy || state.tests.step ? "disabled" : ""}>
          <span class="topic-num">${i + 1}</span>${L(tp.title)}
        </button>`).join("")}
    </aside>`;
}

function renderMessage(m) {
  if (m.hidden) return "";
  if (m.role === "user") return `<div class="msg user">${m.image ? `<img class="msg-img" src="${m.image.url}" alt="">` : ""}${esc(m.text)}</div>`;

  if (m.type === "ticket") return `
    <div class="msg bot ticket">
      <div class="ticket-head">${icon("award")} ${t("ticket_label")} <span class="tag">${t("max_points")}: ${m.maxPoints}</span></div>
      <div class="msg-text">${format(m.text)}</div>
      <div class="hint">${t("exam_answer_hint")}</div>
    </div>`;

  if (m.type === "grade") {
    const level = m.percent >= 85 ? "correct" : m.percent >= 50 ? "partial" : "incorrect";
    return `
    <div class="msg bot grade">
      <div class="grade-head">
        <span>${t("exam_result")}</span>
        <span class="score ${level}">${m.total} / ${m.max} · ${m.percent}%</span>
      </div>
      <div class="grade-sub">${t("criteria_title")}</div>
      <div class="criteria">
        ${m.criteria.map((c) => `
          <div class="crit">
            <div class="crit-points ${c.points === c.max ? "full" : c.points === 0 ? "zero" : ""}">${c.points}/${c.max}</div>
            <div><div class="crit-name">${format(c.criterion)}</div><div class="crit-comment">${format(c.comment)}</div></div>
          </div>`).join("")}
      </div>
      ${m.missed.length ? `<div class="grade-sub">${t("missed_title")}</div><ul class="missed">${m.missed.map((x) => `<li>${format(x)}</li>`).join("")}</ul>` : ""}
      ${m.feedback ? `<div class="msg-text feedback">${format(m.feedback)}</div>` : ""}
      ${m.sources?.length ? `<div class="sources">${m.sources.map(srcChip).join("")}</div>` : ""}
    </div>`;
  }

  const verdict = m.verdict ? `
    <div class="verdict ${m.verdict}">
      ${icon(m.verdict === "correct" ? "check" : m.verdict === "partial" ? "half" : "x")}
      ${t("verdict_" + m.verdict)}
    </div>` : "";
  const notFound = m.found === false ? `<div class="verdict partial">${icon("book")} ${t("not_found")}</div>` : "";
  const solved = m.solved ? `<div class="verdict correct">${icon("star")} ${t("solved")}</div>` : "";
  const sources = (m.sources || []).map(srcChip).join("");

  return `
    <div class="msg bot ${m.error ? "error" : ""}">
      ${verdict}${notFound}${solved}
      <div class="msg-text">${m.error ? esc(m.text) : format(m.text)}</div>
      ${sources ? `<div class="sources">${sources}</div>` : ""}
    </div>`;
}

function renderChat() {
  const m = MODES.find((x) => x.id === state.mode);
  const q = state.quiz;
  const isQuiz = state.mode === "quiz";

  let action = "";
  if (isQuiz) action = `<button class="btn btn-primary" data-action="quiz-start" ${state.busy ? "disabled" : ""}>${q.started ? t("restart") : t("start_quiz")}</button>`;
  if (state.mode === "exam") action = `<button class="btn btn-primary" data-action="exam-ticket" ${state.busy ? "disabled" : ""}>${state.exam.ticket ? t("new_ticket") : t("get_ticket")}</button>`;

  const inputOff = state.busy
    || (isQuiz && (!q.started || q.done))
    || (state.mode === "exam" && (!state.exam.ticket || state.exam.graded));

  return `
    <div class="work">
      ${renderSidebar(state.mode === "explain" || state.mode === "socrat")}
      <section class="panel chat">
        <header class="panel-head">
          <span class="card-icon small">${icon(m.icon)}</span>
          <div>
            <div class="panel-title">${t("mode_" + m.id)}</div>
            <div class="panel-sub">${L(state.subject.name)}${state.topic ? " · " + topicTitle(state.topic) : ""}</div>
          </div>
          <div class="spacer"></div>
          ${isQuiz && q.started ? `<span class="progress">${t("quiz_progress")} ${Math.max(q.question, 1)}/3</span>` : ""}
          ${state.topic ? `<button class="btn-ghost" data-action="open-lecture">${icon("book")} ${t("open_lecture")}</button>` : ""}
          ${action}
        </header>

        ${state.mode === "socrat" ? `<div class="banner">${icon("bulb")} ${t("socrat_banner")}</div>` : ""}

        <div class="messages" id="messages">
          <div class="msg bot"><div class="msg-text">${t("welcome_" + m.id)}</div></div>
          ${state.messages.map(renderMessage).join("")}
          ${state.busy ? `<div class="msg bot typing"><span></span><span></span><span></span> ${t("thinking")}</div>` : ""}
        </div>

        ${state.photo ? `
          <div class="photo-preview">
            <img src="${state.photo.url}" alt="">
            <span class="hint">${t("photo_note")}</span>
            <button class="btn-ghost small" data-action="remove-photo" aria-label="${t("close")}">✕</button>
          </div>` : ""}
        <form class="composer" id="composer">
          ${PHOTO_MODES.includes(state.mode) ? `
            <label class="btn-ghost attach ${inputOff ? "disabled" : ""}" title="${t("attach_photo")}" aria-label="${t("attach_photo")}">
              ${icon("camera")}
              <input type="file" id="photo-input" accept="image/*" hidden ${inputOff ? "disabled" : ""}>
            </label>` : ""}
          <textarea id="input" rows="1" placeholder="${t("placeholder")}" ${inputOff ? "disabled" : ""}></textarea>
          <button class="btn btn-primary btn-icon" type="submit" aria-label="${t("send")}" ${inputOff ? "disabled" : ""}>${icon("send")}</button>
        </form>
      </section>
    </div>`;
}

function renderTests() {
  const T = state.tests;
  const working = T.step !== null;

  const steps = working ? `
    <div class="steps">
      <div class="step ${T.step === "generate" ? "active" : "done"}">${icon(T.step === "generate" ? "filePlus" : "check")} ${t("step_generate")}</div>
      <div class="step ${T.step === "review" ? "active" : T.step === "generate" ? "" : "done"}">${icon("shield")} ${t("step_review")}</div>
      <div class="step">${icon("check")} ${t("step_check")}</div>
      ${T.batches > 1 ? `<div class="step-batch">${t("batch")} ${T.batch}/${T.batches}</div>` : ""}
      ${T.wait ? `<div class="step-batch">${t("waiting_limit").replace("{s}", T.wait)}</div>` : ""}
    </div>` : "";

  const cards = T.questions.map((q, i) => {
    const r = q.review || {};
    return `
    <div class="q-card">
      <div class="q-num">${i + 1}</div>
      <div class="q-body">
        <div class="q-text">${format(q.q)}</div>
        <ol class="q-options">
          ${q.options.map((o, j) => `<li class="${j === q.answer ? "correct" : ""}"><b>${"ABCD"[j]}</b> <span>${format(o)}</span></li>`).join("")}
        </ol>
        ${srcChip(q.source)}
        <div class="review ${r.status === "fixed" ? "fixed" : "ok"}">
          ${icon("shield")}
          <div><b>${t("reviewer")} · ${t(r.status === "fixed" ? "review_fixed" : "review_ok")}.</b> ${format(r.comment || "")}
          ${r.keyChanged ? `<div class="key-change">${t("key_changed")}: <s>${format(r.keyChanged.from)}</s> → <b>${format(r.keyChanged.to)}</b></div>` : ""}</div>
        </div>
        <div class="review ${q.checks.length ? "bad" : "ok"}">
          ${icon(q.checks.length ? "x" : "check")}
          <div>${q.checks.length ? q.checks.map((c) => t("check_" + c)).join(", ") : t("check_ok")}</div>
        </div>
      </div>
    </div>`;
  }).join("");

  return `
    <div class="work">
      ${renderSidebar(false)}
      <section class="panel">
        <header class="panel-head">
          <span class="card-icon small">${icon("filePlus")}</span>
          <div>
            <div class="panel-title">${t("mode_tests")}</div>
            <div class="panel-sub">${L(state.subject.name)}</div>
          </div>
          <div class="spacer"></div>
          <label class="count">${t("tests_count")}
            <select id="tests-count" ${working ? "disabled" : ""}>
              ${[5, 10].map((n) => `<option ${T.count === n ? "selected" : ""}>${n}</option>`).join("")}
            </select>
          </label>
          ${T.questions.length && !working ? `<button class="btn-ghost" data-action="tests-download">${icon("book")} ${t("download")}</button>` : ""}
          <button class="btn btn-primary" data-action="tests-generate" ${working ? "disabled" : ""}>${t("generate")}</button>
        </header>

        <div class="panel-body">
          ${!T.questions.length && !working && !T.error ? `<p class="hint">${t("tests_empty")}</p>` : ""}
          ${T.error ? `<div class="msg bot error">${esc(T.error)}</div>` : ""}
          ${cards}
          ${steps}
        </div>
      </section>
    </div>`;
}

async function loadAnalytics() {
  state.analytics = { loading: true };
  render();
  try {
    const tz = -new Date().getTimezoneOffset();
    const data = await api(`/api/analytics?subject=${state.subject.id}&tz=${tz}`);
    state.analytics = { data };
  } catch (err) {
    if (err.message === "unauthorized") return;
    state.analytics = { error: t("error_generic") };
  }
  render();
}

async function demoAnalytics(action) {
  state.analytics = { loading: true };
  render();
  try { await api("/api/analytics", { action }); } catch (e) {}
  loadAnalytics();
}

function renderAnalytics() {
  const s = state.subject;
  const A = state.analytics || {};
  const d = A.data;
  const dash = "—";
  const title = (id) => topicTitle(id);

  const head = `
    <button class="link-back" data-action="modes">${icon("back")} ${t("back")}</button>
    <div class="page-head">
      <h1 class="page-title">${t("mode_analytics")} · ${L(s.name)} ${d?.hasDemo ? `<span class="tag">${t("demo_on")}</span>` : ""}</h1>
      <div class="toolbar">
        <button class="btn-ghost" data-action="analytics-refresh" ${A.loading ? "disabled" : ""}>${icon("chart")} ${t("refresh")}</button>
        <button class="btn-ghost" data-action="${d?.hasDemo ? "analytics-clear-demo" : "analytics-demo"}" ${A.loading ? "disabled" : ""}>
          ${d?.hasDemo ? t("clear_demo") : t("add_demo")}
        </button>
      </div>
    </div>`;

  if (A.loading) return head + `<div class="card"><div class="typing"><span></span><span></span><span></span> ${t("loading")}</div></div>`;
  if (A.error) return head + `<div class="msg bot error">${esc(A.error)}</div>`;
  if (!d) return head;
  if (!d.total) return head + `<div class="card empty">${icon("chart")}<p>${t("no_data")}</p></div>`;

  const pct = (v) => (v === null || v === undefined ? dash : v + "%");
  const maxDay = Math.max(1, ...d.days.map((x) => x.count));

  return head + `
    <div class="grid grid-4 stats">
      <div class="card stat"><div class="stat-label">${t("stat_actions")}</div><div class="stat-value">${d.total}</div></div>
      <div class="card stat"><div class="stat-label">${t("stat_questions")}</div><div class="stat-value">${d.questions}</div></div>
      <div class="card stat"><div class="stat-label">${t("stat_correct")}</div><div class="stat-value">${pct(d.quizCorrect)}</div></div>
      <div class="card stat"><div class="stat-label">${t("stat_exam")}</div><div class="stat-value">${pct(d.examAvg)}</div></div>
    </div>

    ${d.hardest ? `<div class="callout">${icon("bulb")} <span>${t("stat_hardest")}: <b>${esc(title(d.hardest))}</b> — ${t("hardest_hint")}</span></div>` : ""}

    <div class="grid grid-2 charts">
      <div class="card chart-card">
        <div class="chart-title">${t("errors_by_topic")}</div>
        <div class="bars">
          ${d.topics.map((tp) => `
            <div class="bar-row" title="${esc(title(tp.id))}: ${pct(tp.errorRate)} (${tp.answers} ${t("answers_short")})">
              <div class="bar-label">${esc(title(tp.id))}</div>
              <div class="bar-track"><div class="bar" style="width:${tp.errorRate || 0}%"></div></div>
              <div class="bar-value">${pct(tp.errorRate)}</div>
            </div>`).join("")}
        </div>
      </div>

      <div class="card chart-card">
        <div class="chart-title">${t("activity_7d")}</div>
        <div class="columns">
          ${d.days.map((x) => `
            <div class="col" title="${x.date}: ${x.count}">
              <div class="col-value">${x.count || ""}</div>
              <div class="col-bar" style="height:${(x.count / maxDay) * 100}%"></div>
              <div class="col-label">${x.date.slice(8, 10)}.${x.date.slice(5, 7)}</div>
            </div>`).join("")}
        </div>
      </div>
    </div>

    <div class="card table-card">
      <div class="chart-title">${t("table_title")}</div>
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${t("col_topic")}</th><th>${t("col_questions")}</th><th>${t("col_answers")}</th>
            <th>${t("col_errors")}</th><th>${t("col_exams")}</th><th>${t("col_exam_avg")}</th>
          </tr></thead>
          <tbody>
            ${d.topics.map((tp) => `<tr>
              <td>${esc(title(tp.id))}</td>
              <td data-label="${t("col_questions")}">${tp.questions}</td>
              <td data-label="${t("col_answers")}">${tp.answers}</td>
              <td data-label="${t("col_errors")}">${pct(tp.errorRate)}</td>
              <td data-label="${t("col_exams")}">${tp.exams}</td>
              <td data-label="${t("col_exam_avg")}">${pct(tp.examAvg)}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="hint">${icon("shield")} ${t("privacy_note")}</p>
    </div>`;
}

function renderWork() {
  const back = `<button class="link-back" data-action="modes">${icon("back")} ${t("back")}</button>`;
  if (state.mode === "tests") return back + renderTests();
  if (state.mode === "materials") return back + renderMaterials();
  if (state.mode === "analytics") return renderAnalytics();
  return back + renderChat();
}

function render() {
  document.querySelectorAll("[data-lang]").forEach((b) => b.classList.toggle("active", b.dataset.lang === LANG));
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));

  document.getElementById("userbox").innerHTML = state.user ? `
    <span class="user-chip">${icon("user")} <span class="role-text">${t("role_" + state.user.role)}</span></span>
    <button class="btn-ghost logout" data-action="logout" aria-label="${t("logout")}" title="${t("logout")}">${icon("logout")} <span>${t("logout")}</span></button>` : "";

  SOURCES = [];
  const main = document.getElementById("main");
  main.innerHTML =
    !state.user ? renderLogin() :
    state.screen === "home" ? renderHome() :
    state.screen === "modes" ? renderModes() : renderWork();

  const modal = document.getElementById("modal-root");
  modal.innerHTML = state.user ? renderModal() : "";
  document.body.classList.toggle("modal-open", !!(state.user && state.viewer));

  if (window.renderMathInElement) {
    for (const el of [main, modal]) {
      renderMathInElement(el, {
        delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }],
        throwOnError: false,
      });
    }
  }

  const screenKey = [state.user?.role, state.screen, state.subject?.id, state.mode].join("|");
  if (screenKey !== render.lastKey) {
    window.scrollTo({ top: 0 });
    render.lastKey = screenKey;
  }

  const box = document.getElementById("messages");
  if (box) {
    box.scrollTop = box.scrollHeight;
    if (box.scrollHeight <= box.clientHeight + 1 && state.messages.length) {
      window.scrollTo({ top: document.body.scrollHeight });
    }
  }

  const active = document.querySelector(".sidebar .topic.active");
  if (active) {
    const bar = active.parentElement;
    bar.scrollLeft += active.getBoundingClientRect().left - bar.getBoundingClientRect().left - 16;
  }
}

function resetChat() {
  state.messages = [];
  state.photo = null;
  state.quiz = { started: false, question: 0, done: false };
  state.exam = { ticket: null, graded: false };
  state.tests = { count: state.tests.count, questions: [], step: null, batch: 0, batches: 0, error: null };
}

function errorText(err) {
  if (err.code === "timeout") return t("error_timeout");
  if (err.code === "rate_limit") return t("error_rate").replace("{s}", err.retry || 30);
  if (err.code === "ai_invalid") return t("error_ai_invalid");
  if (err.code === "daily_limit") return t("error_daily");
  if (err.code === "overloaded") return t("error_overloaded");
  if (err.code === "ticket_expired") return t("ticket_expired");
  if (["bad_length", "bad_title", "too_many"].includes(err.code)) return t("error_" + err.code);
  return t("error_generic");
}

async function getTicket() {
  resetChat();
  state.busy = true;
  render();
  try {
    const data = await apiAI("/api/exam", { action: "ticket", subject: state.subject.id, topic: state.topic, lang: LANG });
    state.exam.ticket = data.ticket;
    state.messages.push({ role: "model", type: "ticket", text: data.question, maxPoints: data.maxPoints });
  } catch (err) {
    if (err.message === "unauthorized") return;
    state.messages.push({ role: "model", text: errorText(err), error: true });
  }
  state.busy = false;
  render();
  document.getElementById("input")?.focus();
}

async function gradeAnswer(text, image = null) {
  state.messages.push({ role: "user", text, image });
  state.busy = true;
  render();
  try {
    const data = await apiAI("/api/exam", {
      action: "grade", ticket: state.exam.ticket, answer: text, lang: LANG,
      image: image ? { mime: image.mime, data: image.data } : undefined,
    });
    state.messages.push({ role: "model", type: "grade", ...data });
    state.exam.graded = true;
  } catch (err) {
    if (err.message === "unauthorized") return;
    state.messages.pop();
    state.messages.push({ role: "model", text: errorText(err), error: true });
  }
  state.busy = false;
  render();
}

async function apiWithRetry(path, body) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await api(path, body);
    } catch (err) {
      if (attempt >= 2 || !["rate_limit", "timeout"].includes(err.code)) throw err;
      let left = err.code === "rate_limit" ? Math.min(err.retry || 20, 60) : 3;
      while (left > 0) {
        state.tests.wait = left--;
        render();
        await new Promise((r) => setTimeout(r, 1000));
      }
      state.tests.wait = 0;
      render();
    }
  }
}

async function generateTests() {
  const T = state.tests;
  Object.assign(T, { questions: [], error: null, batches: T.count / 5, batch: 0, wait: 0 });
  const params = { subject: state.subject.id, topic: state.topic, lang: LANG };

  try {
    for (let b = 1; b <= T.batches; b++) {
      T.batch = b;
      T.step = "generate";
      render();
      const draft = await apiWithRetry("/api/tests", { action: "generate", ...params, avoid: T.questions.map((q) => q.q) });

      T.step = "review";
      render();
      const checked = await apiWithRetry("/api/tests", { action: "review", ...params, questions: draft.questions });
      T.questions.push(...checked.questions);
    }
  } catch (err) {
    if (err.message === "unauthorized") return;
    T.error = errorText(err);
  }
  T.step = null;
  render();
}

function downloadTests() {
  const lines = [`${L(state.subject.name)} — ${topicTitle(state.topic)}`, ""];
  state.tests.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q.q}`);
    q.options.forEach((o, j) => lines.push(`   ${"ABCD"[j]}) ${o}`));
    lines.push(`   ${t("answer_key")}: ${"ABCD"[q.answer]}${q.source ? "  (" + q.source.label + ")" : ""}`, "");
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
  a.download = `test-${state.topic}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function sendToAI(text, hidden = false, image = null) {
  state.messages.push({ role: "user", text, hidden, image });
  state.busy = true;
  render();

  try {
    const ok = state.messages.filter((m) => !m.error);
    const lastImg = ok.map((m) => !!m.image).lastIndexOf(true);
    const history = ok.map((m, i) => ({
      role: m.role, text: m.text,
      image: i === lastImg ? { mime: m.image.mime, data: m.image.data } : undefined,
    }));
    const data = await apiAI("/api/chat", {
      mode: state.mode, subject: state.subject.id, topic: state.topic, lang: LANG, history,
    });
    state.messages.push({ role: "model", text: data.reply, sources: data.sources, verdict: data.verdict, found: data.found, solved: data.solved });
    if (state.mode === "quiz") {
      if (data.question) state.quiz.question = data.question;
      if (data.done) state.quiz.done = true;
    }
  } catch (err) {
    if (err.message === "unauthorized") return;
    state.messages.push({ role: "model", text: errorText(err), error: true });
  }
  state.busy = false;
  render();
  document.getElementById("input")?.focus();
}

document.addEventListener("click", (e) => {
  const el = e.target.closest("button, [data-action]");
  if (!el || el.disabled) return;
  const a = el.dataset.action;

  if (el.dataset.src !== undefined) return openLecture(SOURCES[Number(el.dataset.src)]);
  if (a === "open-lecture") return openLecture({ lecture: state.topic });
  if (a === "view-topic") return openLecture({ lecture: el.dataset.id });
  if (a === "close-modal") { state.viewer = null; return render(); }
  if (a === "remove-photo") { state.photo = null; return render(); }
  if (a === "mat-check") return matCheck();
  if (a === "mat-publish") return matPublish();
  if (a === "mat-delete") return matDelete(el.dataset.id);

  if (el.dataset.lang) { setLang(el.dataset.lang); render(); }
  else if (el.dataset.subject) {
    state.subject = state.subjects.find((s) => s.id === el.dataset.subject);
    state.screen = "modes";
    render();
  }
  else if (el.dataset.mode) {
    state.mode = el.dataset.mode;
    state.topic = ["quiz", "exam", "tests"].includes(state.mode) ? state.subject.topics[0].id : null;
    state.screen = "work";
    resetChat();
    if (state.mode === "materials") state.mat = emptyMat();
    if (state.mode === "analytics") loadAnalytics();
    else render();
  }
  else if (el.dataset.topic !== undefined) {
    state.topic = el.dataset.topic || null;
    resetChat();
    render();
  }
  else if (a === "quiz-start") {
    resetChat();
    state.quiz.started = true;
    sendToAI(t("quiz_start_msg"), true);
  }
  else if (a === "analytics-refresh") loadAnalytics();
  else if (a === "analytics-demo") demoAnalytics("demo");
  else if (a === "analytics-clear-demo") demoAnalytics("clear-demo");
  else if (a === "exam-ticket") getTicket();
  else if (a === "tests-generate") generateTests();
  else if (a === "tests-download") downloadTests();
  else if (a === "logout") logout();
  else if (a === "home" || a === "logo") { state.screen = state.user ? "home" : state.screen; render(); }
  else if (a === "modes") { state.screen = "modes"; render(); }
});

document.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (e.target.id === "login-form") {
    const f = new FormData(e.target);
    try {
      const data = await api("/api/login", { login: f.get("login"), password: f.get("password") });
      try { localStorage.setItem("ustaz-token", data.token); } catch (err) {}
      state.user = data.user;
      state.loginError = false;
      await loadSubjects();
    } catch (err) {
      state.loginError = true;
    }
    render();
    return;
  }

  if (e.target.id === "composer") {
    const input = document.getElementById("input");
    const text = input.value.trim();
    const photo = state.photo;
    if ((!text && !photo) || state.busy) return;
    const msg = text || t("photo_default");
    state.photo = null;
    if (state.mode === "exam") return gradeAnswer(msg, photo);
    sendToAI(msg, false, photo);
  }
});

document.addEventListener("change", (e) => {
  if (e.target.id === "tests-count") state.tests.count = Number(e.target.value);
  if (e.target.id === "photo-input" && e.target.files[0]) attachPhoto(e.target.files[0]);
});

async function attachPhoto(file) {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    state.photo = { url: dataUrl, mime: "image/jpeg", data: dataUrl.split(",")[1] };
  } catch (e) {
    state.photo = null;
  }
  render();
  document.getElementById("input")?.focus();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.viewer) { state.viewer = null; render(); }
});

document.addEventListener("keydown", (e) => {
  if (e.target.id === "input" && e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    document.getElementById("composer").requestSubmit();
  }
});

async function loadSubjects() {
  state.subjects = await api("/api/topics");
}

(async function start() {
  setLang(LANG);
  const token = getToken();
  state.user = token ? userFromToken(token) : null;
  if (state.user) {
    try { await loadSubjects(); } catch (e) { state.user = null; }
  }
  render();
})();
