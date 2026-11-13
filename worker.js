/**
 * X (Twitter) + TikTok Downloader Bot — Cloudflare Worker
 * ------------------------------------------------
 * • Gửi link X/Twitter hoặc TikTok → bot gửi NGAY ảnh / video (không nút bấm, không khung xem trước)
 * • Muốn lấy link gốc: reply vào ảnh/video bot vừa gửi bằng tin nhắn bất kỳ → bot gửi link của đúng ảnh/video đó
 * • Video X: tự chọn bản độ phân giải cao nhất; TikTok: không logo (HD nếu có), slideshow gửi dạng ảnh
 * • Không cần KV
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
// Link "trang bài viết" (khác với link file ảnh/video được giấu trong caption)
const PAGE_RE = /^https?:\/\/(?:www\.|mobile\.|m\.)?(?:x\.com|twitter\.com|tiktok\.com)\//i;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TG_UPLOAD_MAX = 49 * 1024 * 1024; // bot upload tối đa 50MB (gửi bằng link chỉ 20MB)
const ZW = "\u200b"; // ký tự vô hình để giấu link trong caption

/* ───────────────────────── Nội dung (tiếng Việt) ───────────────────────── */
const L = {
  start:
    "👋 Gửi link <b>X (Twitter)</b> hoặc <b>TikTok</b>, mình gửi ảnh/video về ngay.\n\n💡 Muốn lấy <b>link gốc</b> của ảnh/video: <b>reply</b> vào đó bằng một tin nhắn bất kỳ.\n\n❓ /help để xem hướng dẫn chi tiết",
  help:
    "📖 <b>Hướng dẫn sử dụng</b>\n\n" +
    "<b>1️⃣ Tải ảnh / video</b>\n" +
    "Dán link bài viết X/Twitter hoặc video TikTok vào chat (dán nhiều link một lúc cũng được). Bot gửi ngay ảnh và video, không cần bấm gì.\n\n" +
    "<b>2️⃣ Lấy link ảnh / video gốc</b>\n" +
    "Reply (trả lời) vào ảnh hoặc video bot vừa gửi bằng một tin nhắn bất kỳ, ví dụ <code>link</code>. Bot sẽ gửi link chất lượng gốc của đúng ảnh/video đó. Bài có nhiều ảnh thì reply vào ảnh nào nhận link ảnh đó.\n\n" +
    "<b>3️⃣ Lưu ý</b>\n" +
    "• Video X: bot tự chọn bản nét nhất có thể (nếu người đăng chỉ up 720p thì chỉ có 720p).\n" +
    "• TikTok: video không logo (HD nếu có); bài slideshow được gửi dạng ảnh.\n" +
    "• Video nặng hơn 50MB bot không gửi được file, sẽ gửi link để bạn tự tải.\n" +
    "• Bài riêng tư, đã xoá hoặc bị ẩn thì không tải được.",
  notLink: "🤔 Mình chưa thấy link X/Twitter hay TikTok nào. Gõ /help để xem hướng dẫn.",
  notFound: "😕 Không lấy được bài viết này (có thể đã xoá, bị ẩn hoặc tài khoản riêng tư).",
  noMedia: "ℹ️ Bài viết này không có ảnh hay video.",
  sendFail: "⚠️ Telegram không nhận được file (có thể quá nặng, giới hạn 50MB). Đây là link:",
  denied: "⛔ Bạn không có quyền dùng bot này.",
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
    quality: ["best", "medium", "low"].includes(env.DEFAULT_QUALITY) ? env.DEFAULT_QUALITY : "best",
    photoAs: env.DEFAULT_PHOTO_AS === "document" ? "document" : "photo",
    caption: env.DEFAULT_CAPTION !== "false",
  };
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

/* ── Caption: link bài viết (hiện) + link file gốc (giấu) ── */
// Link file gốc được giấu trong caption dưới dạng ký tự vô hình. Khi bạn reply vào ảnh/video đó,
// bot đọc lại link này từ tin nhắn được reply — nên không cần database.
const hid = (u) => `<a href="${esc(u).replace(/"/g, "%22")}">${ZW}</a>`;
const capLine = (c, t) => (c.cf.caption ? `${t.platform === "tt" ? "🎵" : "🐦"} <a href="${esc(t.url || "")}">@${esc(t.author?.screen_name || "")}</a>` : "");
const capFor = (c, t, mediaUrl, visible) => (visible ? capLine(c, t) : "") + hid(mediaUrl);

// Lấy link file gốc từ tin nhắn mà người dùng reply tới (chỉ tin của bot)
function replyMediaUrl(msg) {
  const r = msg.reply_to_message;
  if (!r || !r.from || !r.from.is_bot) return null;
  const e = (r.caption_entities || r.entities || []).find((x) => x.type === "text_link" && x.url && !PAGE_RE.test(x.url));
  return e ? e.url : null;
}

/* ───────────────────────── Router ───────────────────────── */
async function handleUpdate(update, env) {
  if (update.message) return onMessage(env, update.message);
}

