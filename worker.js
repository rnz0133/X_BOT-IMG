/**
 * X (Twitter) Downloader Bot — Cloudflare Worker
 * ------------------------------------------------
 * • Gửi link X/Twitter → bot hiện nút bấm
 * • Chạm vào ảnh nào → gửi NGAY link direct (chất lượng gốc) của ảnh đó
 * • Tải video / GIF / ảnh về thẳng Telegram
 * • /settings: ngôn ngữ, chất lượng video, gửi ảnh dạng photo/file, chế độ tự động, caption
 *
 * Cấu hình: xem wrangler.toml  |  Secrets: BOT_TOKEN, WEBHOOK_SECRET
 * Nguồn dữ liệu: api.fxtwitter.com (miễn phí, không cần API key)
 */

const FX_API = "https://api.fxtwitter.com";
const LINK_RE =
  /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fxtwitter\.com|fixupx\.com|vxtwitter\.com|fixvx\.com|t\.co)\/[^\s<>"']+/gi;
const STATUS_RE = /\/status(?:es)?\/(\d{5,25})/i;

/* ───────────────────────── Ngôn ngữ ───────────────────────── */
const T = {
  vi: {
    start:
      "👋 <b>Chào mừng bạn!</b>\n\nGửi mình link bài viết <b>X (Twitter)</b>, mình sẽ giúp bạn:\n🔗 Lấy <b>link direct</b> ảnh gốc — chạm vào ảnh nào, gửi link ảnh đó ngay\n🖼 Tải ảnh chất lượng cao\n🎬 Tải video / GIF\n\n⚙️ /settings để tuỳ chỉnh • ❓ /help để xem hướng dẫn",
    help:
      "📖 <b>Hướng dẫn</b>\n\n1️⃣ Dán link bài viết X/Twitter (có thể dán nhiều link một lúc)\n2️⃣ Bấm nút bên dưới:\n   • <b>🔗 Ảnh 1, Ảnh 2…</b> → nhận link direct của ảnh đó ngay\n   • <b>🔗 Tất cả link</b> → nhận link của mọi ảnh\n   • <b>📥 Tải ảnh</b> → bot gửi file ảnh\n   • <b>🎬 Video</b> → bot gửi video, nút 🔗 để lấy link\n\n💡 Mẹo: /settings → bật <b>Tự động</b> để bot gửi luôn link/file mà không cần bấm nút.",
    notLink: "🤔 Mình chưa thấy link X/Twitter nào. Hãy gửi link dạng <code>https://x.com/user/status/123…</code>",
    notFound: "😕 Không lấy được bài viết này (có thể bị xoá, ẩn hoặc tài khoản riêng tư).",
    noMedia: "ℹ️ Bài viết này không có ảnh hay video.",
    working: "⏳ Đang xử lý…",
    photo: "Ảnh",
    video: "Video",
    allLinks: "Tất cả link",
    sendPhotos: "Tải ảnh",
    openTweet: "Mở bài viết",
    sendFail: "⚠️ Telegram không nhận được file (có thể quá nặng). Đây là link direct:",
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
      "👋 <b>Welcome!</b>\n\nSend me an <b>X (Twitter)</b> post link and I'll help you:\n🔗 Get <b>direct links</b> to original images — tap an image, get its link instantly\n🖼 Download high-quality photos\n🎬 Download videos / GIFs\n\n⚙️ /settings to customize • ❓ /help for instructions",
    help:
      "📖 <b>How to use</b>\n\n1️⃣ Paste an X/Twitter post link (multiple links are fine)\n2️⃣ Tap a button:\n   • <b>🔗 Photo 1, Photo 2…</b> → instantly get that photo's direct link\n   • <b>🔗 All links</b> → links for every photo\n   • <b>📥 Download photos</b> → bot sends the files\n   • <b>🎬 Video</b> → bot sends the video, 🔗 gets its link\n\n💡 Tip: /settings → enable <b>Auto</b> mode to skip the buttons.",
    notLink: "🤔 I couldn't find an X/Twitter link. Send something like <code>https://x.com/user/status/123…</code>",
    notFound: "😕 Couldn't fetch this post (deleted, hidden or from a private account).",
    noMedia: "ℹ️ This post has no photos or videos.",
    working: "⏳ Working…",
    photo: "Photo",
    video: "Video",
    allLinks: "All links",
    sendPhotos: "Download photos",
    openTweet: "Open post",
    sendFail: "⚠️ Telegram couldn't accept the file (maybe too large). Here is the direct link:",
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
      return new Response("X Downloader Bot is running ✅");
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
  const ids = await extractIds(text, cf.maxLinks);
  if (!ids.length) {
    if (isPrivate) await send(c, L.notLink);
    return;
  }

  await tg(env, "sendChatAction", { ...base(c), action: "typing" });
  for (const id of ids) await handleTweet(c, id);
}

/* ───────────────────────── Xử lý tweet ───────────────────────── */
async function extractIds(text, max) {
  const links = [...new Set(text.match(LINK_RE) || [])];
  const ids = [];
  for (const l of links) {
    let u = l;
    if (/\/\/t\.co\//i.test(u)) u = await resolveTco(u);
    const m = u && u.match(STATUS_RE);
    if (m && !ids.includes(m[1])) ids.push(m[1]);
    if (ids.length >= max) break;
  }
  return ids;
}

async function resolveTco(u) {
  try {
    const r = await fetch(u, { redirect: "manual" });
    return r.headers.get("location") || "";
  } catch {
    return "";
  }
}

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
    photos: (m.photos || []).slice(0, 10).map((p) => ({ url: origPhoto(p.url) })),
    videos: (m.videos || []).slice(0, 10),
  };
}

function pickVideo(v, quality) {
  const mp4 = (v.variants || [])
    .filter((x) => x.url && (x.content_type || "").includes("mp4"))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
  if (!mp4.length) return v.url;
  if (quality === "low") return mp4[mp4.length - 1].url;
  if (quality === "medium") return mp4[Math.floor((mp4.length - 1) / 2)].url;
  return mp4[0].url;
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
  s += `\n${parts.join(" • ")}`;
  if (m.photos.length) s += `\n\n${c.L.tapHint}`;
  return s;
}

function keyboard(c, t, id, m) {
  const L = c.L;
  const rows = [];
  const n = m.photos.length;
  if (n) {
    const per = n <= 4 ? 2 : 5;
    const btns = m.photos.map((_, i) => ({
      text: n <= 4 ? `🔗 ${L.photo} ${i + 1}` : `🔗 ${i + 1}`,
      callback_data: `i:${id}:${i}`,
    }));
    for (let i = 0; i < btns.length; i += per) rows.push(btns.slice(i, i + per));
    if (n > 1) rows.push([{ text: `🔗 ${L.allLinks}`, callback_data: `ia:${id}` }]);
    rows.push([{ text: `📥 ${L.sendPhotos}`, callback_data: `pf:${id}` }]);
  }
  m.videos.forEach((v, i) => {
    const q = v.height ? ` ${v.height}p` : "";
    rows.push([
      { text: `🎬 ${v.type === "gif" ? "GIF" : L.video} ${i + 1}${q}`, callback_data: `vs:${id}:${i}` },
      { text: "🔗", callback_data: `vl:${id}:${i}` },
    ]);
  });
  rows.push([{ text: `🐦 ${L.openTweet}`, url: t.url || `https://x.com/i/status/${id}` }]);
  return rows;
}

async function handleTweet(c, id) {
  const t = await getTweet(id);
  if (!t) return send(c, c.L.notFound);
  const m = getMedia(t);
  if (!m.photos.length && !m.videos.length) return send(c, c.L.noMedia);

  await bump(c.env, c.cf, "requests");
  await send(c, previewText(c, t, m), { reply_markup: { inline_keyboard: keyboard(c, t, id, m) } });

  if (c.user.auto === "files") {
    if (m.photos.length) await sendPhotos(c, t, m.photos);
    for (let i = 0; i < m.videos.length; i++) await sendVideo(c, t, m.videos[i]);
  } else if (c.user.auto === "links") {
    await sendLinks(c, linesFor(c, m, { photos: "all", videos: "all" }));
  }
}

/* ───────────────────────── Gửi link / file ───────────────────────── */
function linesFor(c, m, { photos, videos }) {
  const out = [];
  const L = c.L;
  const pick = (arr, sel) => (sel === "all" ? arr.map((x, i) => [x, i]) : typeof sel === "number" && arr[sel] ? [[arr[sel], sel]] : []);
  for (const [p, i] of pick(m.photos, photos)) out.push(`🖼 ${L.photo} ${i + 1}\n${p.url}`);
  for (const [v, i] of pick(m.videos, videos)) out.push(`🎬 ${v.type === "gif" ? "GIF" : L.video} ${i + 1}\n${pickVideo(v, c.user.quality)}`);
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
  return `🐦 <a href="${esc(t.url || "")}">@${esc(sn)}</a>`;
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
  const url = pickVideo(v, c.user.quality);
  const gif = v.type === "gif";
  const res = await tg(c.env, gif ? "sendAnimation" : "sendVideo", {
    ...base(c),
    [gif ? "animation" : "video"]: url,
    caption: capLine(c, t),
    parse_mode: "HTML",
    width: v.width,
    height: v.height,
    duration: v.duration ? Math.round(v.duration) : undefined,
    ...(gif ? {} : { supports_streaming: true }),
  });
  await bump(c.env, c.cf, "downloads");
  if (!res.ok) await send(c, `${c.L.sendFail}\n${url}`);
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

  const [act, id, arg] = data.split(":");
  await tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: L.working });

  const t = await getTweet(id);
  if (!t) return send(c, L.notFound);
  const m = getMedia(t);
  const idx = parseInt(arg, 10);

  switch (act) {
    case "i":  return sendLinks(c, linesFor(c, m, { photos: idx }));
    case "ia": return sendLinks(c, linesFor(c, m, { photos: "all" }));
    case "pf": return sendPhotos(c, t, m.photos);
    case "vl": return sendLinks(c, linesFor(c, m, { videos: idx }));
    case "vs": return m.videos[idx] ? sendVideo(c, t, m.videos[idx]) : undefined;
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
