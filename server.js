/* =========================================================
   ONA FactCheck 서버
   ---------------------------------------------------------
   - API 키는 .env 파일에서만 읽고, 브라우저로는 절대 보내지 않습니다.
   - 이 컴퓨터(localhost)에서만 접속할 수 있습니다.
   - 실행: 터미널에서 npm start → 브라우저에서 http://localhost:3000
   ========================================================= */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runFactCheck, ServiceError } from "./factcheck.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(ROOT, ".env"));

const HOST = "127.0.0.1";                       // 이 컴퓨터에서만 접속 가능 (바꾸지 마세요)
const PORT = Number(process.env.PORT) || 3000;
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
};
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const MAX_CLAIM = 3000;
const MAX_RUNNING = 2;   // 동시에 처리할 팩트체크 수
let running = 0;

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
};

const server = http.createServer(async (req, res) => {
  // 다른 사이트가 이 서버를 몰래 부르는 것을 막기 위한 주소 확인
  if (!ALLOWED_HOSTS.has(String(req.headers.host || "").toLowerCase())) {
    return send(res, 403, "text/plain; charset=utf-8", "Forbidden");
  }
  const url = new URL(req.url, `http://localhost:${PORT}`);

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
  if (running >= MAX_RUNNING) {
    return sendJson(res, 429, { error: "다른 팩트체크가 진행 중입니다.", hint: "잠시 후 다시 실행해 주세요." });
  }

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

// 오류를 기자가 이해할 수 있는 말로 바꾸기 (키 등 내부 정보는 화면에 보내지 않음)
function explainError(err) {
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

server.listen(PORT, HOST, () => {
  console.log("\n==============================================");
  console.log("  ONA FactCheck 서버가 켜졌습니다.");
  console.log(`  브라우저에서 접속:  http://localhost:${PORT}`);
  console.log("  끄려면 이 창에서 Ctrl + C 를 누르세요.");
  console.log("==============================================");
  console.log(`  Tavily 키: ${KEYS.tavilyKey ? "설정됨 ✓" : "없음 ✗ (.env 확인)"}`);
  console.log(`  Gemini 키: ${KEYS.geminiKey ? "설정됨 ✓" : "없음 ✗ (.env 확인)"}`);
  console.log(`  Gemini 모델: ${KEYS.geminiModel}\n`);
});
