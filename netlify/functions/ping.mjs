import { askGemini, json } from "../lib/gemini.mjs";
import { readToken } from "../lib/auth.mjs";

export default async (req) => {
  if (!readToken(req)) return json({ error: "unauthorized" }, 401);
  const started = Date.now();
  try {
    const answer = await askGemini(
      "Ты — Ustaz AI, виртуальный наставник студента колледжа. Отвечай одним коротким предложением.",
      [{ role: "user", text: "Поздоровайся со студентом на казахском и на русском." }]
    );
    return json({ ok: true, model: process.env.GEMINI_MODEL, answer, ms: Date.now() - started });
  } catch (err) {
    return json({ ok: false, error: err.message, ms: Date.now() - started }, 500);
  }
};

export const config = { path: "/api/ping" };
