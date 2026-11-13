/**
 * X (Twitter) + TikTok Downloader Bot — Cloudflare Worker
 * ------------------------------------------------
 * • Gửi link X/Twitter hoặc TikTok → bot hiện nút bấm
 * • Chạm vào ảnh nào → gửi NGAY link direct (chất lượng gốc) của ảnh đó
 * • Tải video / GIF / ảnh / nhạc về thẳng Telegram
 * • Video X: tự chọn bản độ phân giải cao nhất (lấy danh sách đầy đủ từ X)
 * • TikTok: video không logo (HD nếu có), slideshow ảnh, nhạc
 * • /settings: ngôn ngữ, chất lượng video, gửi ảnh dạng photo/file, chế độ tự động, caption
 *
 * Cấu hình: xem wrangler.toml  |  Secrets: BOT_TOKEN, WEBHOOK_SECRET
 * Nguồn dữ liệu: api.fxtwitter.com + cdn.syndication.twimg.com (X), tikwm.com (TikTok) — không cần API key
 */

const FX_API = "https://api.fxtwitter.com";
const TT_API = "https://www.tikwm.com/api/";
const LINK_RE =
  /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fxtwitter\.com|fixupx\.com|vxtwitter\.com|fixvx\.com|t\.co)\/[^\s<>"']+/gi;
const TT_RE = /https?:\/\/(?:(?:www|m|vm|vt)\.)?tiktok\.com\/[^\s<>"']+/gi;
const ANY_RE = new RegExp(`${LINK_RE.source}|${TT_RE.source}`, "gi");
const STATUS_RE = /\/status(?:es)?\/(\d{5,25})/i;
const TT_ID_RE = /\/(?:video|photo)\/(\d{8,25})/i;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TG_UPLOAD_MAX = 49 * 1024 * 1024; // Telegram cho bot upload tối đa 50MB (gửi bằng link chỉ 20MB)

/* ───────────────────────── Ngôn ngữ ───────────────────────── */
const T = {
  vi: {
    start:
      "👋 <b>Chào mừng bạn!</b>\n\nGửi mình link <b>X (Twitter)</b> hoặc <b>TikTok</b>, mình sẽ giúp bạn:\n🔗 Lấy <b>link direct</b> ảnh gốc — chạm vào ảnh nào, gửi link ảnh đó ngay\n🖼 Tải ảnh chất lượng cao\n🎬 Tải video / GIF (X: bản nét nhất, TikTok: không logo)\n🎵 Tải nhạc TikTok\n\n⚙️ /settings để tuỳ chỉnh • ❓ /help để xem hướng dẫn",
    help:
      "📖 <b>Hướng dẫn</b>\n\n1️⃣ Dán link bài viết X/Twitter hoặc video TikTok (có thể dán nhiều link một lúc)\n2️⃣ Bấm nút bên dưới:\n   • <b>🔗 Ảnh 1, Ảnh 2…</b> → nhận link direct của ảnh đó ngay\n   • <b>🔗 Tất cả link</b> → nhận link của mọi ảnh\n   • <b>📥 Tải ảnh</b> → bot gửi file ảnh\n   • <b>🎬 Video</b> → bot gửi video\n   • <b>🎵 Nhạc</b> → bot gửi nhạc nền (TikTok)\n\n💡 Mẹo: /settings → bật <b>Tự động</b> để bot gửi luôn link/file mà không cần bấm nút.",
    notLink: "🤔 Mình chưa thấy link X/Twitter hay TikTok nào. Hãy gửi link dạng <code>https://x.com/user/status/123…</code> hoặc <code>https://vt.tiktok.com/…</code>",
    notFound: "😕 Không lấy được bài viết này (có thể bị xoá, ẩn hoặc tài khoản riêng tư).",
    noMedia: "ℹ️ Bài viết này không có ảnh hay video.",
    working: "⏳ Đang xử lý…",
    photo: "Ảnh",
    video: "Video",
    music: "Nhạc",
    allLinks: "Tất cả link",
    sendPhotos: "Tải ảnh",
    sendFail: "⚠️ Telegram không nhận được file (có thể quá nặng, giới hạn 50MB). Đây là link direct:",
    denied: "⛔ Bạn không có quyền dùng bot này.",
    noKV: "⚠️ Chủ bot chưa bật KV nên cài đặt không được lưu.",
    settingsTitle: "⚙️ <b>Cài đặt</b>\nChạm để thay đổi:",
    sLang: "🌐 Ngôn ngữ",
    sQuality: "🎞 Chất lượng video",
    sPhotoAs: "🖼 Gửi ảnh dạng",
    sAuto: "🤖 Chế độ tự động",
    sCaption: "📝 Caption",
    q: { best: "Cao nhất", medium: "Vừa", low: "Thấp" },
    pa: { photo: "Ảnh (nén)", document: "File (gốc)" },
    au: { off: "Tắt", links: "Gửi link", files: "Gửi file" },
    on: "Bật",
    off: "Tắt",
    saved: "✅ Đã lưu",
    tapHint: "👆 Chạm số ảnh để nhận link direct",
    photos: "ảnh",
    videos: "video",
  },
  en: {
    start:
      "👋 <b>Welcome!</b>\n\nSend me an <b>X (Twitter)</b> or <b>TikTok</b> link and I'll help you:\n🔗 Get <b>direct links</b> to original images — tap an image, get its link instantly\n🖼 Download high-quality photos\n🎬 Download videos / GIFs (X: best quality, TikTok: no watermark)\n🎵 Download TikTok music\n\n⚙️ /settings to customize • ❓ /help for instructions",
    help:
      "📖 <b>How to use</b>\n\n1️⃣ Paste an X/Twitter post or TikTok video link (multiple links are fine)\n2️⃣ Tap a button:\n   • <b>🔗 Photo 1, Photo 2…</b> → instantly get that photo's direct link\n   • <b>🔗 All links</b> → links for every photo\n   • <b>📥 Download photos</b> → bot sends the files\n   • <b>🎬 Video</b> → bot sends the video\n   • <b>🎵 Music</b> → bot sends the sound (TikTok)\n\n💡 Tip: /settings → enable <b>Auto</b> mode to skip the buttons.",
    notLink: "🤔 I couldn't find an X/Twitter or TikTok link. Send something like <code>https://x.com/user/status/123…</code> or <code>https://vt.tiktok.com/…</code>",
    notFound: "😕 Couldn't fetch this post (deleted, hidden or from a private account).",
    noMedia: "ℹ️ This post has no photos or videos.",
    working: "⏳ Working…",
    photo: "Photo",
    video: "Video",
    music: "Music",
    allLinks: "All links",
    sendPhotos: "Download photos",
    sendFail: "⚠️ Telegram couldn't accept the file (maybe too large, 50MB limit). Here is the direct link:",
    denied: "⛔ You are not allowed to use this bot.",
    noKV: "⚠️ The bot owner hasn't enabled KV, so settings can't be saved.",
    settingsTitle: "⚙️ <b>Settings</b>\nTap to change:",
    sLang: "🌐 Language",
    sQuality: "🎞 Video quality",
    sPhotoAs: "🖼 Send photos as",
    sAuto: "🤖 Auto mode",
    sCaption: "📝 Caption",
    q: { best: "Best", medium: "Medium", low: "Low" },
    pa: { photo: "Photo (compressed)", document: "File (original)" },
    au: { off: "Off", links: "Send links", files: "Send files" },
    on: "On",
    off: "Off",
    saved: "✅ Saved",
    tapHint: "👆 Tap a photo number to get its direct link",
    photos: "photos",
    videos: "videos",
  },
};

/* ───────────────────────── Entry ───────────────────────── */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET") {
      if (url.pathname === "/setup") return setup(url, env);
      return new Response("X & TikTok Downloader Bot is running ✅");
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    if (env.WEBHOOK_SECRET && request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    ctx.waitUntil(handleUpdate(update, env).catch((e) => console.error("handleUpdate error:", e)));
    return new Response("ok");
  },
};

/* ───────────────────────── Cấu hình ───────────────────────── */
function cfg(env) {
  const list = (s) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
  return {
    maxLinks: parseInt(env.MAX_LINKS_PER_MESSAGE, 10) || 3,
    allowed: list(env.ALLOWED_USERS),
    admins: list(env.ADMIN_IDS),
    showStats: env.SHOW_TWEET_STATS !== "false",
    enableStats: env.ENABLE_STATS === "true",
    defaults: {
      lang: env.DEFAULT_LANG === "en" ? "en" : "vi",
      quality: ["best", "medium", "low"].includes(env.DEFAULT_QUALITY) ? env.DEFAULT_QUALITY : "best",
      photoAs: env.DEFAULT_PHOTO_AS === "document" ? "document" : "photo",
      auto: ["off", "links", "files"].includes(env.DEFAULT_AUTO) ? env.DEFAULT_AUTO : "off",
      caption: env.DEFAULT_CAPTION !== "false",
    },
  };
}

async function getUser(env, id, cf) {
  if (!env.KV) return { ...cf.defaults };
  try {
    const saved = await env.KV.get(`u:${id}`, "json");
    return { ...cf.defaults, ...(saved || {}) };
  } catch {
    return { ...cf.defaults };
  }
}
async function saveUser(env, id, user) {
  if (env.KV) await env.KV.put(`u:${id}`, JSON.stringify(user));
}
async function bump(env, cf, key) {
  if (!cf.enableStats || !env.KV) return;
  try {
    const n = parseInt((await env.KV.get(`stat:${key}`)) || "0", 10);
    await env.KV.put(`stat:${key}`, String(n + 1));
  } catch {}
}
const isAllowed = (cf, id) => cf.allowed.length === 0 || cf.allowed.includes(String(id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── Telegram helpers ───────────────────────── */
async function tg(env, method, body) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

// Tải file về Worker rồi upload thẳng lên Telegram (dùng khi gửi bằng link bị từ chối: file > 20MB, link cần header…)
async function tgUpload(env, method, field, url, fields, filename, mime) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return { ok: false, description: `download HTTP ${r.status}` };
    const len = parseInt(r.headers.get("content-length") || "0", 10);
    if (len > TG_UPLOAD_MAX) return { ok: false, description: "file too big" };
    const buf = await r.arrayBuffer();
    if (buf.byteLength > TG_UPLOAD_MAX) return { ok: false, description: "file too big" };
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v));
    fd.append(field, new Blob([buf], { type: mime }), filename);
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method: "POST", body: fd });
    return await res.json();
  } catch (e) {
    return { ok: false, description: String(e) };
  }
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const base = (c) => ({ chat_id: c.chatId, message_thread_id: c.thread });

