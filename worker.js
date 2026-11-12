/**
 * X (Twitter) Downloader Bot — Cloudflare Worker
 * ------------------------------------------------
 * • Gửi link X/Twitter → bot hiện nút bấm
 * • Chạm vào ảnh nào → gửi NGAY link direct (chất lượng gốc) của ảnh đó
 * • Tải video / GIF / ảnh về thẳng Telegram
 * • Tải ảnh lên imgbb (1 hay nhiều ảnh), chọn album — xem /imgbb
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
      "👋 <b>Chào mừng bạn!</b>\n\nGửi mình link bài viết <b>X (Twitter)</b>, mình sẽ giúp bạn:\n🔗 Lấy <b>link direct</b> ảnh gốc — chạm vào ảnh nào, gửi link ảnh đó ngay\n🖼 Tải ảnh chất lượng cao\n🎬 Tải video / GIF\n☁️ Tải ảnh lên imgbb (/imgbb)\n\n⚙️ /settings để tuỳ chỉnh • ❓ /help để xem hướng dẫn",
    help:
      "📖 <b>Hướng dẫn</b>\n\n1️⃣ Dán link bài viết X/Twitter (có thể dán nhiều link một lúc)\n2️⃣ Bấm nút bên dưới:\n   • <b>🔗 Ảnh 1, Ảnh 2…</b> → nhận link direct của ảnh đó ngay\n   • <b>🔗 Tất cả link</b> → nhận link của mọi ảnh\n   • <b>📥 Tải ảnh</b> → bot gửi file ảnh\n   • <b>☁️ imgbb</b> → tải ảnh của bài viết lên imgbb\n   • <b>🎬 Video</b> → bot gửi video\n\n☁️ <b>Tải ảnh lên imgbb</b>: /imgbb → đặt API key, chọn album, rồi gửi ảnh vào chat (1 hay nhiều ảnh tuỳ bạn) — bot tải lên và trả link.\n\n💡 Mẹo: /settings → bật <b>Tự động</b> để bot gửi luôn link/file mà không cần bấm nút.",
    notLink: "🤔 Mình chưa thấy link X/Twitter nào. Hãy gửi link dạng <code>https://x.com/user/status/123…</code>",
    notFound: "😕 Không lấy được bài viết này (có thể bị xoá, ẩn hoặc tài khoản riêng tư).",
    noMedia: "ℹ️ Bài viết này không có ảnh hay video.",
    working: "⏳ Đang xử lý…",
    photo: "Ảnh",
    video: "Video",
    allLinks: "Tất cả link",
    sendPhotos: "Tải ảnh",
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
    sIb: "☁️ imgbb…",
    ibTitle: "☁️ <b>Tải ảnh lên imgbb</b>",
    ibKey: "API key",
    ibNone: "chưa đặt",
    ibAlbum: "Album",
    ibNoAlbum: "Không dùng album",
    ibGuideKey: "Để bắt đầu, gửi <b>API key imgbb</b> (32 ký tự, lấy tại https://api.imgbb.com) vào chat này. Mình sẽ tự xoá tin nhắn chứa key.",
    ibGuideUse: "📸 Gửi ảnh vào đây — 1 ảnh hay nhiều ảnh cùng lúc đều được (ảnh thường hoặc dạng file) — mình sẽ tải lên và gửi link ngay.",
    ibGuideAlbum: "📁 Muốn tải vào album? Dán link <code>https://ibb.co/album/xxxxxx</code> (hoặc /album &lt;link|ID&gt;). ImgBB không cho bot tự liệt kê album, nên mỗi album chỉ cần thêm 1 lần rồi chọn bằng nút.",
    ibSetKey: "Đặt key",
    ibChangeKey: "Đổi key",
    ibDelKey: "Xoá key",
    ibAddAlbum: "Thêm album",
    ibAuto: "Tự tải ảnh gửi vào",
    ibAskKey: "🔑 Gửi API key imgbb của bạn (32 ký tự) vào chat này. Lấy tại https://api.imgbb.com",
    ibAskAlbum: "📁 Dán link album, ví dụ <code>https://ibb.co/album/xxxxxx</code> (hoặc gửi <code>/album ID</code>).",
    ibKeyOk: "✅ Key hợp lệ, đã lưu.",
    ibKeyDeleted: "Đã xoá tin nhắn chứa key.",
    ibKeyNotDeleted: "⚠️ Hãy tự xoá tin nhắn chứa key.",
    ibKeyBad: "❌ Key không hợp lệ hoặc imgbb từ chối:",
    ibPrivate: "🔒 Vì lý do bảo mật, hãy gửi key trong chat riêng với bot.",
    ibNeedKey: "🔑 Bạn chưa đặt API key imgbb. Dùng /imgbb để thiết lập.",
    ibAlbumBad: "⚠️ Không thấy link/ID album hợp lệ. Ví dụ: <code>https://ibb.co/album/xxxxxx</code>",
    ibAlbumAdded: "✅ Đã thêm và chọn album:",
    ibAlbumFull: "⚠️ Tối đa 20 album, hãy xoá bớt rồi thêm lại.",
    ibUploading: "⏳ Đang tải lên imgbb…",
    ibDone: "✅ Đã tải lên imgbb",
    ibFail: "❌ Tải lên imgbb thất bại",
    ibAlbumHint: "💡 Lỗi khi tải vào album? Kiểm tra album có thuộc tài khoản của key không, hoặc chọn “Không dùng album” trong /imgbb.",
  },
  en: {
    start:
      "👋 <b>Welcome!</b>\n\nSend me an <b>X (Twitter)</b> post link and I'll help you:\n🔗 Get <b>direct links</b> to original images — tap an image, get its link instantly\n🖼 Download high-quality photos\n🎬 Download videos / GIFs\n☁️ Upload photos to imgbb (/imgbb)\n\n⚙️ /settings to customize • ❓ /help for instructions",
    help:
      "📖 <b>How to use</b>\n\n1️⃣ Paste an X/Twitter post link (multiple links are fine)\n2️⃣ Tap a button:\n   • <b>🔗 Photo 1, Photo 2…</b> → instantly get that photo's direct link\n   • <b>🔗 All links</b> → links for every photo\n   • <b>📥 Download photos</b> → bot sends the files\n   • <b>☁️ imgbb</b> → upload the post's photos to imgbb\n   • <b>🎬 Video</b> → bot sends the video\n\n☁️ <b>Upload to imgbb</b>: /imgbb → set your API key, pick an album, then send photos to the chat (one or many) — the bot uploads them and replies with links.\n\n💡 Tip: /settings → enable <b>Auto</b> mode to skip the buttons.",
    notLink: "🤔 I couldn't find an X/Twitter link. Send something like <code>https://x.com/user/status/123…</code>",
    notFound: "😕 Couldn't fetch this post (deleted, hidden or from a private account).",
    noMedia: "ℹ️ This post has no photos or videos.",
    working: "⏳ Working…",
    photo: "Photo",
    video: "Video",
    allLinks: "All links",
    sendPhotos: "Download photos",
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
    sIb: "☁️ imgbb…",
    ibTitle: "☁️ <b>Upload to imgbb</b>",
    ibKey: "API key",
    ibNone: "not set",
    ibAlbum: "Album",
    ibNoAlbum: "No album",
    ibGuideKey: "To start, send your <b>imgbb API key</b> (32 characters, get it at https://api.imgbb.com) in this chat. I'll delete the message containing it.",
    ibGuideUse: "📸 Send photos here — one or many at once (as photos or files) — and I'll upload them and reply with links.",
    ibGuideAlbum: "📁 Want an album? Paste <code>https://ibb.co/album/xxxxxx</code> (or /album &lt;link|ID&gt;). ImgBB doesn't let bots list albums, so add each album once, then pick it with the buttons.",
    ibSetKey: "Set key",
    ibChangeKey: "Change key",
    ibDelKey: "Delete key",
    ibAddAlbum: "Add album",
    ibAuto: "Auto-upload photos I send",
    ibAskKey: "🔑 Send your imgbb API key (32 characters) in this chat. Get it at https://api.imgbb.com",
    ibAskAlbum: "📁 Paste an album link, e.g. <code>https://ibb.co/album/xxxxxx</code> (or send <code>/album ID</code>).",
    ibKeyOk: "✅ Key is valid and saved.",
    ibKeyDeleted: "The message with the key was deleted.",
    ibKeyNotDeleted: "⚠️ Please delete the message containing the key yourself.",
    ibKeyBad: "❌ Invalid key or imgbb refused it:",
    ibPrivate: "🔒 For security, send the key in a private chat with the bot.",
    ibNeedKey: "🔑 You haven't set an imgbb API key. Use /imgbb to set it up.",
    ibAlbumBad: "⚠️ No valid album link/ID found. Example: <code>https://ibb.co/album/xxxxxx</code>",
    ibAlbumAdded: "✅ Album added and selected:",
    ibAlbumFull: "⚠️ Max 20 albums — remove one first.",
    ibUploading: "⏳ Uploading to imgbb…",
    ibDone: "✅ Uploaded to imgbb",
    ibFail: "❌ imgbb upload failed",
    ibAlbumHint: "💡 Album upload failing? Check the album belongs to the key's account, or choose “No album” in /imgbb.",
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
      imgbbKey: "",
      albums: [],
      album: "",
      imgbbAuto: true,
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
    const args = text.replace(/^\/\w+(?:@\w+)?\s*/, "").trim();
    switch (cmd[1].toLowerCase()) {
      case "start": return send(c, L.start);
      case "help": return send(c, L.help);
      case "settings": return showSettings(c);
      case "stats": return showStats(c);
      case "imgbb": return cmdImgbb(c, msg, args);
      case "album": return args ? addAlbums(c, args) : showImgbb(c);
      default: return;
    }
  }

  // Key imgbb (32 ký tự) hoặc link album gửi thẳng vào chat riêng
  if (isPrivate) {
    const raw = (msg.text || "").trim();
    if (KEY_STRICT.test(raw)) return setKey(c, msg, raw);
    if (/ibb\.co\/album\//i.test(text)) return addAlbums(c, text);
  }

  // Tìm link
  const ids = await extractIds(text, cf.maxLinks);
  if (!ids.length) {
    const img = incomingImage(msg);
    if (img) {
      if (isPrivate) await uploadIncoming(c, msg, img);
      return;
    }
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

function keyboard(c, id, m) {
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
    rows.push([
      { text: `📥 ${L.sendPhotos}`, callback_data: `pf:${id}` },
      { text: "☁️ imgbb", callback_data: `ub:${id}` },
    ]);
  }
  m.videos.forEach((v, i) => {
    const q = v.height ? ` ${v.height}p` : "";
    rows.push([{ text: `🎬 ${v.type === "gif" ? "GIF" : L.video} ${i + 1}${q}`, callback_data: `vs:${id}:${i}` }]);
  });
  return rows;
}

async function handleTweet(c, id) {
  const t = await getTweet(id);
  if (!t) return send(c, c.L.notFound);
  const m = getMedia(t);
  if (!m.photos.length && !m.videos.length) return send(c, c.L.noMedia);

  await bump(c.env, c.cf, "requests");
  await send(c, previewText(c, t, m), { reply_markup: { inline_keyboard: keyboard(c, id, m) } });

  if (c.user.auto === "files") {
    if (m.photos.length) await sendPhotos(c, t, m.photos);
    for (let i = 0; i < m.videos.length; i++) await sendVideo(c, t, m.videos[i]);
  } else if (c.user.auto === "links") {
    await sendLinks(c, linesFor(c, m, { photos: "all" }));
  }
}

/* ───────────────────────── Gửi link / file ───────────────────────── */
function linesFor(c, m, { photos }) {
  const out = [];
  const L = c.L;
  const pick = (arr, sel) => (sel === "all" ? arr.map((x, i) => [x, i]) : typeof sel === "number" && arr[sel] ? [[arr[sel], sel]] : []);
  for (const [p, i] of pick(m.photos, photos)) out.push(`🖼 ${L.photo} ${i + 1}\n${p.url}`);
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
  if (data.startsWith("ib:")) return onImgbb(c, cq, data);

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
    case "ub": return uploadTweetPhotos(c, m.photos);
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
    [{ text: L.sIb, callback_data: "ib:menu" }],
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

/* ───────────────────────── imgbb ───────────────────────── */
const KEY_STRICT = /^[a-f0-9]{32}$/i;
const KEY_LOOSE = /^[A-Za-z0-9]{24,64}$/;
const ALBUM_RE = /ibb\.co\/album\/([A-Za-z0-9]{4,12})/gi;
const TINY_GIF = "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  bmp: "image/bmp", heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff", avif: "image/avif",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mask = (k) => (k.length > 8 ? `${k.slice(0, 4)}…${k.slice(-4)}` : "••••");
const short = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

/* ── gọi imgbb ── */
async function imgbbPost(endpoint, fd) {
  let err = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(endpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } });
      const j = await r.json().catch(() => null);
      const d = j && (j.data || j.image);
      if (r.ok && d && (d.url || d.display_url)) {
        return { ok: true, url: d.url || d.display_url, viewer: d.url_viewer || "" };
      }
      const e = j && j.error;
      err = (typeof e === "string" ? e : e && e.message) || `HTTP ${r.status}`;
      if (r.status < 500 && r.status !== 429) return { ok: false, error: err };
    } catch (e) {
      err = String(e);
    }
    await sleep(800);
  }
  return { ok: false, error: err };
}

