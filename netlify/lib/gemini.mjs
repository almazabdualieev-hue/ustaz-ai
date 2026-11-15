const MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const FALLBACKS = (process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite,gemini-3.5-flash")
  .split(",").map((s) => s.trim()).filter(Boolean);

const DEADLINE_MS = 9000;
const PRIMARY_MS = 6000;

export async function askGemini(system, history, options = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY не задан в .env");

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: history.map((m) => ({
      role: m.role,
      parts: [
        ...(m.image ? [{ inlineData: { mimeType: m.image.mime, data: m.image.data } }] : []),
        { text: m.text || "(фото)" },
      ],
    })),
    generationConfig: {
      temperature: options.temperature ?? 0.4,
      thinkingConfig: { thinkingLevel: "minimal" },
      ...(options.json ? { responseMimeType: "application/json" } : {}),
    },
  });

  const hasImage = history.some((m) => m.image);
  const started = Date.now();
  const models = [MODEL, ...FALLBACKS];
  const errors = [];

  for (let i = 0; i < models.length; i++) {
    const left = DEADLINE_MS - (Date.now() - started);
    if (i > 0 && left < 1500) break;
    try {
      const limit = i === 0 && !hasImage ? Math.min(PRIMARY_MS, left) : left;
      return await callModel(models[i], key, body, limit);
    } catch (err) {
      errors.push(err);
      const canRetry = ["rate_limit", "daily_limit"].includes(err.code) || err.name === "TimeoutError" || err.status >= 500;
      if (!canRetry) throw err;
      if (models[i + 1]) console.log(`Gemini: ${models[i]} → ${models[i + 1]} (${typeof err.code === "string" ? err.code : err.name})`);
    }
  }

  const pick = (f) => errors.find(f);
  throw pick((e) => e.code === "rate_limit")
    || pick((e) => e.name === "TimeoutError")
    || (pick((e) => e.status >= 500) && Object.assign(new Error("overloaded"), { code: "overloaded" }))
    || errors[errors.length - 1];
}

async function callModel(model, key, body, timeoutMs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 429) {
    const m = /retry in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i.exec(data.error?.message || "");
    const retry = m ? Math.ceil((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + parseFloat(m[3])) : 30;
    const code = retry > 300 ? "daily_limit" : "rate_limit";
    throw Object.assign(new Error(code), { code, retry });
  }
  if (!res.ok) throw Object.assign(new Error(data.error?.message || `Gemini: ошибка ${res.status}`), { status: res.status });

  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "";
}

export function parseAIJson(raw) {
  let text = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    text = text
      .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u")
      .replace(/(^|[^\\])((?:\\\\)*)\\(?!["\\/bfnrtu])/g, "$1$2\\\\");
    try { data = JSON.parse(text); } catch { return null; }
  }
  const fix = (s) => typeof s !== "string" ? s : s
    .replace(/\f/g, "\\f").replace(/\x08/g, "\\b").replace(/\t/g, "\\t").replace(/\r/g, "\\r")
    .replace(/\$[^$]*\$/g, (m) => m.replace(/\n(?=[a-z])/g, "\\n"));
  const walk = (v) => Array.isArray(v) ? v.map(walk)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    : fix(v);
  return walk(data);
}

export function cleanImage(img) {
  if (!img || typeof img.data !== "string") return null;
  if (!["image/jpeg", "image/png", "image/webp"].includes(img.mime)) return null;
  if (img.data.length > 2_000_000 || !/^[A-Za-z0-9+/=]+$/.test(img.data.slice(0, 200))) return null;
  return { mime: img.mime, data: img.data };
}

export function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export function aiError(err) {
  if (err.name === "TimeoutError" || err.name === "AbortError") return json({ error: "timeout" }, 504);
  if (err.code === "rate_limit") return json({ error: "rate_limit", retry: err.retry }, 429);
  if (err.code === "daily_limit") return json({ error: "daily_limit" }, 429);
  if (err.code === "overloaded") return json({ error: "overloaded" }, 503);
  console.error(err);
  return json({ error: "ai_error" }, 502);
}