function send(c, text, extra = {}) {
  return tg(c.env, "sendMessage", {
    ...base(c),
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(c.replyTo ? { reply_parameters: { message_id: c.replyTo, allow_sending_without_reply: true } } : {}),
    ...extra,
  });
}

/* ───────────────────────── Router ───────────────────────── */
async function handleUpdate(update, env) {
  if (update.message) return onMessage(env, update.message);
  if (update.callback_query) return onCallback(env, update.callback_query);
}

async function onMessage(env, msg) {
  const cf = cfg(env);
  const from = msg.from;
  if (!from || from.is_bot) return;

  const user = await getUser(env, from.id, cf);
  const L = T[user.lang] || T.vi;
  const isPrivate = msg.chat.type === "private";
  const c = {
    env, cf, L, user,
    chatId: msg.chat.id,
    thread: msg.is_topic_message ? msg.message_thread_id : undefined,
    replyTo: msg.message_id,
    userId: from.id,
  };

  if (!isAllowed(cf, from.id)) {
    if (isPrivate) await send(c, L.denied);
    return;
  }

  const hidden = (msg.entities || msg.caption_entities || [])
    .filter((e) => e.type === "text_link" && e.url)
    .map((e) => e.url)
    .join(" ");
  const text = `${msg.text || msg.caption || ""} ${hidden}`.trim();

  // Lệnh
  const cmd = text.match(/^\/(\w+)(?:@\w+)?(?:\s|$)/);
  if (cmd) {
    switch (cmd[1].toLowerCase()) {
      case "start": return send(c, L.start);
      case "help": return send(c, L.help);
      case "settings": return showSettings(c);
      case "stats": return showStats(c);
      default: return;
    }
  }

  // Tìm link
  const items = await extractItems(text, cf.maxLinks);
  if (!items.length) {
    if (isPrivate) await send(c, L.notLink);
    return;
  }

  await tg(env, "sendChatAction", { ...base(c), action: "typing" });
  for (const it of items) await handleItem(c, it);
}