// Kiểm tra key bằng 1 ảnh 1x1 tự xoá sau 60 giây
function imgbbValidate(key) {
  const fd = new FormData();
  fd.append("key", key);
  fd.append("image", TINY_GIF);
  fd.append("expiration", "60");
  return imgbbPost("https://api.imgbb.com/1/upload", fd);
}

async function fetchBlob(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return await r.blob();
  } catch {
    return null;
  }
}

// src: { url } hoặc { blob, name }
async function imgbbUpload(user, src) {
  const name = src.name || "image.jpg";
  if (user.album) {
    // Upload vào album: API chính thức KHÔNG hỗ trợ → dùng endpoint web ibb.co/json (không chính thức)
    const blob = src.blob || (await fetchBlob(src.url));
    if (!blob) return { ok: false, error: "download failed" };
    const fd = new FormData();
    fd.append("action", "upload");
    fd.append("type", "file");
    fd.append("album_id", user.album);
    fd.append("auth_token", user.imgbbKey);
    fd.append("source", blob, name);
    return imgbbPost("https://ibb.co/json", fd);
  }
  // Không album: API chính thức
  const fd = new FormData();
  fd.append("key", user.imgbbKey);
  if (src.blob) fd.append("image", src.blob, name);
  else fd.append("image", src.url);
  const res = await imgbbPost("https://api.imgbb.com/1/upload", fd);
  if (!res.ok && src.url && !src.blob && !/key/i.test(res.error)) {
    const blob = await fetchBlob(src.url);
    if (blob) {
      const fd2 = new FormData();
      fd2.append("key", user.imgbbKey);
      fd2.append("image", blob, name);
      return imgbbPost("https://api.imgbb.com/1/upload", fd2);
    }
  }
  return res;
}

