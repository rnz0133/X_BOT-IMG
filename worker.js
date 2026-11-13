/**
 * X (Twitter) + TikTok Downloader Bot — Cloudflare Worker
 * ------------------------------------------------
 * • Gửi link X/Twitter hoặc TikTok → bot gửi NGAY ảnh / video (không nút bấm, không khung xem trước)
 * • Muốn lấy link gốc: reply vào ảnh/video bot vừa gửi bằng tin nhắn bất kỳ → bot gửi link của đúng ảnh/video đó
 * • Video X: tự chọn bản độ phân giải cao nhất; TikTok: không logo (HD nếu có), slideshow gửi dạng ảnh
 * • Không cần KV
 *
 * Cấu hình: xem wrangler.toml  |  Secrets: BOT_TOKEN, WEBHOOK_SECRET
 * Nguồn dữ liệu: api.fxtwitter.com + cdn.syndication.twimg.com (X), trực tiếp từ trang TikTok (không dùng API bên thứ 3)
 */

const FX_API = "https://api.fxtwitter.com";
const LINK_RE =
  /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com|fxtwitter\.com|fixupx\.com|vxtwitter\.com|fixvx\.com|t\.co)\/[^\s<>"']+/gi;
const TT_RE = /https?:\/\/(?:(?:www|m|vm|vt)\.)?tiktok\.com\/[^\s<>"']+/gi;
const IG_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+[^\s<>"']*/gi;
const ANY_RE = new RegExp(`${LINK_RE.source}|${TT_RE.source}|${IG_RE.source}`, "gi");
const STATUS_RE = /\/status(?:es)?\/(\d{5,25})/i;
const TT_ID_RE = /\/(?:video|photo)\/(\d{8,25})/i;
const IG_ID_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i;
// Link "trang bài viết" (khác với link file ảnh/video được giấu trong caption)
const PAGE_RE = /^https?:\/\/(?:www\.|mobile\.|m\.)?(?:x\.com|twitter\.com|tiktok\.com|instagram\.com)\//i;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TG_UPLOAD_MAX = 49 * 1024 * 1024; // bot upload tối đa 50MB (gửi bằng link chỉ 20MB)
const ZW = "\u200b"; // ký tự vô hình để giấu link trong caption

/* ───────────────────────── Nội dung (tiếng Việt) ───────────────────────── */
const L = {
  start:
    "👋 Gửi link <b>X</b>, <b>TikTok</b> hoặc <b>Instagram</b>, mình gửi ảnh/video về ngay.\n\n💡 Muốn lấy <b>link gốc</b>: reply vào ảnh/video bot vừa gửi.\n\n❓ /help để xem hướng dẫn chi tiết",
  help:
    "📖 <b>Hướng dẫn sử dụng</b>\n\n" +
    "<b>1️⃣ Tải ảnh / video</b>\n" +
    "Dán link X/Twitter, TikTok hoặc Instagram vào chat (dán nhiều link một lúc cũng được). Bot gửi ngay ảnh và video, không cần bấm gì.\n\n" +
    "<b>2️⃣ Lấy link ảnh / video gốc</b>\n" +
    "Reply (trả lời) vào ảnh hoặc video bot vừa gửi bằng một tin nhắn bất kỳ, ví dụ <code>link</code>. Bot sẽ gửi link chất lượng gốc. Bài nhiều ảnh được gửi gộp thành album: reply vào album đó, bot gửi danh sách link đánh số 1, 2, 3… theo thứ tự ảnh.\n\n" +
    "<b>3️⃣ Lưu ý</b>\n" +
    "• Video X: bot tự chọn bản nét nhất có thể (nếu người đăng chỉ up 720p thì chỉ có 720p).\n" +
    "• TikTok: video không logo (HD nếu có); bài slideshow được gửi dạng ảnh.\n" +
    "• Video nặng hơn 50MB bot không gửi được file, sẽ gửi link để bạn tự tải.\n" +
    "• Bài riêng tư, đã xoá hoặc bị ẩn thì không tải được.",
  notLink: "🤔 Mình chưa thấy link X, TikTok hoặc Instagram nào. Gõ /help để xem hướng dẫn.",
  notFound: "⚠️ Không tải được nội dung này.",
  noMedia: "ℹ️ Bài viết này không có ảnh hay video.",
  sendFail: "⚠️ Không gửi được file này.",
  denied: "⛔ Bạn không có quyền dùng bot này.",
  processing: "⏳ Đang xử lý…",
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
    deleteX: env.DELETE_X_LINK !== "false", // xoá tin nhắn chứa link X sau khi gửi xong (đặt "false" để tắt)
  };
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

// Tải file về Worker rồi upload thẳng lên Telegram (dùng khi gửi bằng link bị từ chối: file > 20MB, link cần header…)
async function tgUpload(env, method, field, url, fields, filename, mime, headers) {
  try {
    const r = await fetch(url, { headers: headers || { "User-Agent": UA } });
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

// Gửi album bằng cách tải ảnh về Worker rồi upload (dùng khi CDN cần cookie, hoặc Telegram không tự tải được)
async function tgUploadGroup(env, chunk, type, fields, caption) {
  try {
    const bufs = await Promise.all(
      chunk.map(async (p) => {
        const r = await fetch(p.url, { headers: p.headers || { "User-Agent": UA } });
        if (!r.ok) throw new Error(`download HTTP ${r.status}`);
        return r.arrayBuffer();
      })
    );
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v));
    fd.append("media", JSON.stringify(chunk.map((p, k) => ({
      type, media: `attach://f${k}`, ...(k === 0 ? { caption, parse_mode: "HTML" } : {}),
    }))));
    bufs.forEach((b, k) => fd.append(`f${k}`, new Blob([b], { type: "image/jpeg" }), `photo${k}.jpg`));
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMediaGroup`, { method: "POST", body: fd });
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
const hidAll = (urls) => urls.map(hid).join("");

// Lưu danh sách link của 1 album theo media_group_id (vì Telegram chỉ giữ caption ở ảnh đầu album).
// Nếu bạn gắn KV namespace tên LINKS thì dùng KV (bền hơn); không thì dùng Cache API.
async function putLinks(env, key, urls) {
  const v = JSON.stringify(urls);
  try {
    if (env.LINKS) await env.LINKS.put(key, v, { expirationTtl: 60 * 60 * 24 * 30 });
    else await caches.default.put(new Request(`https://cache.local/lk/${key}`), new Response(v, { headers: { "Cache-Control": "max-age=2592000" } }));
  } catch {}
}
async function getLinks(env, key) {
  try {
    if (env.LINKS) return JSON.parse((await env.LINKS.get(key)) || "null");
    const hit = await caches.default.match(new Request(`https://cache.local/lk/${key}`));
    return hit ? await hit.json() : null;
  } catch {
    return null;
  }
}

// Lấy các link file gốc từ tin nhắn mà người dùng reply tới (chỉ tin của bot)
async function replyMediaUrls(env, msg) {
  const r = msg.reply_to_message;
  if (!r || !r.from || !r.from.is_bot) return [];
  const own = (r.caption_entities || r.entities || [])
    .filter((x) => x.type === "text_link" && x.url && !PAGE_RE.test(x.url))
    .map((x) => x.url);
  if (own.length) return own;
  if (r.media_group_id) return (await getLinks(env, `${msg.chat.id}:${r.media_group_id}`)) || [];
  return [];
}

// 1 link → gửi nguyên link; nhiều link → danh sách đánh số gọn gàng
function formatLinks(urls) {
  if (urls.length === 1) return urls[0];
  return urls
    .map((u, i) => `<b>${i + 1}:</b> <a href="${esc(u).replace(/"/g, "%22")}">${/\.mp4|video/i.test(u) ? "Video" : "Ảnh"} ${i + 1}</a>`)
    .join("\n");
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
    const urls = await replyMediaUrls(env, msg);
    if (urls.length) return send(c, formatLinks(urls));
    if (isPrivate) await send(c, L.notLink);
    return;
  }

  await tg(env, "sendChatAction", { ...base(c), action: "upload_photo" });
  const st = await send(c, L.processing);
  const results = [];
  try {
    for (const it of items) results.push(await handleItem(c, it));
  } finally {
    if (st && st.ok) await tg(env, "deleteMessage", { chat_id: c.chatId, message_id: st.result.message_id });
  }
  // Chỉ xoá tin nhắn của người dùng khi: toàn link X/TikTok, gửi thành công hết,
  // và tin nhắn không có chữ nào khác ngoài link.
  const raw = msg.text || msg.caption || "";
  if (cf.deleteX && items.every((i) => i.k === "x" || i.k === "tt" || i.k === "ig") && results.every(Boolean) && !raw.replace(ANY_RE, "").trim()) {
    await tg(env, "deleteMessage", { chat_id: c.chatId, message_id: msg.message_id });
  }
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

// Telegram/caption thường làm URL dính dấu chấm hoặc dấu ngoặc ở cuối câu.
function cleanUrl(u) {
  return String(u || "").replace(/[),.;!?]+$/g, "");
}

// Link TikTok rút gọn (vm./vt./tiktok.com/t/…) → theo redirect để lấy ID video
async function resolveTikTok(u) {
  const orig = u;
  for (let i = 0; i < 4; i++) {
    const m = u.match(TT_ID_RE);
    if (m) {
      // TikTok hiện thường không nhúng webapp.video-detail ở URL /photo/.
      // Cùng item đó nhưng mở qua /video/ thì vẫn trả đầy đủ imagePost.
      const page = u.replace(/\/photo\/(\d+)/i, "/video/$1");
      return { id: m[1], url: page };
    }
    u = await resolveRedirect(u);
    if (!u) break;
  }
  return { id: null, url: orig };
}

function resolveInstagram(u) {
  const m = u.match(IG_ID_RE);
  return m ? { id: m[1], url: u } : { id: null, url: u };
}

async function extractItems(text, max) {
  const links = [...new Set((text.match(ANY_RE) || []).map(cleanUrl))];
  const out = [];
  for (const l of links) {
    let u = l;
    if (/\/\/t\.co\//i.test(u)) u = await resolveRedirect(u);
    if (!u) continue;
    if (/tiktok\.com/i.test(u)) {
      const r = await resolveTikTok(u);
      if (r && !out.some((o) => o.k === "tt" && (r.id ? o.id === r.id : o.url === r.url))) out.push({ k: "tt", ...r });
    } else if (/instagram\.com/i.test(u)) {
      const r = resolveInstagram(u);
      if (r && r.id && !out.some((o) => o.k === "ig" && o.id === r.id)) out.push({ k: "ig", ...r });
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

/* ───────────────────────── TikTok (tự đọc trực tiếp từ trang TikTok, không qua API bên thứ 3) ───────────────────────── */
const TT_UAS = [
  UA,
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
];

// Gom cookie TikTok trả về (file video/ảnh trên CDN thường đòi đúng cookie này)
function collectCookies(res, jar) {
  const list =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : (res.headers.get("set-cookie") || "").split(/,(?=\s*[\w-]+=)/);
  for (const s of list) {
    const m = /^\s*([^=;\s]+)=([^;]*)/.exec(s);
    if (m) jar[m[1]] = m[2];
  }
}
const jarStr = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");

// Mở trang video, tự theo redirect (giữ cookie), đọc JSON nhúng sẵn trong HTML
async function ttPage(url, dbg) {
  for (const ua of TT_UAS) {
    const jar = {};
    let u = url;
    try {
      for (let hop = 0; hop < 6; hop++) {
        const r = await fetch(u, {
          redirect: "manual",
          headers: {
            "User-Agent": ua,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            ...(Object.keys(jar).length ? { Cookie: jarStr(jar) } : {}),
          },
        });
        collectCookies(r, jar);
        const loc = r.headers.get("location");
        if (r.status >= 300 && r.status < 400 && loc) {
          u = new URL(loc, u).toString();
          continue;
        }
        if (!r.ok) {
          dbg.push(`HTTP ${r.status}`);
          break;
        }
        const html = await r.text();
        const scripts = [
          /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
          /<script id="SIGI_STATE"[^>]*>([\s\S]*?)<\/script>/,
          /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
        ];
        let data = null;
        for (const re of scripts) {
          const m = re.exec(html);
          if (!m) continue;
          try {
            data = JSON.parse(m[1].replace(/&quot;/g, '"'));
            break;
          } catch {}
        }
        if (!data) {
          dbg.push("không có dữ liệu (TikTok chặn IP / captcha?)");
          break;
        }
        const d = data.__DEFAULT_SCOPE__?.["webapp.video-detail"] || data.ItemModule || data;
        const item = d?.itemInfo?.itemStruct || d?.itemStruct || d?.itemInfo ||
          (data.ItemModule && Object.values(data.ItemModule)[0]);
        if (item) return { item, jar, ua };
        dbg.push(`statusCode ${d?.statusCode || "unknown"} ${d?.statusMsg || ""}`.trim());
        break;
      }
    } catch (e) {
      dbg.push(String(e).slice(0, 60));
    }
  }
  return null;
}

function normTikTok({ item, jar, ua }) {
  const a = item.author || {};
  const uid = a.uniqueId || "";
  // File media TikTok cần cookie + Referer → Worker tự tải rồi upload lên Telegram
  const headers = {
    "User-Agent": ua,
    Referer: "https://www.tiktok.com/",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    ...(Object.keys(jar).length ? { Cookie: jarStr(jar) } : {}),
  };

  const imgs = ((item.imagePost && item.imagePost.images) || [])
    .map((i) => i && i.imageURL && i.imageURL.urlList && i.imageURL.urlList[0])
    .filter(Boolean)
    .slice(0, 20);

  const v = item.video || {};
  const variants = [];
  for (const b of v.bitrateInfo || []) {
    if (/265|hevc/i.test(b.CodecType || "")) continue; // H.265 nhiều máy không phát được
    const u = b.PlayAddr && b.PlayAddr.UrlList && b.PlayAddr.UrlList[0];
    if (u) variants.push({ url: u, bitrate: b.Bitrate || 0, content_type: "video/mp4" });
  }
  if (v.playAddr) variants.push({ url: v.playAddr, bitrate: 1, content_type: "video/mp4" }); // bản không logo mặc định

  const t = {
    platform: "tt",
    id: item.id,
    url: `https://www.tiktok.com/@${uid}/video/${item.id}`,
    author: { name: a.nickname || uid, screen_name: uid },
  };
  const m = {
    photos: imgs.map((url) => ({ url, headers })),
    videos:
      !imgs.length && variants.length
        ? [{
            type: "video",
            url: variants[0].url,
            variants,
            headers,
            width: v.width || undefined,
            height: v.height || undefined,
            duration: v.duration || undefined,
          }]
        : [],
  };
  return { t, m };
}

/* ── Các API bên thứ 3 (dự phòng, thử lần lượt khi cách tự đọc trang bị chặn / lỗi) ── */
const mkTT = (id, uid, nick, imgs, vids, meta = {}) => {
  imgs = (imgs || []).filter(Boolean).slice(0, 20);
  vids = [...new Set((vids || []).filter(Boolean))];
  if (!imgs.length && !vids.length) return null;
  const t = {
    platform: "tt",
    id: id || "",
    url: id && uid ? `https://www.tiktok.com/@${uid}/video/${id}` : "",
    author: { name: nick || uid || "", screen_name: uid || "" },
  };
  return {
    t,
    m: {
      photos: imgs.map((url) => ({ url })),
      videos: imgs.length
        ? []
        : [{
            type: "video",
            url: vids[0],
            variants: vids.map((u, i) => ({ url: u, bitrate: 1e6 - i, content_type: "video/mp4" })),
            width: meta.width, height: meta.height, duration: meta.duration,
          }],
    },
  };
};

async function ttJson(name, url, init, dbg) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    const txt = await r.text();
    try { return JSON.parse(txt); } catch { dbg.push(`${name} HTTP ${r.status} (không phải JSON)`); }
  } catch (e) {
    dbg.push(`${name} ${String(e).slice(0, 50)}`);
  }
  return null;
}
const imgUrl = (x) => (typeof x === "string" ? x : x && (x.url || x.imageURL?.urlList?.[0] || x.display_image?.url_list?.[0]));

// 0) Tự đọc trang TikTok (không phụ thuộc bên thứ 3)
async function ttFromPage(url, dbg) {
  const p = await ttPage(url, dbg);
  return p ? normTikTok(p) : null;
}

// 1) tikwm.com
async function ttFromTikwm(url, dbg) {
  const abs = (u) => (!u ? "" : /^https?:\/\//i.test(u) ? u : `https://www.tikwm.com${u.startsWith("/") ? "" : "/"}${u}`);
  for (const host of ["https://www.tikwm.com/api/", "https://tikwm.com/api/"]) {
    const j = await ttJson("tikwm", host, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        Origin: "https://www.tikwm.com",
        Referer: "https://www.tikwm.com/",
        "X-Requested-With": "XMLHttpRequest",
        Cookie: "current_language=en",
      },
      body: `url=${encodeURIComponent(url)}&hd=1`,
    }, dbg);
    if (j && j.code === 0 && j.data) {
      const d = j.data, a = d.author || {};
      return mkTT(d.id, a.unique_id, a.nickname, (d.images || []).map(abs), [abs(d.hdplay), abs(d.play)], { duration: d.duration });
    }
    if (j) dbg.push(`tikwm ${String(j.msg || "").slice(0, 60)}`);
  }
  return null;
}

// 2) tiklydown
async function ttFromTiklydown(url, dbg) {
  const j = await ttJson("tiklydown", `https://api.tiklydown.eu.org/api/download/v3?url=${encodeURIComponent(url)}`, { headers: { "User-Agent": UA } }, dbg);
  const d = j && (j.data || j);
  if (!d || (!d.video && !d.images)) { if (j) dbg.push("tiklydown không có dữ liệu"); return null; }
  const v = d.video || {}, a = d.author || {};
  return mkTT(
    d.id, a.unique_id || a.uniqueId || a.username, a.nickname || a.name,
    (Array.isArray(d.images) ? d.images : []).map(imgUrl),
    [v.noWatermark, v.no_watermark, v.nowm, v.playAddr, v.watermark],
    { width: v.width, height: v.height, duration: v.duration }
  );
}

// 3) douyin.wtf (Douyin_TikTok_Download_API public)
async function ttFromDouyinWtf(url, dbg) {
  const j = await ttJson("douyin.wtf", `https://api.douyin.wtf/api/hybrid/video_data?url=${encodeURIComponent(url)}&minimal=true`, { headers: { "User-Agent": UA } }, dbg);
  const d = j && j.data;
  if (!d) { if (j) dbg.push(`douyin.wtf ${String(j.message || j.detail || "").slice(0, 60)}`); return null; }
  const vd = d.video_data || {}, a = d.author || {};
  const imgs = ((d.image_data && (d.image_data.no_watermark_image_list || d.image_data.watermark_image_list)) || []).map(imgUrl);
  return mkTT(d.aweme_id || d.id, a.unique_id || a.uniqueId, a.nickname, imgs, [vd.nwm_video_url_HQ, vd.nwm_video_url]);
}

// 4) lovetik.com
async function ttFromLovetik(url, dbg) {
  const j = await ttJson("lovetik", "https://lovetik.com/api/ajax/search", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": UA, "X-Requested-With": "XMLHttpRequest",
      Origin: "https://lovetik.com", Referer: "https://lovetik.com/",
    },
    body: `query=${encodeURIComponent(url)}`,
  }, dbg);
  if (!j || j.status !== "ok") { if (j) dbg.push(`lovetik ${String(j.mess || j.status || "").slice(0, 60)}`); return null; }
  const links = (j.links || []).filter((l) => l && l.a && !/mp3|audio/i.test(`${l.t || ""} ${l.s || ""}`));
  const label = (l) => `${l.t || ""} ${l.s || ""}`;
  const vids = [
    ...links.filter((l) => /no.?water|without/i.test(label(l))),
    ...links.filter((l) => !/no.?water|without/i.test(label(l)) && !/water/i.test(label(l))),
  ].map((l) => l.a);
  return mkTT(j.vid, j.author_id || j.author, j.author, (j.images || []).map(imgUrl), vids);
}

/* ───────────────────────── Instagram public post / Reel ───────────────────────── */
function igDecodeUrl(s) {
  return String(s || "")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003D/gi, "=")
    .replace(/\\\\\//g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function igMeta(html, key) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const a = {};
    for (const m of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)) a[m[1].toLowerCase()] = m[2];
    if ((a.property || a.name || "").toLowerCase() === key) return igDecodeUrl(a.content);
  }
  return "";
}