/* ───────────────────────── Nhận diện link ───────────────────────── */
async function resolveRedirect(u) {
  try {
    const r = await fetch(u, { redirect: "manual", headers: { "User-Agent": UA } });
    const loc = r.headers.get("location");
    return loc ? new URL(loc, u).toString() : "";
  } catch {
    return "";
  }
}

// Link TikTok rút gọn (vm./vt./tiktok.com/t/…) → theo redirect để lấy ID video
async function resolveTikTok(u) {
  for (let i = 0; i < 4; i++) {
    const m = u.match(TT_ID_RE);
    if (m) return { id: m[1], url: u };
    u = await resolveRedirect(u);
    if (!u) return null;
  }
  return null;
}

async function extractItems(text, max) {
  const links = [...new Set(text.match(ANY_RE) || [])];
  const out = [];
  for (const l of links) {
    let u = l;
    if (/\/\/t\.co\//i.test(u)) u = await resolveRedirect(u);
    if (!u) continue;
    if (/tiktok\.com/i.test(u)) {
      const r = await resolveTikTok(u);
      if (r && !out.some((o) => o.k === "tt" && o.id === r.id)) out.push({ k: "tt", ...r });
    } else {
      const m = u.match(STATUS_RE);
      if (m && !out.some((o) => o.k === "x" && o.id === m[1])) out.push({ k: "x", id: m[1] });
    }
    if (out.length >= max) break;
  }
  return out;
}

/* ───────────────────────── X / Twitter ───────────────────────── */
async function getTweet(id) {
  const cache = caches.default;
  const key = new Request(`https://cache.local/tweet/${id}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  try {
    const r = await fetch(`${FX_API}/status/${id}`, { headers: { "User-Agent": "Mozilla/5.0 XDownloaderBot" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.tweet) return null;
    await cache.put(
      key,
      new Response(JSON.stringify(j.tweet), { headers: { "content-type": "application/json", "Cache-Control": "max-age=300" } })
    );
    return j.tweet;
  } catch {
    return null;
  }
}

// Dữ liệu gốc từ X (có đủ các bản 1080p/720p/480p…) — chỉ dùng để bổ sung danh sách video
async function getSyndication(id) {
  const cache = caches.default;
  const key = new Request(`https://cache.local/syn/${id}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  try {
    const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token}`, {
      headers: { "User-Agent": UA },
    });
    if (!r.ok) return null;
    const j = await r.json();
    await cache.put(
      key,
      new Response(JSON.stringify(j), { headers: { "content-type": "application/json", "Cache-Control": "max-age=300" } })
    );
    return j;
  } catch {
    return null;
  }
}

function origPhoto(u) {
  try {
    const x = new URL(u);
    if (x.hostname === "pbs.twimg.com") x.searchParams.set("name", "orig");
    return x.toString();
  } catch {
    return u;
  }
}

function getMedia(t) {
  const has = (x) => x && x.media && ((x.media.photos || []).length || (x.media.videos || []).length);
  const src = has(t) ? t : has(t.quote) ? t.quote : t;
  const m = src.media || {};
  return {
    srcId: src.id || t.id,
    photos: (m.photos || []).slice(0, 10).map((p) => ({ url: origPhoto(p.url) })),
    videos: (m.videos || []).slice(0, 10),
    music: null,
  };
}

/* ── Chọn video nét nhất ── */
const resOf = (url) => {
  const m = /\/(\d{2,5})x(\d{2,5})\//.exec(url || "");
  return m ? { w: +m[1], h: +m[2] } : null;
};
const isMp4 = (x) => x && x.url && ((x.content_type || "").includes("mp4") || /\.mp4(\?|$)/i.test(x.url));
const rankVariants = (list) =>
  [...list].sort((a, b) => {
    const ra = resOf(a.url), rb = resOf(b.url);
    const pa = ra ? ra.w * ra.h : 0, pb = rb ? rb.w * rb.h : 0;
    return pb - pa || (b.bitrate || 0) - (a.bitrate || 0);
  });

// Gộp bản video từ fxtwitter + từ X (syndication), sắp xếp theo độ phân giải giảm dần
async function enrichVideos(m, id) {
  if (!m.videos.length) return;
  const syn = await getSyndication(m.srcId || id);
  const synVids = syn ? (syn.mediaDetails || []).filter((x) => x.type === "video" || x.type === "animated_gif") : [];
  m.videos = m.videos.map((v, i) => {
    const extra = (synVids[i] && synVids[i].video_info && synVids[i].video_info.variants) || [];
    const own = v.variants || [];
    const all = [...own, ...extra, ...(v.url ? [{ url: v.url, content_type: "video/mp4" }] : [])].filter(isMp4);
    const seen = new Set();
    const uniq = all.filter((x) => {
      const k = x.url.split("?")[0];
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const ranked = rankVariants(uniq);
    const out = { ...v, variants: ranked };
    const best = ranked[0] && resOf(ranked[0].url);
    if (best) {
      out.width = best.w;
      out.height = best.h;
    }
    return out;
  });
}

// Danh sách URL theo thứ tự thử: bản theo chất lượng đã chọn, rồi các bản thấp hơn (dự phòng khi file quá nặng)
function videoUrls(v, quality) {
  const list = rankVariants((v.variants || []).filter(isMp4));
  if (!list.length) return v.url ? [v.url] : [];
  const start = quality === "low" ? list.length - 1 : quality === "medium" ? Math.floor((list.length - 1) / 2) : 0;
  return list.slice(start).map((x) => x.url);
}

/* ───────────────────────── TikTok ───────────────────────── */
const ttAbs = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `https://www.tikwm.com${u.startsWith("/") ? "" : "/"}${u}`);

async function ttFetch(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(TT_API, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": UA,
          Cookie: "current_language=en",
        },
        body: `url=${encodeURIComponent(url)}&hd=1`,
      });
      const j = await r.json().catch(() => null);
      if (j && j.code === 0 && j.data) return j.data;
      // tikwm giới hạn ~1 request/giây
      if (j && /limit/i.test(String(j.msg || ""))) {
        await sleep(1300);
        continue;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

function normTikTok(d) {
  const a = d.author || {};
  const uid = a.unique_id || "";
  const imgs = (d.images || []).map(ttAbs).filter(Boolean).slice(0, 20);
  const hd = ttAbs(d.hdplay), sd = ttAbs(d.play);
  const variants = [];
  if (hd) variants.push({ url: hd, bitrate: 2e6, content_type: "video/mp4" });
  if (sd && sd !== hd) variants.push({ url: sd, bitrate: 1e6, content_type: "video/mp4" });
  const t = {
    platform: "tt",
    id: d.id,
    url: `https://www.tiktok.com/@${uid}/video/${d.id}`,
    text: d.title || "",
    author: { name: a.nickname || uid, screen_name: uid },
    replies: d.comment_count,
    retweets: d.share_count,
    likes: d.digg_count,
    views: d.play_count,
  };
  const m = {
    photos: imgs.map((url) => ({ url })),
    videos:
      !imgs.length && variants.length
        ? [{ type: "video", url: variants[0].url, variants, duration: d.duration || undefined }]
        : [],
    music: d.music
      ? { url: ttAbs(d.music), title: (d.music_info && d.music_info.title) || "TikTok", performer: (d.music_info && d.music_info.author) || uid }
      : null,
  };
  return { t, m };
}

async function getTikTok(id, url) {
  const cache = caches.default;
  const key = new Request(`https://cache.local/tt/${id}`);
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const d = await ttFetch(url || `https://www.tiktok.com/@tiktok/video/${id}`);
  if (!d) return null;
  const post = normTikTok(d);
  await cache.put(
    key,
    new Response(JSON.stringify(post), { headers: { "content-type": "application/json", "Cache-Control": "max-age=1800" } })
  );
  return post;
}

/* ───────────────────────── Tải bài viết (chung) ───────────────────────── */
// pid: ID tweet (số) hoặc "T" + ID video TikTok
async function loadPost(pid, url) {
  if (pid[0] === "T") return getTikTok(pid.slice(1), url);
  const t = await getTweet(pid);
  if (!t) return null;
  const m = getMedia(t);
  await enrichVideos(m, pid);
  return { t, m };
}

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n ?? 0));

