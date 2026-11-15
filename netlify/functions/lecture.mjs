import { json } from "../lib/gemini.mjs";
import { readToken } from "../lib/auth.mjs";
import { getLectures } from "../lib/content.mjs";

export default async (req) => {
  if (!readToken(req)) return json({ error: "unauthorized" }, 401);
  const params = new URL(req.url).searchParams;
  const lectures = await getLectures(params.get("subject"));
  const l = lectures?.find((x) => x.id === params.get("id"));
  if (!l) return json({ error: "not_found" }, 404);
  return json({ id: l.id, num: l.num, title: l.title, text: l.text, custom: l.custom });
};

export const config = { path: "/api/lecture" };