function igMediaFromHtml(html) {
  const images = [];
  const videos = [];
  const add = (arr, u) => {
    u = igDecodeUrl(u);
    if (!/^https?:\/\//i.test(u) || arr.includes(u)) return;
    arr.push(u);
  };
  for (const m of html.matchAll(/\\?"(?:display_url|thumbnail_src)\\?"\s*:\s*\\?"([^"]+)/g)) add(images, m[1]);
  for (const m of html.matchAll(/\\?"video_url\\?"\s*:\s*\\?"([^"]+)/g)) add(videos, m[1]);
  add(images, igMeta(html, "og:image"));
  add(videos, igMeta(html, "og:video"));
  return { images, videos };
}

async function igFromPage(url, dbg) {
  const pages = [url, `${url.replace(/\/?$/, "")}/embed/`];
  for (const page of pages) {
    try {
      const r = await fetch(page, {
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!r.ok) { dbg.push(`Instagram HTTP ${r.status}`); continue; }
      const media = igMediaFromHtml(await r.text());
      if (media.images.length || media.videos.length) {
        const t = { platform: "ig", id: "", url, author: { name: "Instagram", screen_name: "" } };
        const m = {
          photos: media.images.map((u) => ({ url: u })),
          videos: media.videos.map((u) => ({ type: "video", url: u, variants: [{ url: u, content_type: "video/mp4" }] })),
        };
        return { t, m };
      }
    } catch (e) {
      dbg.push(`Instagram ${String(e).slice(0, 40)}`);
    }
  }
  return null;
}

const TT_SOURCES = [
  ["trang TikTok", ttFromPage],
  ["tikwm", ttFromTikwm],
  ["tiklydown", ttFromTiklydown],
  ["douyin.wtf", ttFromDouyinWtf],
  ["lovetik", ttFromLovetik],
];

/* ───────────────────────── Xử lý 1 link ───────────────────────── */
async function sendPost(c, t, m, sink) {
  let ok = true;
  if (m.photos.length) ok = (await sendPhotos(c, t, m.photos, sink)) && ok;
  for (let i = 0; i < m.videos.length; i++) ok = (await sendVideo(c, t, m.videos[i], false, sink)) && ok;
  return ok;
}

// TikTok: thử lần lượt từng nguồn; nguồn nào lấy được VÀ gửi được thì dừng
async function handleTikTok(c, it) {
  const dbg = [];
  const url = it.url || `https://www.tiktok.com/@tiktok/video/${it.id}`;
  const sink = [];
  let found = false;
  for (const [name, fn] of TT_SOURCES) {
    let p = null;
    try { p = await fn(url, dbg); } catch (e) { dbg.push(`${name} ${String(e).slice(0, 50)}`); }
    if (!p || (!p.m.photos.length && !p.m.videos.length)) continue;
    found = true;
    sink.length = 0;
    if (await sendPost(c, p.t, p.m, sink)) return true;
    dbg.push(`${name}: lấy được nhưng gửi lỗi (${sink.slice(1).join(" ").slice(0, 120)})`);
  }
  console.error("tiktok fail:", url, dbg.join(" | "));
  await send(c, found ? L.sendFail : L.notFound);
  return false;
}

async function handleInstagram(c, it) {
  const dbg = [];
  const p = await igFromPage(it.url, dbg);
  if (!p || (!p.m.photos.length && !p.m.videos.length)) {
    console.error("instagram fail:", it.url, dbg.join(" | "));
    await send(c, L.notFound);
    return false;
  }
  const sink = [];
  if (await sendPost(c, p.t, p.m, sink)) return true;
  console.error("instagram send fail:", it.url, sink.join(" | "));
  await send(c, L.sendFail);
  return false;
}

async function handleItem(c, it) {
  if (it.k === "tt") return handleTikTok(c, it);
  if (it.k === "ig") return handleInstagram(c, it);
  const t = await getTweet(it.id);
  if (!t) { await send(c, L.notFound); return false; }
  const m = getMedia(t);
  await enrichVideos(m, it.id);
  if (!m.photos.length && !m.videos.length) { await send(c, L.noMedia); return false; }
  return sendPost(c, t, m);
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

async function sendPhotos(c, t, photos, sink) {
  const asDoc = c.cf.photoAs === "document";
  const type = asDoc ? "document" : "photo";
  const method = asDoc ? "sendDocument" : "sendPhoto";
  const failed = [];
  for (let i = 0; i < photos.length; i += 10) {
    const chunk = photos.slice(i, i + 10);
    const urls = chunk.map((p) => p.url);
    // Caption chỉ có các link giấu (không hiện chữ): ảnh đầu album giữ link của cả album
    const caption = hidAll(urls);
    let res = { ok: false };
    if (chunk.length === 1) {
      const fields = { ...base(c), caption, parse_mode: "HTML" };
      if (!chunk[0].headers) res = await tg(c.env, method, { ...fields, [type]: urls[0] });
      if (!res.ok) res = await tgUpload(c.env, method, type, urls[0], fields, "photo.jpg", "image/jpeg", chunk[0].headers);
    } else {
      if (!chunk.some((p) => p.headers)) {
        res = await tg(c.env, "sendMediaGroup", {
          ...base(c),
          media: chunk.map((p, k) => ({ type, media: p.url, ...(k === 0 ? { caption, parse_mode: "HTML" } : {}) })),
        });
      }
      if (!res.ok) res = await tgUploadGroup(c.env, chunk, type, base(c), caption);
      // Lưu danh sách link theo media_group_id để reply vào BẤT KỲ ảnh nào trong album cũng lấy được đủ link
      const gid = res.ok && res.result && res.result[0] && res.result[0].media_group_id;
      if (gid) await putLinks(c.env, `${c.chatId}:${gid}`, urls);
    }
    if (!res.ok) failed.push(...urls);
  }
  if (failed.length) {
    if (sink) sink.push(failed.join("\n"));
    else await send(c, L.sendFail);
  }
  return !failed.length;
}

async function sendVideo(c, t, v, showCap, sink) {
  const urls = videoUrls(v, c.cf.quality).slice(0, 3);
  if (!urls.length) {
    if (sink) sink.push("");
    else await send(c, L.sendFail);
    return false;
  }
  const gif = v.type === "gif";
  const method = gif ? "sendAnimation" : "sendVideo";
  const field = gif ? "animation" : "video";
  const fields = {
    ...base(c),
    // Link giấu luôn là bản chất lượng cao nhất theo cài đặt, kể cả khi phải gửi bản thấp hơn
    caption: hid(urls[0]),
    parse_mode: "HTML",
    ...(gif ? {} : { supports_streaming: true }),
  };
  const dims = { width: v.width, height: v.height, duration: v.duration ? Math.round(v.duration) : undefined };

  let res = { ok: false };
  const why = [];
  for (let i = 0; i < urls.length && !res.ok; i++) {
    const f = i === 0 ? { ...fields, ...dims } : fields;
    // 1) Telegram tự tải từ link (tối đa 20MB)  2) Worker tải về rồi upload (tối đa 50MB)
    if (!v.headers) {
      res = await tg(c.env, method, { ...f, [field]: urls[i] });
      if (!res.ok) why.push(`link: ${res.description}`);
    }
    if (!res.ok) {
      res = await tgUpload(c.env, method, field, urls[i], f, "video.mp4", "video/mp4", v.headers);
      if (!res.ok) why.push(`upload: ${res.description}`);
    }
    // Tải được file nhưng Telegram từ chối (vd. caption/link giấu quá dài) → thử lại không kèm link giấu
    if (!res.ok && !/^download|too big/i.test(String(res.description || ""))) {
      res = await tgUpload(c.env, method, field, urls[i], { ...f, caption: undefined, parse_mode: undefined }, "video.mp4", "video/mp4", v.headers);
      if (!res.ok) why.push(`upload (no caption): ${res.description}`);
    }
    // Cuối cùng thử cho Telegram tự tải (nếu CDN không đòi cookie)
    if (!res.ok && v.headers) {
      res = await tg(c.env, method, { ...f, [field]: urls[i] });
      if (!res.ok) why.push(`link: ${res.description}`);
    }
  }
  if (!res.ok) {
    console.error("sendVideo fail:", why.join(" | "));
    if (sink) sink.push(urls[0], why.join(" | "));
    else await send(c, L.sendFail);
  }
  return !!res.ok;
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