function previewText(c, t, m) {
  const a = t.author || {};
  let s = `<b>${esc(a.name || "")}</b> (@${esc(a.screen_name || "")})\n`;
  const body = (t.text || "").trim();
  if (body) s += `\n${esc(body.length > 300 ? body.slice(0, 300) + "…" : body)}\n`;
  if (c.cf.showStats) s += `\n💬 ${fmt(t.replies)}  🔁 ${fmt(t.retweets)}  ❤️ ${fmt(t.likes)}${t.views ? `  👁 ${fmt(t.views)}` : ""}`;
  const parts = [];
  if (m.photos.length) parts.push(`🖼 ${m.photos.length} ${c.L.photos}`);
  if (m.videos.length) parts.push(`🎬 ${m.videos.length} ${c.L.videos}`);
  if (m.music) parts.push("🎵");
  s += `\n${parts.join(" • ")}`;
  if (m.photos.length) s += `\n\n${c.L.tapHint}`;
  return s;
}

function keyboard(c, pid, m) {
  const L = c.L;
  const rows = [];
  const n = m.photos.length;
  if (n) {
    const per = n <= 4 ? 2 : 5;
    const btns = m.photos.map((_, i) => ({
      text: n <= 4 ? `🔗 ${L.photo} ${i + 1}` : `🔗 ${i + 1}`,
      callback_data: `i:${pid}:${i}`,
    }));
    for (let i = 0; i < btns.length; i += per) rows.push(btns.slice(i, i + per));
    if (n > 1) rows.push([{ text: `🔗 ${L.allLinks}`, callback_data: `ia:${pid}` }]);
    rows.push([{ text: `📥 ${L.sendPhotos}`, callback_data: `pf:${pid}` }]);
  }
  m.videos.forEach((v, i) => {
    const q = v.height ? ` ${v.height}p` : "";
    rows.push([{ text: `🎬 ${v.type === "gif" ? "GIF" : L.video} ${i + 1}${q}`, callback_data: `vs:${pid}:${i}` }]);
  });
  if (m.music) rows.push([{ text: `🎵 ${L.music}`, callback_data: `mu:${pid}` }]);
  return rows;
}