/* ── Ảnh người dùng gửi vào chat ── */
function incomingImage(msg) {
  if (msg.photo && msg.photo.length) return { id: msg.photo[msg.photo.length - 1].file_id, name: "" };
  const d = msg.document;
  if (d && (d.mime_type || "").startsWith("image/")) return { id: d.file_id, name: d.file_name || "" };
  return null;
}

async function tgFileBlob(env, fileId) {
  const r = await tg(env, "getFile", { file_id: fileId });
  if (!r.ok || !r.result || !r.result.file_path) return { error: r.description || "getFile failed" };
  const path = r.result.file_path;
  try {
    const f = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${path}`);
    if (!f.ok) return { error: `download HTTP ${f.status}` };
    const buf = await f.arrayBuffer();
    const name = path.split("/").pop() || "image.jpg";
    let mime = f.headers.get("content-type") || "";
    if (!mime.startsWith("image/")) mime = MIME[(name.split(".").pop() || "").toLowerCase()] || "image/jpeg";
    return { blob: new Blob([buf], { type: mime }), name };
  } catch (e) {
    return { error: String(e) };
  }
}

const albumTag = (c) => {
  const a = (c.user.albums || []).find((x) => x.id === c.user.album);
  return c.user.album ? ` • 📁 ${esc(a ? a.name : c.user.album)}` : "";
};

// Mỗi ảnh gửi vào = 1 lần xử lý riêng → gửi 1 ảnh hay cả album ảnh đều chạy song song, không cần hàng đợi
async function uploadIncoming(c, msg, img) {
  const { L, user, env } = c;
  if (!user.imgbbKey) {
    if (!msg.media_group_id) await send(c, L.ibNeedKey);
    return;
  }
  if (!user.imgbbAuto) return;
  await tg(env, "sendChatAction", { ...base(c), action: "upload_photo" });
  const f = await tgFileBlob(env, img.id);
  if (f.error) return send(c, `${L.ibFail}\n<code>${esc(short(f.error, 200))}</code>`);
  const res = await imgbbUpload(user, { blob: f.blob, name: img.name || f.name });
  await bump(env, c.cf, "uploads");
  if (res.ok) return send(c, `${L.ibDone}${albumTag(c)}\n${res.url}`);
  return send(c, `${L.ibFail}\n<code>${esc(short(res.error, 200))}</code>${user.album ? `\n\n${L.ibAlbumHint}` : ""}`);
}

// Nút ☁️ imgbb dưới bài viết: tải toàn bộ ảnh của bài lên imgbb
async function uploadTweetPhotos(c, photos) {
  const { L, user, env } = c;
  if (!user.imgbbKey) return send(c, L.ibNeedKey);
  if (!photos.length) return;
  const st = await send(c, `${L.ibUploading} (${photos.length})`);
  const res = await pool(photos, 3, (p) => imgbbUpload(user, { url: p.url, name: "x.jpg" }));
  await bump(env, c.cf, "uploads");
  const ok = res.filter((r) => r.ok).length;
  const lines = res.map((r, i) => (r.ok ? `🖼 ${i + 1} ✅\n${r.url}` : `🖼 ${i + 1} ❌ ${esc(short(r.error, 80))}`));
  let text = `${ok ? "✅" : "❌"} imgbb ${ok}/${photos.length}${albumTag(c)}\n\n${lines.join("\n\n")}`;
  if (ok < photos.length && user.album) text += `\n\n${L.ibAlbumHint}`;
  const mid = st && st.ok && st.result && st.result.message_id;
  if (mid) {
    const e = await tg(env, "editMessageText", {
      chat_id: c.chatId,
      message_id: mid,
      text,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
    if (e.ok) return;
  }
  return send(c, text);
}

/* ── Key & album ── */
async function cmdImgbb(c, msg, args) {
  const tok = args.split(/\s+/)[0];
  if (tok && KEY_LOOSE.test(tok)) return setKey(c, msg, tok);
  return showImgbb(c);
}

async function setKey(c, msg, key) {
  const { L, env } = c;
  const del = tg(env, "deleteMessage", { chat_id: c.chatId, message_id: msg.message_id });
  if (msg.chat.type !== "private") {
    await del;
    return send(c, L.ibPrivate);
  }
  if (!env.KV) {
    await del;
    return send(c, L.noKV);
  }
  const v = await imgbbValidate(key);
  const deleted = (await del).ok;
  if (!v.ok) return send(c, `${L.ibKeyBad}\n<code>${esc(short(v.error, 200))}</code>`);
  // Đổi sang key khác (có thể là tài khoản khác) → album cũ không còn dùng được
  if (c.user.imgbbKey && c.user.imgbbKey !== key) {
    c.user.albums = [];
    c.user.album = "";
  }
  c.user.imgbbKey = key;
  await saveUser(env, c.userId, c.user);
  return showImgbb(c, `${L.ibKeyOk} ${deleted ? L.ibKeyDeleted : L.ibKeyNotDeleted}`);
}

function decodeEnt(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

// Đọc tên album từ trang công khai (album riêng tư sẽ không đọc được → dùng ID)
async function fetchAlbumName(id) {
  try {
    const r = await fetch(`https://ibb.co/album/${id}`, { headers: { "User-Agent": "Mozilla/5.0 XDownloaderBot" } });
    if (!r.ok) return "";
    const h = await r.text();
    const m =
      h.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      h.match(/<title>([^<]+)<\/title>/i);
    return m ? decodeEnt(m[1]).replace(/\s*[-–|]\s*(ImgBB|ibb\.co).*$/i, "").trim() : "";
  } catch {
    return "";
  }
}

