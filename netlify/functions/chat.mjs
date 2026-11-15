import { askGemini, json, aiError, parseAIJson, cleanImage } from "../lib/gemini.mjs";
import { readToken } from "../lib/auth.mjs";
import { SUBJECTS, LANG_RULE, getLectures, buildSystem, checkSources, prompt } from "../lib/content.mjs";
import { logEvent } from "../lib/analytics.mjs";

const MODES = ["explain", "socrat", "quiz"];

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = readToken(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { mode, subject, topic, lang = "ru" } = body;
  if (!MODES.includes(mode) || !SUBJECTS[subject] || !LANG_RULE[lang]) {
    return json({ error: "bad_request" }, 400);
  }

  let history = (Array.isArray(body.history) ? body.history : [])
    .filter((m) => (m.role === "user" || m.role === "model") && typeof m.text === "string")
    .slice(-16)
    .map((m) => ({ role: m.role, text: m.text.slice(0, 2000), image: m.role === "user" && mode !== "quiz" ? cleanImage(m.image) : null }));
  const lastImg = history.map((m) => !!m.image).lastIndexOf(true);
  history = history.map((m, i) => (m.image && i !== lastImg ? { ...m, image: null, text: m.text + " [фото]" } : m));
  if (!history.length || history[history.length - 1].role !== "user") {
    return json({ error: "bad_request" }, 400);
  }

  const lectures = await getLectures(subject);
  const system = buildSystem({ subject, lectures, lang, topic, modeRules: prompt(mode) });

  try {
    const raw = await askGemini(system, history, { json: true, temperature: mode === "socrat" ? 0.5 : 0.3 });
    const data = parseAIJson(raw) ?? { reply: raw };
    const sources = checkSources(lectures, data.sources, lang);
    const verdict = ["correct", "partial", "incorrect"].includes(data.verdict) ? data.verdict : null;

    const ev = { subject, mode, topic: topic || sources[0]?.lecture };
    if (mode === "quiz") {
      if (verdict) await logEvent(user, { ...ev, result: verdict[0] });
    } else {
      await logEvent(user, { ...ev, result: "q" });
      if (mode === "socrat" && data.solved === true) await logEvent(user, { ...ev, result: "s" });
    }

    return json({
      reply: String(data.reply ?? ""),
      sources,
      found: data.found,
      solved: data.solved,
      verdict,
      question: data.question ?? null,
      done: Boolean(data.done),
    });
  } catch (err) {
    return aiError(err);
  }
};

export const config = { path: "/api/chat" };