async function handleItem(c, it) {
  const pid = it.k === "tt" ? `T${it.id}` : it.id;
  const p = await loadPost(pid, it.url);
  if (!p) return send(c, c.L.notFound);
  const { t, m } = p;
  if (!m.photos.length && !m.videos.length) return send(c, c.L.noMedia);

  await bump(c.env, c.cf, "requests");
  await send(c, previewText(c, t, m), { reply_markup: { inline_keyboard: keyboard(c, pid, m) } });

  if (c.user.auto === "files") {
    if (m.photos.length) await sendPhotos(c, t, m.photos);
    for (let i = 0; i < m.videos.length; i++) await sendVideo(c, t, m.videos[i]);
  } else if (c.user.auto === "links") {
    await sendLinks(c, linesFor(c, m, { photos: "all", videos: true }));
  }
}

/* ───────────────────────── Gửi link / file ───────────────────────── */
function linesFor(c, m, { photos, videos }) {
  const out = [];
  const L = c.L;
  const pick = (arr, sel) => (sel === "all" ? arr.map((x, i) => [x, i]) : typeof sel === "number" && arr[sel] ? [[arr[sel], sel]] : []);
  for (const [p, i] of pick(m.photos, photos)) out.push(`🖼 ${L.photo} ${i + 1}\n${p.url}`);
  if (videos) {
    m.videos.forEach((v, i) => {
      const u = videoUrls(v, c.user.quality)[0];
      if (u) out.push(`🎬 ${L.video} ${i + 1}${v.height ? ` ${v.height}p` : ""}\n${u}`);
    });
  }
  return out;
}

