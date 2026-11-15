import { askGemini, json, aiError, parseAIJson } from "../lib/gemini.mjs";
import { readToken } from "../lib/auth.mjs";
import { SUBJECTS, LANG_RULE, getLectures, buildSystem, checkSources, findQuote, prompt } from "../lib/content.mjs";

const BATCH = 5;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const user = readToken(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.role !== "teacher") return json({ error: "forbidden" }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const { action, subject, topic } = body;
  const lang = LANG_RULE[body.lang] ? body.lang : "ru";
  const lectures = SUBJECTS[subject] && (await getLectures(subject));
  const lecture = lectures?.find((l) => l.id === topic);
  if (!lecture) return json({ error: "bad_request" }, 400);

  try {
    if (action === "generate") {
      const avoid = (Array.isArray(body.avoid) ? body.avoid : []).map(String).slice(0, 20);
      const system = buildSystem({
        subject, lectures, lang, topic, onlyTopic: true,
        modeRules: prompt("tests-generate", { COUNT: BATCH, AVOID: avoid.length ? avoid.join(" | ") : "—" }),
      });
      const ask = lang === "kk" ? "Тест құрастыр." : "Составь тест.";
      const data = parseAIJson(await askGemini(system, [{ role: "user", text: ask }], { json: true, temperature: 0.7 }));
      const questions = normalize(data?.questions, lecture.id);
      if (!questions.length) return json({ error: "ai_invalid" }, 502);
      return json({ questions });
    }

    if (action === "review") {
      const draft = normalize(body.questions, lecture.id).slice(0, BATCH);
      if (!draft.length) return json({ error: "bad_request" }, 400);

      const system = buildSystem({
        subject, lectures, lang, topic, onlyTopic: true,
        modeRules: prompt("tests-review", { DRAFT: JSON.stringify({ questions: draft.map(forReviewer) }, null, 1) }),
      });
      const ask = lang === "kk" ? "Тестті тексер." : "Проверь тест.";
      const data = parseAIJson(await askGemini(system, [{ role: "user", text: ask }], { json: true, temperature: 0.1 }));

      const notes = Array.isArray(data?.notes) ? data.notes : [];

      const result = draft.map((before, i) => {
        const note = notes.find((n) => Number(n?.n) === i + 1) || {};
        let fixed = note.status === "fixed" ? fromReviewer(note.fix, lecture.id) : null;
        const unchanged = fixed && fixed.q === before.q && fixed.answer === before.answer &&
          fixed.options.join("\n") === before.options.join("\n") &&
          fixed.section === before.section && fixed.quote === before.quote;
        if (unchanged) fixed = null;
        const q = fixed || before;
        const shuffled = shuffle(q);
        return {
          ...shuffled,
          source: checkSources(lectures, [{ lecture: q.lecture, section: q.section, quote: q.quote }], lang)[0] || null,
          review: {
            status: fixed ? "fixed" : "ok",
            comment: unchanged
              ? (lang === "kk" ? "Тексерілді, өзгерту қажет болмады." : "Проверено, изменений не потребовалось.")
              : String(note.comment ?? ""),
            keyChanged: fixed && before.options[before.answer] !== q.options[q.answer]
              ? { from: before.options[before.answer], to: q.options[q.answer] } : null,
          },
          checks: programChecks(q, lecture),
        };
      });
      return json({ questions: result });
    }

    return json({ error: "bad_request" }, 400);
  } catch (err) {
    return aiError(err);
  }
};

const LETTERS = ["A", "B", "C", "D"];

function forReviewer(q, i) {
  return {
    n: i + 1,
    q: q.q,
    options: Object.fromEntries(q.options.map((o, j) => [LETTERS[j], o])),
    correct: LETTERS[q.answer],
    correct_text: q.options[q.answer],
    section: q.section,
    quote: q.quote,
  };
}

function fromReviewer(fix, lectureId) {
  if (!fix || typeof fix.q !== "string") return null;
  const options = Array.isArray(fix.options) ? fix.options : Object.values(fix.options || {});
  const clean = (s) => String(s ?? "").trim().toLowerCase();
  let answer = options.findIndex((o) => clean(o) === clean(fix.correct_text));
  if (answer < 0 && typeof fix.correct === "string") answer = LETTERS.indexOf(fix.correct.trim().toUpperCase());
  return normalize([{ ...fix, options, answer }], lectureId)[0] || null;
}

function normalize(list, lectureId) {
  return (Array.isArray(list) ? list : [])
    .filter((q) => q && typeof q.q === "string" && Array.isArray(q.options))
    .map((q) => ({
      q: q.q.trim(),
      options: q.options.map((o) => String(o).trim()),
      answer: Number(q.answer),
      lecture: lectureId,
      section: Number(q.section) || null,
      quote: typeof q.quote === "string" ? q.quote.trim() : "",
    }));
}

function programChecks(q, lecture) {
  const issues = [];
  if (q.options.length !== 4) issues.push("options_count");
  if (new Set(q.options.map((o) => o.toLowerCase())).size !== q.options.length) issues.push("duplicate_options");
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length) issues.push("bad_key");
  if (!lecture.sections.some((s) => s.n === q.section)) issues.push("bad_section");
  if (!q.q) issues.push("empty_question");
  if (!findQuote(lecture, q.quote)) issues.push("quote_not_found");
  return issues;
}

function shuffle(q) {
  if (!Number.isInteger(q.answer) || !q.options[q.answer]) return q;
  const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
}

export const config = { path: "/api/tests" };
