/* =========================================================
   ONA FactCheck 서버
   ---------------------------------------------------------
   - API 키는 .env 파일에서만 읽고, 브라우저로는 절대 보내지 않습니다.
   - 내 컴퓨터에서 실행하면 localhost에서만 접속할 수 있습니다.
   - Render 같은 호스팅에서 실행하면(RENDER 환경변수 자동 감지) 외부 접속을 받되,
     ACCESS_PASSWORD 인증과 요청 횟수 제한이 반드시 적용됩니다.
   - 실행: 터미널에서 npm start → 브라우저에서 http://localhost:3000
   ========================================================= */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { runFactCheck, ServiceError } from "./factcheck.js";
import { handleChatTurn, CHAT_LIMITS } from "./chat.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(ROOT, ".env"));

// 호스팅 여부: Render가 자동으로 넣는 RENDER 변수, 또는 직접 HOSTED=1 로 지정
const HOSTED = Boolean(process.env.RENDER) || process.env.HOSTED === "1";
// 내 컴퓨터: 127.0.0.1(이 컴퓨터에서만 접속) / 호스팅: 0.0.0.0(외부 접속 허용)
const HOST = HOSTED ? "0.0.0.0" : "127.0.0.1";
const PORT = Number(process.env.PORT) || 3000;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
const KEYS = {
  tavilyKey: (process.env.TAVILY_API_KEY || "").trim(),
  geminiKey: (process.env.GEMINI_API_KEY || "").trim(),
  geminiModel: (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim(),
  // 기본 모델이 붐빌 때 차례로 대신 쓸 예비 모델 (쉼표로 구분)
  geminiFallbackModel: (process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash,gemini-3.5-flash-lite").trim(),
};

// 브라우저에 보여 줄 수 있는 파일은 이 세 개뿐 (.env, server.js 등은 절대 제공하지 않음)
const PUBLIC_FILES = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/index.html": { file: "index.html", type: "text/html; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/chatbot.js": { file: "chatbot.js", type: "text/javascript; charset=utf-8" },
  "/chatbot.css": { file: "chatbot.css", type: "text/css; charset=utf-8" },
};
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
if (HOSTED) {
  // 배포 주소(예: ona-factcheck.onrender.com)만 허용. 직접 정하려면 ALLOWED_HOSTS 환경변수(쉼표 구분)
  for (const h of [process.env.RENDER_EXTERNAL_HOSTNAME, ...(process.env.ALLOWED_HOSTS || "").split(",")]) {
    if (h && h.trim()) ALLOWED_HOSTS.add(h.trim().toLowerCase());
  }
}

// ---- 요청 횟수 제한 (사람마다 / 서버 전체) ----
const RATE_WINDOW_MS = 10 * 60 * 1000;                               // 10분
const RATE_MAX_PER_IP = Number(process.env.RATE_LIMIT_PER_10MIN) || 10; // 한 사람당 10분에 10건
const DAILY_MAX_TOTAL = Number(process.env.DAILY_LIMIT) || 200;        // 서버 전체 하루 200건 (API 요금 보호)
// 챗봇 일반 메시지(검색 없음)의 별도 제한. 챗봇이 실행하는 팩트체크는 위의 팩트체크 제한을 함께 씁니다.
const CHAT_MAX_PER_IP = Number(process.env.CHAT_RATE_LIMIT_PER_10MIN) || 30;  // 한 사람당 10분에 30건
const CHAT_DAILY_MAX = Number(process.env.CHAT_DAILY_LIMIT) || 600;            // 서버 전체 하루 600건
const AUTH_FAIL_MAX = 10;                                            // 비밀번호 10번 틀리면 15분 차단
const AUTH_BLOCK_MS = 15 * 60 * 1000;
const hits = new Map();       // ip -> 요청 시각 목록
const authFails = new Map();  // ip -> { count, until }
let daily = { day: "", count: 0 };
const chatHits = new Map();   // ip -> 챗봇 요청 시각 목록
let chatDaily = { day: "", count: 0 };

function clientIp(req) {
  // Render는 Cloudflare를 거치므로 Cloudflare가 직접 확인해 넣는 CF-Connecting-IP를 우선 사용
  // (X-Forwarded-For의 마지막 값은 Render에서는 사용자가 아니라 Cloudflare 중계 서버 주소일 수 있음)
  if (process.env.RENDER) {
    const cf = String(req.headers["cf-connecting-ip"] || "").trim();
    if (cf) return cf;
  }
  // 그 밖의 호스팅: 프록시가 붙여 주는 X-Forwarded-For의 마지막 값(프록시가 직접 확인한 주소)을 사용
  if (HOSTED) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((v) => v.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1];
  }
  return req.socket.remoteAddress || "unknown";
}
function rateLimited(ip, store = hits, max = RATE_MAX_PER_IP) {
  const now = Date.now();
  const list = (store.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= max) { store.set(ip, list); return Math.ceil((RATE_WINDOW_MS - (now - list[0])) / 1000); }
  list.push(now); store.set(ip, list);
  return 0;
}
function dailyLimited() {
  const day = new Date().toISOString().slice(0, 10);
  if (daily.day !== day) daily = { day, count: 0 };
  if (daily.count >= DAILY_MAX_TOTAL) return true;
  daily.count++;
  return false;
}
function chatDailyLimited() {
  const day = new Date().toISOString().slice(0, 10);
  if (chatDaily.day !== day) chatDaily = { day, count: 0 };
  if (chatDaily.count >= CHAT_DAILY_MAX) return true;
  chatDaily.count++;
  return false;
}
setInterval(() => {   // 메모리 정리
  const now = Date.now();
  for (const store of [hits, chatHits]) {
    for (const [ip, list] of store) if (!list.some((t) => now - t < RATE_WINDOW_MS)) store.delete(ip);
  }
  for (const [ip, f] of authFails) if (f.until && now > f.until) authFails.delete(ip);
}, 5 * 60 * 1000).unref();