async function sendLinks(c, lines) {
  if (!lines.length) return;
  let buf = "";
  for (const l of lines) {
    if ((buf + l).length > 3800) {
      await send(c, buf);
      buf = "";
    }
    buf += (buf ? "\n\n" : "") + l;
  }
  if (buf) await send(c, buf);
}

const capLine = (c, t) => {
  if (!c.user.caption) return undefined;
  const sn = t.author?.screen_name || "";
  return `${t.platform === "tt" ? "🎵" : "🐦"} <a href="${esc(t.url || "")}">@${esc(sn)}</a>`;
};

async function sendPhotos(c, t, photos) {
  const asDoc = c.user.photoAs === "document";
  const type = asDoc ? "document" : "photo";
  const cap = capLine(c, t);
  for (let i = 0; i < photos.length; i += 10) {
    const chunk = photos.slice(i, i + 10);
    let res;
    if (chunk.length === 1) {
      res = await tg(c.env, asDoc ? "sendDocument" : "sendPhoto", {
        ...base(c),
        [type]: chunk[0].url,
        caption: i === 0 ? cap : undefined,
        parse_mode: "HTML",
      });
    } else {
      res = await tg(c.env, "sendMediaGroup", {
        ...base(c),
        media: chunk.map((p, k) => ({
          type,
          media: p.url,
          caption: i === 0 && k === 0 ? cap : undefined,
          parse_mode: "HTML",
        })),
      });
    }
    await bump(c.env, c.cf, "downloads");
    if (!res.ok) {
      await send(c, c.L.sendFail);
      await sendLinks(c, chunk.map((p) => p.url));
    }
  }
}

