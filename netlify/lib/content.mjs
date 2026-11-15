import fs from "node:fs";
import path from "node:path";
import { getStore } from "@netlify/blobs";

const ROOT = process.cwd();
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

export const SUBJECTS = JSON.parse(read("content", "subjects.json"));

export const lectureStore = () => getStore({ name: "lectures", consistency: "strong" });

export function parseSections(text) {
  const heads = [...text.matchAll(/^##\s+(\d+)\.\s+(.+)$/gm)];
  return heads.map((m, i) => ({
    n: Number(m[1]),
    title: m[2].trim(),
    text: text.slice(m.index, i + 1 < heads.length ? heads[i + 1].index : text.length),
  }));
}

const builtinCache = {};
function builtinLectures(subjectId) {
  if (!builtinCache[subjectId]) {
    builtinCache[subjectId] = SUBJECTS[subjectId].lectures.map((l) => {
      const text = read("content", l.file);
      return { id: l.id, title: l.title, text, sections: parseSections(text), custom: false };
    });
  }
  return builtinCache[subjectId];
}

async function customLectures(subjectId) {
  try {
    const store = lectureStore();
    const { blobs } = await store.list({ prefix: `${subjectId}/` });
    const list = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    return list
      .filter(Boolean)
      .sort((a, b) => a.created - b.created)
      .map((l) => ({ ...l, sections: parseSections(l.text), custom: true }));
  } catch (err) {
    console.error("lectures:", err.message);
    return [];
  }
}

export async function getLectures(subjectId) {
  if (!SUBJECTS[subjectId]) return null;
  const all = [...builtinLectures(subjectId), ...(await customLectures(subjectId))];
  return all.map((l, i) => ({ ...l, num: i + 1 }));
}

export function materialsText(lectures, lectureId = null) {
  return lectures
    .filter((l) => !lectureId || l.id === lectureId)
    .map((l) => `=== ЛЕКЦИЯ ${l.id}: ${l.title.ru} ===\n${l.text}`)
    .join("\n\n");
}

const norm = (s) => String(s || "")
  .toLowerCase()
  .replace(/ё/g, "е")
  .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
  .replace(/\\(cdot|times)/g, "*")
  .replace(/\\(neq|ne)\b/g, "≠").replace(/\\(geq|ge)\b/g, "≥").replace(/\\(leq|le)\b/g, "≤")
  .replace(/\\([a-z]+)/g, "$1")
  .replace(/[_{}$`\\]/g, "")
  .replace(/\*\*/g, " ")
  .replace(/[#>|()[\]«»"“”„.,;:!?]/g, " ")
  .replace(/[−–—]/g, "-")
  .replace(/\s*([=+\-*/^<>≠≥≤])\s*/g, "$1")
  .replace(/\s+/g, " ")
  .trim();

export function findQuote(lecture, quote) {
  const q = norm(quote);
  if (q.length < 10) return null;
  for (const s of lecture.sections) {
    if (norm(s.text).includes(q)) return { section: s.n, match: "exact" };
  }
  const words = q.split(" ").filter((w) => w.length > 2);
  if (words.length < 3) return null;
  let best = null;
  for (const s of lecture.sections) {
    const t = norm(s.text);
    const share = words.filter((w) => t.includes(w)).length / words.length;
    if (!best || share > best.share) best = { section: s.n, share };
  }
  return best && best.share >= 0.85 ? { section: best.section, match: "close" } : null;
}

export function checkSources(lectures, sources, lang) {
  if (!Array.isArray(sources)) return [];
  const seen = new Set();
  const result = [];
  for (const s of sources) {
    const lecture = lectures.find((l) => l.id === s?.lecture);
    if (!lecture) continue;

    const found = s.quote ? findQuote(lecture, s.quote) : null;
    const sectionN = found ? found.section : Number(s.section);
    const section = lecture.sections.find((x) => x.n === sectionN);

    const key = lecture.id + ":" + (section?.n ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      lecture: lecture.id,
      section: section?.n ?? null,
      quote: typeof s.quote === "string" ? s.quote.slice(0, 300) : "",
      verified: found ? found.match : false,
      label: `${lang === "kk" ? "Дәріс" : "Лекция"} ${lecture.num}. ${lecture.title[lang] || lecture.title.ru}` +
        (section ? ` · § ${section.n}` + (lang === "kk" ? "" : `. ${section.title}`) : ""),
    });
  }
  return result;
}

export function prompt(name, vars = {}) {
  return read("prompts", `${name}.md`).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

export const LANG_RULE = {
  ru: "Отвечай только на русском языке.",
  kk: "Жауапты тек қазақ тілінде бер (отвечай только на казахском языке), даже если материалы на русском. " +
      "Термины переводи корректно; при необходимости укажи русский термин в скобках.",
};

export function buildSystem({ subject, lectures, lang, modeRules, topic, onlyTopic = false }) {
  const lecture = lectures.find((l) => l.id === topic);
  return prompt("common", {
    SUBJECT: SUBJECTS[subject].name.ru,
    LANG_RULE: LANG_RULE[lang],
    MODE_RULES: modeRules,
    TOPIC: lecture
      ? `${lecture.id} — ${lecture.title.ru}` + (lang === "kk" && lecture.title.kk ? ` (на казахском называй её: «${lecture.title.kk}»)` : "")
      : "не выбрана (весь курс)",
    MATERIALS: materialsText(lectures, onlyTopic && lecture ? lecture.id : null),
  });
}
