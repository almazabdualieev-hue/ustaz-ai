import { checkPassword, makeToken } from "../lib/auth.mjs";
import { json } from "../lib/gemini.mjs";

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { login = "", password = "" } = await req.json();
    const user = checkPassword(login, password);
    if (!user) return json({ error: "bad_credentials" }, 401);
    return json({ token: makeToken(user), user });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
};

export const config = { path: "/api/login" };