// ---- 접속 비밀번호 (HTTP Basic 인증: 브라우저가 아이디/비밀번호 창을 띄웁니다. 아이디는 아무거나, 비밀번호만 맞으면 됨) ----
const sha = (v) => crypto.createHash("sha256").update(String(v)).digest();
function authorized(req) {
  if (!ACCESS_PASSWORD) return true;   // 비밀번호 미설정(내 컴퓨터 로컬 실행)이면 인증 생략
  const m = String(req.headers.authorization || "").match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const pw = decoded.slice(decoded.indexOf(":") + 1);
  return crypto.timingSafeEqual(sha(pw), sha(ACCESS_PASSWORD));
}
const MAX_CLAIM = 3000;
const MAX_RUNNING = 2;   // 동시에 처리할 팩트체크 수
let running = 0;

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
  ...(HOSTED ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
};

const server = http.createServer(async (req, res) => {
  // 주소가 잘못된 요청(예: //)에 서버가 멈추지 않도록 여기서 걸러냄
  let url;
  try {
    url = new URL(req.url, `http://localhost:${PORT}`);
  } catch {
    return send(res, 400, "text/plain; charset=utf-8", "Bad request");
  }

  // 호스팅의 상태 확인용 (비밀 정보 없음)
  if (url.pathname === "/healthz" && req.method === "GET") {
    return send(res, 200, "text/plain; charset=utf-8", "ok");
  }

  // 다른 사이트가 이 서버를 몰래 부르는 것을 막기 위한 주소 확인
  if (!ALLOWED_HOSTS.has(String(req.headers.host || "").toLowerCase())) {
    return send(res, 403, "text/plain; charset=utf-8", "Forbidden");
  }

  // 접속 비밀번호 확인 (틀린 시도가 반복되면 잠시 차단)
  if (ACCESS_PASSWORD) {
    const ip = clientIp(req);
    const f = authFails.get(ip);
    if (f && f.until && Date.now() < f.until) {
      return send(res, 429, "text/plain; charset=utf-8", "시도 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.");
    }
    if (!authorized(req)) {
      const cur = f && (!f.until || Date.now() >= f.until) ? f : { count: 0, until: 0 };
      cur.count++;
      if (cur.count >= AUTH_FAIL_MAX) { cur.until = Date.now() + AUTH_BLOCK_MS; cur.count = 0; }
      authFails.set(ip, cur);
      res.writeHead(401, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", "WWW-Authenticate": 'Basic realm="ONA FactCheck", charset="UTF-8"' });
      return res.end("접속 비밀번호가 필요합니다.");
    }
    authFails.delete(ip);
  }

  if (req.method === "GET" && PUBLIC_FILES[url.pathname]) {
    const { file, type } = PUBLIC_FILES[url.pathname];
    try {
      return send(res, 200, type, fs.readFileSync(path.join(ROOT, file)));
    } catch {
      return send(res, 404, "text/plain; charset=utf-8", "Not found");
    }
  }

  if (url.pathname === "/api/status" && req.method === "GET") {
    return sendJson(res, 200, { tavily: Boolean(KEYS.tavilyKey), gemini: Boolean(KEYS.geminiKey), model: KEYS.geminiModel });
  }

  if (url.pathname === "/api/factcheck" && req.method === "POST") {
    return handleFactCheck(req, res);
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    return handleChat(req, res);
  }

  send(res, 404, "text/plain; charset=utf-8", "Not found");
});

async function handleFactCheck(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, "").toLowerCase())) {
    return sendJson(res, 403, { error: "허용되지 않은 접속입니다." });
  }
  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    return sendJson(res, 415, { error: "잘못된 요청 형식입니다." });
  }

  let claim;
  try {
    const body = JSON.parse(await readBody(req, 20_000));
    claim = typeof body.claim === "string" ? body.claim.trim() : "";
  } catch {
    return sendJson(res, 400, { error: "요청을 읽지 못했습니다." });
  }
  if (!claim) return sendJson(res, 400, { error: "검증할 주장을 입력해 주세요." });
  if (claim.length > MAX_CLAIM) return sendJson(res, 400, { error: `주장은 ${MAX_CLAIM}자 이내로 입력해 주세요.` });

  const missing = [!KEYS.tavilyKey && "TAVILY_API_KEY", !KEYS.geminiKey && "GEMINI_API_KEY"].filter(Boolean);
  if (missing.length) {
    return sendJson(res, 500, {
      error: "서버에 API 키가 설정되지 않았습니다.",
      hint: `.env 파일에 ${missing.join(", ")} 값을 넣고 서버를 다시 시작해 주세요. (README 참고)`,
    });
  }
  const blocked = factCheckBlocked(req);
  if (blocked) return sendJson(res, 429, blocked);

  // 진행 상황을 한 줄씩 보내는 방식 (NDJSON)
  running++;
  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8" });
  const write = (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n"); };
  const started = Date.now();
  try {
    const result = await runFactCheck(claim, KEYS, (step) => write({ type: "progress", step }));
    write({ type: "result", result });
    log(`완료 (${((Date.now() - started) / 1000).toFixed(1)}초) 판정=${result.verdict}`);
  } catch (err) {
    const info = explainError(err);
    log(`오류: ${redact(err?.service || "")} ${err?.status || ""} ${redact(err?.detail || err?.message || String(err))}`);
    write({ type: "error", ...info });
  } finally {
    running--;
    res.end();
  }
}