async function sendVideo(c, t, v) {
  const urls = videoUrls(v, c.user.quality).slice(0, 3);
  if (!urls.length) return send(c, c.L.sendFail);
  const gif = v.type === "gif";
  const method = gif ? "sendAnimation" : "sendVideo";
  const field = gif ? "animation" : "video";
  const fields = {
    ...base(c),
    caption: capLine(c, t),
    parse_mode: "HTML",
    ...(gif ? {} : { supports_streaming: true }),
  };
  const dims = { width: v.width, height: v.height, duration: v.duration ? Math.round(v.duration) : undefined };

  let res = { ok: false };
  for (let i = 0; i < urls.length; i++) {
    const f = i === 0 ? { ...fields, ...dims } : fields;
    // 1) Telegram tự tải từ link (tối đa 20MB)  2) Worker tải về rồi upload (tối đa 50MB)
    res = await tg(c.env, method, { ...f, [field]: urls[i] });
    if (!res.ok) res = await tgUpload(c.env, method, field, urls[i], f, "video.mp4", "video/mp4");
    if (res.ok) break;
  }
  await bump(c.env, c.cf, "downloads");
  if (!res.ok) await send(c, `${c.L.sendFail}\n${urls[0]}`);
}

async function sendMusic(c, t, music) {
  if (!music || !music.url) return;
  const fields = {
    ...base(c),
    caption: capLine(c, t),
    parse_mode: "HTML",
    title: music.title,
    performer: music.performer,
  };
  let res = await tg(c.env, "sendAudio", { ...fields, audio: music.url });
  if (!res.ok) res = await tgUpload(c.env, "sendAudio", "audio", music.url, fields, "music.mp3", "audio/mpeg");
  await bump(c.env, c.cf, "downloads");
  if (!res.ok) await send(c, `${c.L.sendFail}\n${music.url}`);
}

/* ───────────────────────── Callback (nút bấm) ───────────────────────── */
async function onCallback(env, cq) {
  const cf = cfg(env);
  const msg = cq.message;
  if (!msg) return tg(env, "answerCallbackQuery", { callback_query_id: cq.id });

  const user = await getUser(env, cq.from.id, cf);
  const L = T[user.lang] || T.vi;
  const c = {
    env, cf, L, user,
    chatId: msg.chat.id,
    thread: msg.is_topic_message ? msg.message_thread_id : undefined,
    userId: cq.from.id,
    msg,
  };

  if (!isAllowed(cf, cq.from.id)) {
    return tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: L.denied, show_alert: true });
  }

  const data = cq.data || "";
  if (data === "noop") return tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
  if (data.startsWith("st:")) return onSetting(c, cq, data);

  const [act, pid, arg] = data.split(":");
  await tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: L.working });

  const p = pid ? await loadPost(pid) : null;
  if (!p) return send(c, L.notFound);
  const { t, m } = p;
  const idx = parseInt(arg, 10);

  switch (act) {
    case "i":  return sendLinks(c, linesFor(c, m, { photos: idx }));
    case "ia": return sendLinks(c, linesFor(c, m, { photos: "all" }));
    case "pf": return sendPhotos(c, t, m.photos);
    case "vs": return m.videos[idx] ? sendVideo(c, t, m.videos[idx]) : undefined;
    case "mu": return sendMusic(c, t, m.music);
  }
}