async function onMessage(env, msg) {
  const cf = cfg(env);
  const from = msg.from;
  if (!from || from.is_bot) return;

  const isPrivate = msg.chat.type === "private";
  const c = {
    env, cf,
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
      default: return;
    }
  }

  // Tìm link bài viết
  const items = await extractItems(text, cf.maxLinks);
  if (!items.length) {
    // Không có link → có thể là reply vào ảnh/video của bot để xin link gốc
    const u = replyMediaUrl(msg);
    if (u) return send(c, u);
    if (isPrivate) await send(c, L.notLink);
    return;
  }

  await tg(env, "sendChatAction", { ...base(c), action: "upload_photo" });
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
  const orig = u;
  for (let i = 0; i < 4; i++) {
    const m = u.match(TT_ID_RE);
    if (m) return { id: m[1], url: u };
    u = await resolveRedirect(u);
    if (!u) break;
  }
  return { id: null, url: orig }; // tikwm sẽ tự giải link rút gọn
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
      if (r && !out.some((o) => o.k === "tt" && (r.id ? o.id === r.id : o.url === r.url))) out.push({ k: "tt", ...r });
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
    author: { name: a.nickname || uid, screen_name: uid },
  };
  const m = {
    photos: imgs.map((url) => ({ url })),
    videos:
      !imgs.length && variants.length
        ? [{ type: "video", url: variants[0].url, variants, duration: d.duration || undefined }]
        : [],
  };
  return { t, m };
}

async function getTikTok(id, url) {
  const cache = caches.default;
  if (id) {
    const hit = await cache.match(new Request(`https://cache.local/tt/${id}`));
    if (hit) return hit.json();
  }
  const d = await ttFetch(url || `https://www.tiktok.com/@tiktok/video/${id}`);
  if (!d) return null;
  const post = normTikTok(d);
  await cache.put(
    new Request(`https://cache.local/tt/${post.t.id}`),
    new Response(JSON.stringify(post), { headers: { "content-type": "application/json", "Cache-Control": "max-age=1800" } })
  );
  return post;
}

/* ───────────────────────── Xử lý 1 link ───────────────────────── */
async function loadItem(it) {
  if (it.k === "tt") return getTikTok(it.id, it.url);
  const t = await getTweet(it.id);
  if (!t) return null;
  const m = getMedia(t);
  await enrichVideos(m, it.id);
  return { t, m };
}

async function handleItem(c, it) {
  const p = await loadItem(it);
  if (!p) return send(c, L.notFound);
  const { t, m } = p;
  if (!m.photos.length && !m.videos.length) return send(c, L.noMedia);

  if (m.photos.length) await sendPhotos(c, t, m.photos);
  for (let i = 0; i < m.videos.length; i++) await sendVideo(c, t, m.videos[i], !m.photos.length && i === 0);
}

/* ───────────────────────── Gửi ảnh / video ───────────────────────── */
async function sendLinks(c, urls) {
  let buf = "";
  for (const u of urls) {
    if ((buf + u).length > 3800) {
      await send(c, buf);
      buf = "";
    }
    buf += (buf ? "\n\n" : "") + u;
  }
  if (buf) await send(c, buf);
}

async function sendPhotos(c, t, photos) {
  const asDoc = c.cf.photoAs === "document";
  const type = asDoc ? "document" : "photo";
  for (let i = 0; i < photos.length; i += 10) {
    const chunk = photos.slice(i, i + 10);
    // Mỗi ảnh mang link gốc của chính nó (giấu trong caption); chỉ ảnh đầu tiên hiện tên tác giả
    const capOf = (p, k) => capFor(c, t, p.url, i === 0 && k === 0);
    let res;
    if (chunk.length === 1) {
      res = await tg(c.env, asDoc ? "sendDocument" : "sendPhoto", {
        ...base(c),
        [type]: chunk[0].url,
        caption: capOf(chunk[0], 0),
        parse_mode: "HTML",
      });
    } else {
      res = await tg(c.env, "sendMediaGroup", {
        ...base(c),
        media: chunk.map((p, k) => ({ type, media: p.url, caption: capOf(p, k), parse_mode: "HTML" })),
      });
    }
    if (!res.ok) {
      await send(c, L.sendFail);
      await sendLinks(c, chunk.map((p) => p.url));
    }
  }
}

async function sendVideo(c, t, v, showCap) {
  const urls = videoUrls(v, c.cf.quality).slice(0, 3);
  if (!urls.length) return send(c, L.sendFail);
  const gif = v.type === "gif";
  const method = gif ? "sendAnimation" : "sendVideo";
  const field = gif ? "animation" : "video";
  const fields = {
    ...base(c),
    // Link giấu luôn là bản chất lượng cao nhất theo cài đặt, kể cả khi phải gửi bản thấp hơn
    caption: capFor(c, t, urls[0], showCap),
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
  if (!res.ok) await send(c, `${L.sendFail}\n${urls[0]}`);
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
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  await tg(env, "setMyCommands", {
    commands: [
      { command: "start", description: "Bắt đầu" },
      { command: "help", description: "Hướng dẫn sử dụng" },
    ],
  });
  return new Response(JSON.stringify({ webhook: hook }, null, 2), { headers: { "content-type": "application/json" } });
}