// 팩트체크 1건을 실행해도 되는지 확인 (화면 버튼과 챗봇이 같은 제한을 함께 씁니다)
function factCheckBlocked(req) {
  if (running >= MAX_RUNNING) return { error: "다른 팩트체크가 진행 중입니다.", hint: "잠시 후 다시 실행해 주세요." };
  if (HOSTED) {   // 호스팅에서만 횟수 제한 적용 (내 컴퓨터에서는 제한 없음)
    const wait = rateLimited(clientIp(req));
    if (wait) return { error: "요청이 너무 잦습니다.", hint: `약 ${Math.ceil(wait / 60)}분 뒤에 다시 시도해 주세요. (10분에 ${RATE_MAX_PER_IP}건까지)` };
    if (dailyLimited()) return { error: "오늘 사용 한도에 도달했습니다.", hint: "내일 다시 시도해 주세요." };
  }
  return null;
}

// ---------------- 챗봇 ----------------
async function handleChat(req, res) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_HOSTS.has(origin.replace(/^https?:\/\//, "").toLowerCase())) {
    return sendJson(res, 403, { error: "허용되지 않은 접속입니다." });
  }
  if (!String(req.headers["content-type"] || "").includes("application/json")) {
    return sendJson(res, 415, { error: "잘못된 요청 형식입니다." });
  }

  let body;
  try {
    body = JSON.parse(await readBody(req, 120_000));
  } catch {
    return sendJson(res, 400, { error: "요청을 읽지 못했습니다." });
  }
  if (!body || typeof body !== "object") return sendJson(res, 400, { error: "요청을 읽지 못했습니다." });
  const isCheck = body.action === "check";
  const textIn = String((isCheck ? body.claim : body.message) || "").trim();
  if (!textIn) return sendJson(res, 400, { error: "메시지를 입력해 주세요." });
  const max = isCheck ? MAX_CLAIM : CHAT_LIMITS.maxMessage;
  if (textIn.length > max) return sendJson(res, 400, { error: `${max}자 이내로 입력해 주세요.` });

  const missing = [!KEYS.tavilyKey && "TAVILY_API_KEY", !KEYS.geminiKey && "GEMINI_API_KEY"].filter(Boolean);
  if (missing.length) {
    return sendJson(res, 500, {
      error: "서버에 API 키가 설정되지 않았습니다.",
      hint: `.env 파일에 ${missing.join(", ")} 값을 넣고 서버를 다시 시작해 주세요. (README 참고)`,
    });
  }
  if (HOSTED) {
    const wait = rateLimited(clientIp(req), chatHits, CHAT_MAX_PER_IP);
    if (wait) return sendJson(res, 429, { error: "챗봇 요청이 너무 잦습니다.", hint: `약 ${Math.ceil(wait / 60)}분 뒤에 다시 시도해 주세요. (10분에 ${CHAT_MAX_PER_IP}건까지)` });
    if (chatDailyLimited()) return sendJson(res, 429, { error: "오늘 챗봇 사용 한도에 도달했습니다.", hint: "내일 다시 시도해 주세요." });
  }

  res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": "application/x-ndjson; charset=utf-8" });
  const write = (obj) => { if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n"); };
  const onProgress = (step) => write({ type: "progress", step });

  // 챗봇이 실행하는 팩트체크도 화면 버튼과 똑같은 동시 실행·횟수 제한을 거칩니다
  const runCheck = async (claim, scope, progress) => {
    const blocked = factCheckBlocked(req);
    if (blocked) throw Object.assign(new Error("limit"), { limit: blocked });
    running++;
    try {
      return await runFactCheck(claim, KEYS, progress, { scope });
    } finally {
      running--;
    }
  };

  const started = Date.now();
  try {
    const message = await handleChatTurn(body, KEYS, { onProgress, runCheck });
    write({ type: "result", message });
    log(`챗봇 완료 (${((Date.now() - started) / 1000).toFixed(1)}초) 종류=${message.kind}`);
  } catch (err) {
    const info = explainError(err);
    log(`챗봇 오류: ${redact(err?.service || "")} ${err?.status || ""} ${redact(err?.detail || err?.message || String(err))}`);
    write({ type: "error", ...info });
  } finally {
    res.end();
  }
}

// 오류를 기자가 이해할 수 있는 말로 바꾸기 (키 등 내부 정보는 화면에 보내지 않음)
function explainError(err) {
  if (err?.limit) return err.limit;
  if (err instanceof ServiceError) {
    const who = err.service === "tavily" ? "Tavily(검색)" : "Gemini(AI)";
    if (err.friendly) return { error: err.friendly, hint: "주장을 다른 표현으로 바꿔 다시 시도해 주세요." };
    if (err.status === 401 || err.status === 403) {
      return { error: `${who} API 키가 올바르지 않거나 권한이 없습니다.`, hint: ".env 파일의 키를 확인하고 서버를 다시 시작해 주세요." };
    }
    if (err.status === 400 && err.service === "gemini" && /API_KEY_INVALID|API key not valid/i.test(err.detail)) {
      return { error: "Gemini API 키가 올바르지 않습니다.", hint: ".env 파일의 GEMINI_API_KEY를 확인해 주세요." };
    }
    if (err.status === 404 && err.service === "gemini") {
      return { error: `Gemini 모델 이름(${KEYS.geminiModel})을 찾을 수 없습니다.`, hint: ".env 파일의 GEMINI_MODEL 값을 확인해 주세요." };
    }
    if (err.status === 429 || err.status === 432 || err.status === 433) {
      return { error: `${who} 사용 한도를 넘었습니다.`, hint: "잠시 후 다시 시도하거나, 요금제·잔여 크레딧을 확인해 주세요." };
    }
    if (err.status === 503 && err.service === "gemini") {
      return { error: "Google Gemini 서버가 지금 혼잡합니다. (Google 측 일시적 문제)", hint: "예비 모델까지 모두 시도했지만 응답이 없었습니다. 1~2분 뒤 다시 실행해 주세요." };
    }
    if (err.status >= 500) return { error: `${who} 서버에 일시적인 문제가 있습니다.`, hint: "잠시 후 다시 실행해 주세요." };
    return { error: `${who} 요청이 실패했습니다. (코드 ${err.status})`, hint: "터미널 창의 오류 내용을 확인해 주세요." };
  }
  if (err?.name === "TimeoutError" || err?.name === "AbortError") {
    return { error: "응답 시간이 너무 오래 걸려 중단했습니다.", hint: "주장을 짧게 줄여 다시 실행해 주세요." };
  }
  return { error: "인터넷 연결 또는 서버 내부에서 오류가 발생했습니다.", hint: "인터넷 연결을 확인하고 터미널 창의 오류 내용을 확인해 주세요." };
}

// ---------------- 도우미 ----------------
function send(res, status, type, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": type });
  res.end(body);
}
function sendJson(res, status, obj) {
  send(res, status, "application/json; charset=utf-8", JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
// 로그에 키가 찍히지 않도록 가리기
function redact(text) {
  let t = String(text);
  for (const k of [KEYS.tavilyKey, KEYS.geminiKey]) if (k) t = t.split(k).join("***");
  return t.replace(/tvly-[A-Za-z0-9_-]+/g, "tvly-***").replace(/AIza[0-9A-Za-z_-]{20,}/g, "AIza***");
}
function log(msg) {
  console.log(`[${new Date().toLocaleTimeString("ko-KR")}] ${msg}`);
}
// .env 파일 읽기 (KEY=VALUE 형식)
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[오류] ${PORT}번 포트를 이미 다른 프로그램이 쓰고 있습니다. 이미 켜 둔 ONA FactCheck 창이 있는지 확인하세요.\n`);
  } else {
    console.error("\n[오류] 서버를 시작하지 못했습니다:", err.message, "\n");
  }
  process.exit(1);
});

// 호스팅인데 비밀번호가 없으면 아무나 API 요금을 쓰게 되므로 시작하지 않음
if (HOSTED && ACCESS_PASSWORD.length < 8) {
  console.error("\n[오류] 호스팅 환경에서는 ACCESS_PASSWORD(8자 이상) 환경변수가 꼭 필요합니다. 서버를 시작하지 않습니다.\n");
  process.exit(1);
}

server.listen(PORT, HOST, () => {
  console.log("\n==============================================");
  console.log("  ONA FactCheck 서버가 켜졌습니다.");
  console.log(HOSTED ? `  호스팅 모드 (포트 ${PORT}, 접속 비밀번호·횟수 제한 적용)` : `  브라우저에서 접속:  http://localhost:${PORT}`);
  console.log("  끄려면 이 창에서 Ctrl + C 를 누르세요.");
  console.log("==============================================");
  console.log(`  Tavily 키: ${KEYS.tavilyKey ? "설정됨 ✓" : "없음 ✗ (.env 확인)"}`);
  console.log(`  Gemini 키: ${KEYS.geminiKey ? "설정됨 ✓" : "없음 ✗ (.env 확인)"}`);
  console.log(`  Gemini 모델: ${KEYS.geminiModel}\n`);
  if (HOSTED) {
    console.log("  [주의] 하루 요청 수는 메모리에만 기록되어 서버가 재시작되면 0으로 돌아갑니다.");
    console.log("         요금 상한은 Tavily·Gemini 계정 쪽에서 따로 관리하세요. (README 참고)\n");
  }
});
