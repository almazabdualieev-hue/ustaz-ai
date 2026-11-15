import { json } from "../lib/gemini.mjs";
import { readToken } from "../lib/auth.mjs";
import { SUBJECTS, getLectures } from "../lib/content.mjs";
import { readEvents, writeRaw, deleteByPrefix } from "../lib/analytics.mjs";

export default async (req) => {
  const user = readToken(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (user.role !== "teacher") return json({ error: "forbidden" }, 403);

  try {
    if (req.method === "POST") {
      const { action } = await req.json().catch(() => ({}));
      if (action === "demo") { await writeRaw(demoKeys()); return json({ ok: true }); }
      if (action === "clear-demo") return json({ deleted: await deleteByPrefix("demo/") });
      return json({ error: "bad_request" }, 400);
    }

    const params = new URL(req.url).searchParams;
    const subject = params.get("subject");
    if (!SUBJECTS[subject]) return json({ error: "bad_request" }, 400);
    const tz = Math.max(-840, Math.min(840, Number(params.get("tz")) || 0));
    const all = await readEvents();
    const lectures = await getLectures(subject);
    return json(summarize(all.filter((e) => e.subject === subject), lectures, all.some((e) => e.demo), tz));
  } catch (err) {
    console.error(err);
    return json({ error: "storage_error" }, 500);
  }
};

function summarize(events, lectures, hasDemo, tz) {
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

  const topics = lectures.map((l) => {
    const ev = events.filter((e) => e.topic === l.id);
    const quiz = { c: 0, p: 0, i: 0 };
    ev.filter((e) => e.mode === "quiz").forEach((e) => { if (e.result in quiz) quiz[e.result]++; });
    const answers = quiz.c + quiz.p + quiz.i;
    const exams = ev.filter((e) => e.mode === "exam").map((e) => Number(e.result.slice(1)));
    return {
      id: l.id,
      questions: ev.filter((e) => e.result === "q").length,
      answers,
      errorRate: pct(quiz.i + quiz.p * 0.5, answers),
      exams: exams.length,
      examAvg: exams.length ? Math.round(exams.reduce((a, b) => a + b, 0) / exams.length) : null,
    };
  });

  const day = 864e5;
  const off = tz * 60e3;
  const today = Math.floor((Date.now() + off) / day) * day - off;
  const days = Array.from({ length: 7 }, (_, k) => {
    const from = today - (6 - k) * day;
    return { date: new Date(from + off).toISOString().slice(0, 10), count: events.filter((e) => e.ts >= from && e.ts < from + day).length };
  });

  const quizAll = events.filter((e) => e.mode === "quiz");
  const examAll = events.filter((e) => e.mode === "exam").map((e) => Number(e.result.slice(1)));
  const withErrors = topics.filter((t) => t.errorRate !== null);
  const hardest = withErrors.sort((a, b) => b.errorRate - a.errorRate)[0];

  return {
    hasDemo,
    total: events.length,
    questions: events.filter((e) => e.result === "q").length,
    solved: events.filter((e) => e.result === "s").length,
    quizCorrect: pct(quizAll.filter((e) => e.result === "c").length, quizAll.length),
    examAvg: examAll.length ? Math.round(examAll.reduce((a, b) => a + b, 0) / examAll.length) : null,
    hardest: hardest?.id ?? null,
    topics: lectures.map((l) => topics.find((t) => t.id === l.id)),
    days,
  };
}

function demoKeys() {
  const keys = [];
  const rnd = (n) => Math.floor(Math.random() * n);
  const difficulty = { "inf-1": 0.2, "inf-2": 0.5, "inf-3": 0.3, "inf-4": 0.4, "math-1": 0.25, "math-2": 0.55, "math-3": 0.45, "math-4": 0.35 };
  for (const [subject, s] of Object.entries(SUBJECTS)) {
    for (const l of s.lectures) {
      const d = difficulty[l.id] ?? 0.3;
      const add = (mode, result) => {
        const ts = Date.now() - rnd(7 * 864e5);
        keys.push(`demo/${ts}-${Math.random().toString(36).slice(2, 6)}_${subject}_${l.id}_${mode}_${result}`);
      };
      for (let k = 0, n = 6 + rnd(10) + Math.round(d * 10); k < n; k++) add(Math.random() < 0.6 ? "explain" : "socrat", "q");
      for (let k = 0, n = 9 + rnd(6); k < n; k++) {
        const r = Math.random();
        add("quiz", r < d * 0.7 ? "i" : r < d ? "p" : "c");
      }
      for (let k = 0, n = 2 + rnd(3); k < n; k++) add("exam", "e" + Math.max(10, Math.min(100, Math.round(90 - d * 70 + (rnd(30) - 15)))));
      if (Math.random() < 0.7) add("socrat", "s");
    }
  }
  return keys;
}

export const config = { path: "/api/analytics" };
