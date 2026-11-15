import { SUBJECTS, getLectures } from "../lib/content.mjs";
import { json } from "../lib/gemini.mjs";

export default async () => {
  const list = await Promise.all(
    Object.entries(SUBJECTS).map(async ([id, s]) => ({
      id,
      name: s.name,
      topics: (await getLectures(id)).map((l) => ({ id: l.id, title: l.title, custom: l.custom })),
    }))
  );
  return json(list);
};

export const config = { path: "/api/topics" };
