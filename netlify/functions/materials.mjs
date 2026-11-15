import { askGemini, json, aiError, parseAIJson } from "../lib/gemini.mjs";
import { readToken } from "../lib/auth.mjs";
import { SUBJECTS, getLectures, lectureStore, parseSections, prompt } from "../lib/content.mjs";

const MAX_TEXT = 12000;
const MAX_CUSTOM = 10;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const user = readToken(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.role !== "teacher") return json({ error: "forbidden" }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { action, subject } = body;
  if (!SUBJECTS[subject]) return json({ error: "bad_request" }, 400);

  try {
    if (action === "check") return await check(body);
    if (action === "publish") return await publish(body);
    if (action === "delete") return await remove(body);
    return json({ error: "bad_request" }, 400);
  } catch (err) {
    return aiError(err);
  }
};

async function check({ subject, title, text }) {
  title = String(title || "").trim();
  text = String(text || "").replace(/\r\n/g, "\n").trim();
  if (title.length < 3 || title.length > 120) return json({ error: "bad_title" }, 400);
  if (text.length < 200 || text.length > MAX_TEXT) return json({ error: "bad_length", max: MAX_TEXT }, 400);

  const system = prompt("materials-check", { SUBJECT: SUBJECTS[subject].name.ru, TITLE: title });
  const data = parseAIJson(await askGemini(system, [{ role: "user", text }], { json: true, temperature: 0.1 }));
  if (!data) return json({ error: "ai_invalid" }, 502);

  const markdown = toMarkdown(text, title, Array.isArray(data.sections) ? data.sections : []);
  const issues = (Array.isArray(data.issues) ? data.issues : []).slice(0, 8).map((i) => ({
    severity: i?.severity === "error" ? "error" : "warning",
    quote: String(i?.quote ?? ""),
    problem: String(i?.problem ?? ""),
    suggestion: String(i?.suggestion ?? ""),
    quoteFound: norm(text).includes(norm(i?.quote)),
  }));

  return json({
    markdown,
    sections: parseSections(markdown).map((s) => ({ n: s.n, title: s.title, chars: s.text.length })),
    titleKk: String(data.title_kk ?? "").trim().slice(0, 120),
    issues,
  });
}

const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

function toMarkdown(text, title, sections) {
  if (/^##\s+/m.test(text)) {
    let n = 0;
    return `# ${title}\n\n` + text
      .replace(/^#\s+.*\n?/m, "")
      .replace(/^##\s+(?:\d+\.\s*)?(.+)$/gm, (_, t) => `## ${++n}. ${t.trim()}`);
  }

  const cuts = [];
  let from = 0;
  for (const s of sections) {
    const start = String(s?.starts_with || "").trim();
    if (start.length < 5) continue;
    const re = new RegExp(start.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
    const m = re.exec(text.slice(from));
    if (!m) continue;
    let idx = from + m.index;
    const lineStart = text.lastIndexOf("\n", idx - 1) + 1;
    if (idx - lineStart < 3) idx = lineStart;
    cuts.push({ idx, title: String(s.title || "").trim().slice(0, 80) || "Раздел" });
    from = idx + 1;
  }
  if (!cuts.length || cuts[0].idx > 0) cuts.unshift({ idx: 0, title: cuts.length ? "Введение" : title });

  const parts = cuts.map((c, i) => {
    const body = text.slice(c.idx, i + 1 < cuts.length ? cuts[i + 1].idx : text.length).trim();
    return `## ${i + 1}. ${c.title}\n${body}`;
  }).filter((p) => p.split("\n").slice(1).join("").trim());
  let n = 0;
  return `# ${title}\n\n` + parts.map((p) => p.replace(/^## \d+\./, () => `## ${++n}.`)).join("\n\n");
}

async function publish({ subject, title, titleKk, markdown, confirmed }) {
  if (confirmed !== true) return json({ error: "not_confirmed" }, 400);
  title = String(title || "").trim().slice(0, 120);
  markdown = String(markdown || "").trim();
  if (title.length < 3 || markdown.length > MAX_TEXT + 2000 || !parseSections(markdown).length) {
    return json({ error: "bad_request" }, 400);
  }

  const existing = (await getLectures(subject)).filter((l) => l.custom);
  if (existing.length >= MAX_CUSTOM) return json({ error: "too_many" }, 400);

  const id = `${subject === "informatics" ? "inf" : subject}-u${Date.now().toString(36)}`;
  const lecture = {
    id,
    title: { ru: title, kk: String(titleKk || "").trim().slice(0, 120) || title },
    text: markdown,
    created: Date.now(),
  };
  await lectureStore().setJSON(`${subject}/${id}`, lecture);
  return json({ id });
}

async function remove({ subject, id }) {
  if (!/^[a-z]+-u[a-z0-9]+$/.test(String(id))) return json({ error: "bad_request" }, 400);
  await lectureStore().delete(`${subject}/${id}`);
  return json({ ok: true });
}

export const config = { path: "/api/materials" };
