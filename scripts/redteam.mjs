import fs from "node:fs";

const dotenv = fs.existsSync(".env")
  ? Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]))
  : {};
const BASE = process.env.BASE || "http://localhost:8888";
const DELAY_MS = Number(process.env.DELAY_MS || 5000);
const LOGIN = process.env.RT_LOGIN || dotenv.RT_LOGIN || "student";
const PASSWORD = process.env.RT_PASSWORD || dotenv.RT_PASSWORD;
if (!PASSWORD) { console.error("Задайте пароль студента: RT_PASSWORD в .env или в переменных окружения"); process.exit(1); }

const spec = JSON.parse(fs.readFileSync("tests/redteam-cases.json", "utf8"));
const only = process.argv.slice(2);
const cases = spec.cases.filter((c) => !only.length || only.includes(c.id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const loginRes = await fetch(`${BASE}/api/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
});
const { token } = await loginRes.json();
if (!token) { console.error("Не удалось войти — сайт запущен?"); process.exit(1); }

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function postRetry(path, body) {
  for (let i = 0; ; i++) {
    const r = await post(path, body);
    const temp = ["rate_limit", "timeout", "overloaded"].includes(r.data.error);
    if (!temp || i >= 3) return r;
    const wait = r.data.error === "rate_limit" ? Math.min((r.data.retry || 20) + 2, 65) : 5;
    process.stdout.write(` [${r.data.error}, жду ${wait}с]`);
    await sleep(wait * 1000);
  }
}

const toRegexps = (p) => (typeof p === "string" ? spec.patterns[p] : p || []).map((s) => new RegExp(s, "i"));

async function runCase(c) {
  const history = c.messages.map((m) => m.startsWith("@model:") ? { role: "model", text: m.slice(7) } : { role: "user", text: m });

  if (c.mode === "exam") {
    const ticket = await postRetry("/api/exam", { action: "ticket", subject: c.subject, topic: c.topic, lang: c.lang });
    if (!ticket.data.ticket) return { error: ticket.data.error || "no ticket" };
    await sleep(DELAY_MS);
    const g = await postRetry("/api/exam", { action: "grade", ticket: ticket.data.ticket, answer: c.messages[0], lang: c.lang });
    if (g.data.error) return { error: g.data.error };
    const pass = g.data.percent <= c.check.max;
    return { pass, reply: `Оценка: ${g.data.total}/${g.data.max} (${g.data.percent}%). ${g.data.feedback || ""}` };
  }

  const r = await postRetry("/api/chat", { mode: c.mode, subject: c.subject, topic: c.topic, lang: c.lang, history });
  if (r.data.error) return { error: r.data.error };
  const reply = r.data.reply || "";

  switch (c.check.type) {
    case "forbid": {
      const bad = [...toRegexps(c.check.patterns), ...toRegexps(c.check.extra)].filter((re) => re.test(reply));
      return { pass: bad.length === 0, reply, note: bad.length ? "найдено: " + bad.map(String).join(", ") : "" };
    }
    case "require": {
      const ok = toRegexps(c.check.patterns).some((re) => re.test(reply));
      return { pass: ok, reply, note: ok ? "" : "нет обязательного исправления" };
    }
    case "not_found":
      return { pass: r.data.found === false, reply, note: `found=${r.data.found}` };
    case "grounded": {
      const v = (r.data.sources || []).filter((s) => s.verified);
      return { pass: v.length > 0, reply, note: `цитат подтверждено: ${v.length} из ${(r.data.sources || []).length}` };
    }
    case "verdict_not_correct":
      return { pass: r.data.verdict !== "correct", reply, note: `verdict=${r.data.verdict}` };
  }
  return { error: "unknown check" };
}

console.log(`Ustaz AI red team: ${cases.length} атак → ${BASE}\n`);
const results = [];
for (const c of cases) {
  process.stdout.write(`${c.id.padEnd(4)} ${c.title} …`);
  const t0 = Date.now();
  let r;
  try { r = await runCase(c); } catch (e) { r = { error: e.message }; }
  r.ms = Date.now() - t0;
  results.push({ ...c, ...r });
  console.log(r.error ? ` ОШИБКА (${r.error})` : r.pass ? " ✅ выдержал" : ` ❌ НЕ ВЫДЕРЖАЛ ${r.note || ""}`);
  await sleep(DELAY_MS);
}

if (only.length && fs.existsSync("docs/redteam-results.json")) {
  const prev = JSON.parse(fs.readFileSync("docs/redteam-results.json", "utf8"));
  const merged = spec.cases.map((c) => results.find((r) => r.id === c.id) || prev.find((p) => p.id === c.id)).filter(Boolean);
  results.splice(0, results.length, ...merged);
}
const done = results.filter((r) => !r.error);
const passed = done.filter((r) => r.pass).length;
const cats = [...new Set(results.map((r) => r.category))];
const date = new Date().toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });
const cut = (s, n = 220) => String(s || "").replace(/\s+/g, " ").replace(/\|/g, "\\|").slice(0, n) + (String(s || "").length > n ? "…" : "");

let md = `# Стресс-тест безопасности Ustaz AI\n\n`;
md += `Дата: ${date} (Алматы) · Сайт: \`${BASE}\` · Атак: ${results.length}\n\n`;
md += `## Итог: выдержано **${passed} из ${done.length}** (${done.length ? Math.round((passed / done.length) * 100) : 0}%)\n\n`;
if (results.length > done.length) md += `Не выполнено из-за технических ошибок (лимиты/сеть): ${results.length - done.length}\n\n`;
md += `Проверки программные: регулярные выражения по тексту ответа и поля ответа сервера (found, verdict, баллы, проверка цитат). ИИ-судья не используется — результат прозрачен и воспроизводим.\n\n`;
md += `| Категория | Выдержано |\n|---|---|\n`;
for (const cat of cats) {
  const rs = results.filter((r) => r.category === cat && !r.error);
  md += `| ${cat} | ${rs.filter((r) => r.pass).length} / ${rs.length} |\n`;
}
md += `\n## Подробно\n\n| # | Атака | Результат | Ответ бота (начало) |\n|---|---|---|---|\n`;
for (const r of results) {
  const res = r.error ? `⚠️ ошибка: ${r.error}` : r.pass ? "✅" : `❌ ${cut(r.note, 80)}`;
  md += `| ${r.id} | ${cut(r.title, 80)} | ${res} | ${cut(r.reply)} |\n`;
}
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync("docs/redteam-report.md", md);
fs.writeFileSync("docs/redteam-results.json", JSON.stringify(results, null, 2));
console.log(`\nИтог: ${passed} из ${done.length} выдержано. Отчёт: docs/redteam-report.md`);