/* ───────────────────────── Cài đặt ───────────────────────── */
function settingsKeyboard(c) {
  const u = c.user, L = c.L;
  const mark = (on, label) => (on ? `✅ ${label}` : label);
  const title = (t) => [{ text: t, callback_data: "noop" }];
  const opt = (key, val, label) => ({ text: mark(u[key] === val, label), callback_data: `st:${key}:${val}` });
  return [
    title(L.sLang),
    [opt("lang", "vi", "🇻🇳 Tiếng Việt"), opt("lang", "en", "🇬🇧 English")],
    title(L.sQuality),
    ["best", "medium", "low"].map((v) => opt("quality", v, L.q[v])),
    title(L.sPhotoAs),
    ["photo", "document"].map((v) => opt("photoAs", v, L.pa[v])),
    title(L.sAuto),
    ["off", "links", "files"].map((v) => opt("auto", v, L.au[v])),
    title(L.sCaption),
    [opt("caption", true, L.on), opt("caption", false, L.off)],
  ];
}

async function showSettings(c) {
  const note = c.env.KV ? "" : `\n\n${c.L.noKV}`;
  return send(c, c.L.settingsTitle + note, { reply_markup: { inline_keyboard: settingsKeyboard(c) } });
}

const VALID = {
  lang: ["vi", "en"],
  quality: ["best", "medium", "low"],
  photoAs: ["photo", "document"],
  auto: ["off", "links", "files"],
  caption: ["true", "false"],
};

async function onSetting(c, cq, data) {
  const [, key, raw] = data.split(":");
  if (!VALID[key] || !VALID[key].includes(raw)) return tg(c.env, "answerCallbackQuery", { callback_query_id: cq.id });
  if (!c.env.KV) {
    return tg(c.env, "answerCallbackQuery", { callback_query_id: cq.id, text: c.L.noKV, show_alert: true });
  }
  c.user[key] = key === "caption" ? raw === "true" : raw;
  await saveUser(c.env, c.userId, c.user);
  c.L = T[c.user.lang] || T.vi;
  await tg(c.env, "answerCallbackQuery", { callback_query_id: cq.id, text: c.L.saved });
  return tg(c.env, "editMessageText", {
    chat_id: c.chatId,
    message_id: c.msg.message_id,
    text: c.L.settingsTitle,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: settingsKeyboard(c) },
  });
}

/* ───────────────────────── Admin ───────────────────────── */
async function showStats(c) {
  if (!c.cf.admins.includes(String(c.userId))) return;
  if (!c.cf.enableStats || !c.env.KV) return send(c, "ℹ️ Stats: set ENABLE_STATS=\"true\" và gắn KV.");
  const r = (await c.env.KV.get("stat:requests")) || "0";
  const d = (await c.env.KV.get("stat:downloads")) || "0";
  return send(c, `📊 <b>Stats</b>\nLink đã xử lý: <b>${r}</b>\nLần tải: <b>${d}</b>`);
}

/* ───────────────────────── Setup webhook ───────────────────────── */
async function setup(url, env) {
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET) {
    return new Response("Thiếu BOT_TOKEN hoặc WEBHOOK_SECRET (secrets).", { status: 500 });
  }
  if (url.searchParams.get("key") !== env.WEBHOOK_SECRET) {
    return new Response("Unauthorized. Dùng: /setup?key=<WEBHOOK_SECRET>", { status: 401 });
  }
  const hook = await tg(env, "setWebhook", {
    url: `${url.origin}/`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  const cmds = (lang) => [
    { command: "start", description: T[lang].start.replace(/<[^>]+>/g, "").split("\n")[0].slice(0, 60) },
    { command: "help", description: lang === "vi" ? "Hướng dẫn sử dụng" : "How to use" },
    { command: "settings", description: lang === "vi" ? "Cài đặt" : "Settings" },
  ];
  await tg(env, "setMyCommands", { commands: cmds("vi") });
  await tg(env, "setMyCommands", { commands: cmds("en"), language_code: "en" });
  return new Response(JSON.stringify({ webhook: hook }, null, 2), { headers: { "content-type": "application/json" } });
}