async function addAlbums(c, text) {
  const { L, env } = c;
  if (!env.KV) return send(c, L.noKV);
  let ids = [...new Set([...text.matchAll(ALBUM_RE)].map((m) => m[1]))];
  if (!ids.length) {
    const bare = text.trim().match(/^[A-Za-z0-9]{4,12}$/);
    if (bare) ids = [bare[0]];
  }
  if (!ids.length) return send(c, L.ibAlbumBad);
  ids = ids.slice(0, 5);

  const list = [...(c.user.albums || [])];
  const fresh = ids.filter((id) => !list.some((a) => a.id === id));
  if (list.length + fresh.length > 20) return send(c, L.ibAlbumFull);

  const names = await pool(fresh, 3, (id) => fetchAlbumName(id));
  fresh.forEach((id, i) => list.push({ id, name: short(names[i] || `Album ${id}`, 40) }));
  c.user.albums = list;
  c.user.album = ids[ids.length - 1];
  await saveUser(env, c.userId, c.user);
  const cur = list.find((a) => a.id === c.user.album);
  return showImgbb(c, `${L.ibAlbumAdded} <b>${esc(cur ? cur.name : c.user.album)}</b>`);
}

/* ── Menu /imgbb ── */
function imgbbMenu(c, note) {
  const u = c.user, L = c.L;
  const albums = u.albums || [];
  const cur = albums.find((a) => a.id === u.album);
  let text = `${L.ibTitle}\n\n`;
  if (note) text += `${note}\n\n`;
  text += `🔑 ${L.ibKey}: ${u.imgbbKey ? `<code>${esc(mask(u.imgbbKey))}</code>` : L.ibNone}\n`;
  text += `📁 ${L.ibAlbum}: <b>${esc(cur ? cur.name : L.ibNoAlbum)}</b>\n\n`;
  if (!u.imgbbKey) text += L.ibGuideKey;
  else {
    text += L.ibGuideUse;
    if (!albums.length) text += `\n\n${L.ibGuideAlbum}`;
  }
  if (!c.env.KV) text += `\n\n${L.noKV}`;

  const mark = (on, label) => (on ? `✅ ${label}` : label);
  const kb = [];
  if (u.imgbbKey) {
    kb.push([{ text: mark(!u.album, `📂 ${L.ibNoAlbum}`), callback_data: "ib:set:-" }]);
    for (const a of albums) {
      kb.push([
        { text: mark(a.id === u.album, `📁 ${short(a.name, 28)}`), callback_data: `ib:set:${a.id}` },
        { text: "🗑", callback_data: `ib:rm:${a.id}` },
      ]);
    }
    kb.push([{ text: `➕ ${L.ibAddAlbum}`, callback_data: "ib:add" }]);
    kb.push([{ text: `☁️ ${L.ibAuto}: ${u.imgbbAuto ? L.on : L.off}`, callback_data: "ib:auto" }]);
  }
  const keyRow = [{ text: `🔑 ${u.imgbbKey ? L.ibChangeKey : L.ibSetKey}`, callback_data: "ib:key" }];
  if (u.imgbbKey) keyRow.push({ text: `🗑 ${L.ibDelKey}`, callback_data: "ib:delkey" });
  kb.push(keyRow);
  return { text, kb };
}

