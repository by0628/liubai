/* 留白 · liubai-api（Netlify Functions 版）
   存储：Netlify Blobs（store 名 liubai）。口令：meta 里存，首次用 INIT_PASS。 */
import { getStore } from "@netlify/blobs";

const INIT_PASS = "liubai-9ac938";
const SEEDS = [
  { id: "seed-3", text: "新站开张。\n这里只放字，不放别的。", ts: Date.parse("2026-11-14T14:51:00+08:00"), weather: "雾", mood: "", tag: "留白", img: "", likes: 0 },
  { id: "seed-2", text: "哈尔滨的雾，早上起来，窗外什么都看不见。\n适合裹着被子，把歌调小声一点。", ts: Date.parse("2026-11-14T08:20:00+08:00"), weather: "雾", mood: "想睡了", tag: "日常", img: "", likes: 0 },
  { id: "seed-1", text: "把喜欢的东西，一件一件做出来。", ts: Date.parse("2026-11-13T22:40:00+08:00"), weather: "", mood: "平静", tag: "", img: "", likes: 0 }
];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Author-Pass"
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
const clean = (s, n) => String(s ?? "").trim().slice(0, n);

export default async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const store = getStore({ name: "liubai", consistency: "strong" });
  const path = new URL(req.url).pathname;

  const loadAll = async () => {
    const v = await store.get("posts:v1", { type: "json" });
    if (!v) { await store.setJSON("posts:v1", SEEDS); return structuredClone(SEEDS); }
    return v;
  };
  const saveAll = posts => store.setJSON("posts:v1", posts);
  const getPass = async () => {
    const m = await store.get("meta:v1", { type: "json" });
    if (!m || !m.pass) { await store.setJSON("meta:v1", { pass: INIT_PASS }); return INIT_PASS; }
    return m.pass;
  };

  try {
    if (path.endsWith("/health") || path.endsWith("/api") || path.endsWith("/api/"))
      return json({ ok: true, app: "liubai-api", v: 1, runtime: "netlify" });

    const del = path.match(/\/posts\/([^/]+)$/);
    if (del && req.method === "DELETE") {
      if (req.headers.get("X-Author-Pass") !== await getPass()) return json({ error: "口令不对" }, 401);
      const id = decodeURIComponent(del[1]);
      await saveAll((await loadAll()).filter(p => p.id !== id));
      return json({ ok: true });
    }

    if (path.endsWith("/posts") && req.method === "GET") {
      const posts = (await loadAll()).slice().sort((a, b) => b.ts - a.ts);
      return json({ posts });
    }

    if (path.endsWith("/posts") && req.method === "POST") {
      if (req.headers.get("X-Author-Pass") !== await getPass()) return json({ error: "口令不对" }, 401);
      const b = await req.json().catch(() => ({}));
      const text = clean(b.text, 600);
      if (!text) return json({ error: "内容是空的" }, 400);
      const post = {
        id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text,
        weather: clean(b.weather, 8),
        mood: clean(b.mood, 8),
        tag: clean(b.tag, 12).replace(/^#/, ""),
        img: clean(b.img, 500),
        ts: Number(b.ts) || Date.now(),
        likes: 0
      };
      const posts = await loadAll();
      posts.unshift(post);
      await saveAll(posts);
      return json({ post });
    }

    if (path.endsWith("/like") && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const posts = await loadAll();
      const p = posts.find(x => x.id === b.id);
      if (!p) return json({ error: "没找到这篇" }, 404);
      p.likes = Math.max(0, (p.likes || 0) + (b.delta === -1 ? -1 : 1));
      await saveAll(posts);
      return json({ likes: p.likes });
    }

    if (path.endsWith("/change-pass") && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (String(b.oldPass ?? "") !== await getPass()) return json({ error: "旧口令不对" }, 401);
      const np = clean(b.newPass, 64);
      if (np.length < 4) return json({ error: "新口令至少 4 位" }, 400);
      await store.setJSON("meta:v1", { pass: np });
      return json({ ok: true });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
};
