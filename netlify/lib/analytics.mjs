import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "analytics", consistency: "strong" });

export async function logEvent(user, { subject, topic, mode, result }, prefix = "ev") {
  if (user?.role !== "student") return;
  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await store().set(`${prefix}/${id}_${subject}_${topic || "none"}_${mode}_${result}`, "");
  } catch (err) {
    console.error("analytics:", err.message);
  }
}

export async function readEvents() {
  const { blobs } = await store().list();
  return blobs.map((b) => {
    const [prefix, rest] = b.key.split("/");
    const [id, subject, topic, mode, result] = rest.split("_");
    return { demo: prefix === "demo", ts: Number(id.split("-")[0]), subject, topic, mode, result };
  });
}

export async function writeRaw(keys) {
  const s = store();
  for (let i = 0; i < keys.length; i += 20) {
    await Promise.all(keys.slice(i, i + 20).map((k) => s.set(k, "")));
  }
}

export async function deleteByPrefix(prefix) {
  const s = store();
  const { blobs } = await s.list({ prefix });
  for (let i = 0; i < blobs.length; i += 20) {
    await Promise.all(blobs.slice(i, i + 20).map((b) => s.delete(b.key)));
  }
  return blobs.length;
}