function showImgbb(c, note) {
  const m = imgbbMenu(c, note);
  return send(c, m.text, { reply_markup: { inline_keyboard: m.kb } });
}

async function onImgbb(c, cq, data) {
  const [, act, arg] = data.split(":");
  const ans = (text, alert) =>
    tg(c.env, "answerCallbackQuery", { callback_query_id: cq.id, ...(text ? { text } : {}), ...(alert ? { show_alert: true } : {}) });
  if (!c.env.KV) return ans(c.L.noKV, true);
  const u = c.user;
  let changed = true;
  switch (act) {
    case "menu": changed = false; break;
    case "key": await ans(); return send(c, c.L.ibAskKey);
    case "add": await ans(); return send(c, c.L.ibAskAlbum);
    case "delkey": u.imgbbKey = ""; u.album = ""; break;
    case "auto": u.imgbbAuto = !u.imgbbAuto; break;
    case "set":
      if (arg === "-") u.album = "";
      else if ((u.albums || []).some((a) => a.id === arg)) u.album = arg;
      break;
    case "rm":
      u.albums = (u.albums || []).filter((a) => a.id !== arg);
      if (u.album === arg) u.album = "";
      break;
    default: return ans();
  }
  if (changed) await saveUser(c.env, c.userId, u);
  await ans(changed ? c.L.saved : undefined);
  const m = imgbbMenu(c);
  return tg(c.env, "editMessageText", {
    chat_id: c.chatId,
    message_id: c.msg.message_id,
    text: m.text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: m.kb },
  });
}

/* ───────────────────────── Admin ───────────────────────── */
async function showStats(c) {
  if (!c.cf.admins.includes(String(c.userId))) return;
  if (!c.cf.enableStats || !c.env.KV) return send(c, "ℹ️ Stats: set ENABLE_STATS=\"true\" và gắn KV.");
  const r = (await c.env.KV.get("stat:requests")) || "0";
  const d = (await c.env.KV.get("stat:downloads")) || "0";
  const up = (await c.env.KV.get("stat:uploads")) || "0";
  return send(c, `📊 <b>Stats</b>\nLink đã xử lý: <b>${r}</b>\nLần tải: <b>${d}</b>\nẢnh lên imgbb: <b>${up}</b>`);
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
    { command: "imgbb", description: lang === "vi" ? "Tải ảnh lên imgbb" : "Upload to imgbb" },
    { command: "settings", description: lang === "vi" ? "Cài đặt" : "Settings" },
  ];
  await tg(env, "setMyCommands", { commands: cmds("vi") });
  await tg(env, "setMyCommands", { commands: cmds("en"), language_code: "en" });
  return new Response(JSON.stringify({ webhook: hook }, null, 2), { headers: { "content-type": "application/json" } });
}
