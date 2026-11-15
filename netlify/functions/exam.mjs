import { askGemini, json, aiError, parseAIJson, cleanImage } from "../lib/gemini.mjs";
import { readToken, seal, unseal } from "../lib/auth.mjs";
import { SUBJECTS, LANG_RULE, getLectures, buildSystem, checkSources, prompt } from "../lib/content.mjs";
import { logEvent } from "../lib/analytics.mjs";

const TICKET_HOURS = 2;

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const user = readToken(req);
  if (!user) return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const lang = LANG_RULE[body.lang] ? body.lang : "ru";

  try {
    if (body.action === "ticket") return await makeTicket(body, lang);
    if (body.action === "grade") return await grade(body, lang, user);
    return json({ error: "bad_request" }, 400);
  } catch (err) {
    return aiError(err);
  }
};

async function makeTicket({ subject, topic }, lang) {
  const lectures = SUBJECTS[subject] && (await getLectures(subject));
  if (!lectures || !lectures.some((l) => l.id === topic)) return json({ error: "bad_request" }, 400);

  const system = buildSystem({ subject, lectures, lang, topic, onlyTopic: true, modeRules: prompt("exam-ticket") });
  const ask = lang === "kk" ? "Емтихан билетін құрастыр." : "Составь экзаменационный билет.";
  const data = parseAIJson(await askGemini(system, [{ role: "user", text: ask }], { json: true, temperature: 0.7 }));

  const rubric = (Array.isArray(data?.rubric) ? data.rubric : [])
    .filter((r) => typeof r?.criterion === "string" && r.criterion.trim())
    .map((r) => ({ criterion: r.criterion.trim(), points: Math.min(4, Math.max(1, Math.round(Number(r.points) || 1))) }))
    .slice(0, 5);
  if (typeof data?.question !== "string" || rubric.length < 2) return json({ error: "ai_invalid" }, 502);

  const maxPoints = rubric.reduce((s, r) => s + r.points, 0);
  return json({
    question: data.question,
    maxPoints,
    ticket: seal({ subject, topic, question: data.question, rubric, exp: Date.now() + TICKET_HOURS * 3600e3 }),
  });
}

async function grade({ ticket, answer, image }, lang, user) {
  const t = unseal(ticket);
  if (!t || t.exp < Date.now()) return json({ error: "ticket_expired" }, 400);
  const text = String(answer ?? "").trim().slice(0, 4000);
  const photo = cleanImage(image);
  if (!text && !photo) return json({ error: "bad_request" }, 400);

  const lectures = await getLectures(t.subject);
  const rubricText = t.rubric.map((r, i) => `${i + 1}. ${r.criterion} — ${r.points}`).join("\n");
  const system = buildSystem({
    subject: t.subject, lectures, lang, topic: t.topic, onlyTopic: true,
    modeRules: prompt("exam-grade", { QUESTION: t.question, RUBRIC: rubricText }),
  });
  const wrapped = `<<<ОТВЕТ>>>\n${text || "(ответ на фото)"}\n<<<КОНЕЦ>>>`;
  const data = parseAIJson(await askGemini(system, [{ role: "user", text: wrapped, image: photo }], { json: true, temperature: 0.1 }));
  if (!Array.isArray(data?.scores)) return json({ error: "ai_invalid" }, 502);

  const answerNorm = normAnswer(text);
  const criteria = t.rubric.map((r, i) => {
    const s = data.scores.find((x) => Number(x?.n) === i + 1) || data.scores[i] || {};
    let points = Math.min(r.points, Math.max(0, Math.round(Number(s.points) || 0)));
    let comment = String(s.comment ?? "");
    const evidence = normAnswer(s.evidence);
    if (points > 0 && !photo && (evidence.length < 3 || !answerNorm.includes(evidence))) {
      points = 0;
      comment += lang === "kk" ? " (балл алынып тасталды: жауапта растау табылмады)" : " (балл снят: в ответе не найдено подтверждение)";
    }
    return { criterion: r.criterion, max: r.points, points, comment };
  });
  const total = criteria.reduce((s, c) => s + c.points, 0);
  const max = criteria.reduce((s, c) => s + c.max, 0);
  const percent = Math.round((total / max) * 100);

  await logEvent(user, { subject: t.subject, topic: t.topic, mode: "exam", result: "e" + percent });

  return json({
    criteria, total, max, percent,
    missed: (Array.isArray(data.missed) ? data.missed : []).map(String).slice(0, 6),
    feedback: String(data.feedback ?? ""),
    sources: checkSources(lectures, data.sources, lang),
  });
}

function normAnswer(s) {
  return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[\s$`*_{}\\]+/g, "");
}

export const config = { path: "/api/exam" };
