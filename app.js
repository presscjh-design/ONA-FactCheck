/* =========================================================
   ONA FactCheck 화면 동작 파일 (브라우저에서 실행)
   ---------------------------------------------------------
   이 파일에는 API 키가 없습니다. 검색과 AI 분석은 모두
   우리 서버(server.js)가 처리하고, 여기서는 결과만 보여 줍니다.
   ========================================================= */

// 판정 등급별 화면 표시
const VERDICTS = {
  TRUE:         { label: "사실",             cls: "v-true" },
  MOSTLY_TRUE:  { label: "대체로 사실",      cls: "v-mostly" },
  HALF_TRUE:    { label: "일부 사실",        cls: "v-half" },
  MOSTLY_FALSE: { label: "대체로 사실 아님", cls: "v-mfalse" },
  FALSE:        { label: "사실 아님",        cls: "v-false" },
  PENDING:      { label: "판단 유보",        cls: "v-unknown" },
};
// 자료가 주장을 뒷받침하는 정도
const SUPPORTS = {
  DIRECT_SUPPORT:  { label: "직접 뒷받침", cls: "s-support" },
  PARTIAL_SUPPORT: { label: "일부 뒷받침", cls: "s-partial" },
  CONTRADICTS:     { label: "주장과 어긋남", cls: "s-refute" },
  CONTEXT:         { label: "참고 정보",   cls: "s-context" },
  IRRELEVANT:      { label: "관련 낮음",   cls: "s-irrelevant" },
};
const CHECK_NAMES = { date: "날짜·시점", region: "지역", subject: "대상", figure: "수치" };
const CHECK_VALUES = { MATCH: "일치", MISMATCH: "불일치", UNKNOWN: "확인 불가", NA: "해당 없음" };

// ---------------- 화면 요소 ----------------
const $ = (id) => document.getElementById(id);
const els = {
  claim: $("claimInput"), charCount: $("charCount"),
  checkBtn: $("checkBtn"), sampleBtn: $("sampleBtn"),
  serverStatus: $("serverStatus"), serverNotice: $("serverNotice"),
  loading: $("loading"), loadingStep: $("loadingStep"),
  errorBox: $("errorBox"), results: $("results"), sampleBanner: $("sampleBanner"),
  verdictBadge: $("verdictBadge"), checkedAt: $("checkedAt"),
  claimEcho: $("claimEcho"), verdictSummary: $("verdictSummary"),
  criteria: $("criteria"), adjustBox: $("adjustBox"), adjustList: $("adjustList"),
  reasoning: $("reasoning"), conflictBox: $("conflictBox"), conflictList: $("conflictList"),
  evidenceList: $("evidenceList"), evidenceCount: $("evidenceCount"),
  compareWrap: $("compareWrap"), originalText: $("originalText"),
  suggestionText: $("suggestionText"), suggestionNote: $("suggestionNote"),
  copyBtn: $("copyBtn"), toast: $("toast"),
};

let lastResult = null;
let isRunning = false;

// ---------------- 서버 연결 확인 ----------------
async function checkServer() {
  if (location.protocol === "file:") {
    setServer(false, "서버 꺼짐",
      "이 화면은 파일을 직접 연 상태입니다. 터미널에서 서버를 켠 뒤 브라우저 주소창에 http://localhost:3000 을 입력해 접속하세요. (README 참고)");
    return;
  }
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const s = await res.json();
    const missing = [!s.tavily && "Tavily", !s.gemini && "Gemini"].filter(Boolean);
    if (missing.length) setServer(false, "키 설정 필요", `서버의 .env 파일에 ${missing.join(", ")} API 키가 없습니다. 키를 넣고 서버를 다시 시작해 주세요.`);
    else setServer(true, "서버 연결됨", "");
  } catch {
    setServer(false, "서버 꺼짐", "서버에 연결할 수 없습니다. 터미널에서 서버가 켜져 있는지 확인해 주세요.");
  }
}
function setServer(ok, label, notice) {
  els.serverStatus.textContent = (ok ? "● " : "○ ") + label;
  els.serverStatus.className = "server-status " + (ok ? "ok" : "bad");
  els.serverNotice.textContent = notice;
  els.serverNotice.hidden = !notice;
}

// ---------------- 입력창 ----------------
els.claim.addEventListener("input", () => {
  els.charCount.textContent = `${els.claim.value.length} / 3000`;
});
els.claim.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runFactCheck();   // Ctrl(⌘)+Enter로 실행
});
els.checkBtn.addEventListener("click", runFactCheck);
els.sampleBtn.addEventListener("click", showSample);
els.copyBtn.addEventListener("click", copyResult);

// ---------------- 팩트체크 실행 ----------------
async function runFactCheck() {
  if (isRunning) return;
  const claim = els.claim.value.trim();
  if (!claim) { showError("검증할 주장을 입력해 주세요."); els.claim.focus(); return; }
  if (location.protocol === "file:") { checkServer(); showError("서버를 통해 접속해야 팩트체크를 실행할 수 있습니다.", "브라우저 주소창에 http://localhost:3000 을 입력하세요."); return; }

  setRunning(true);
  hideError();
  els.results.hidden = true;
  setStep("검색을 준비하고 있습니다…");

  try {
    const res = await fetch("/api/factcheck", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim }),
    });
    if (!res.ok || !res.body) {
      const e = await res.json().catch(() => ({}));
      throw new FriendlyError(e.error || `서버 오류가 발생했습니다. (코드 ${res.status})`, e.hint || "");
    }

    // 서버가 보내는 진행 상황을 한 줄씩 읽기
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "", result = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.type === "progress") setStep(msg.step);
        else if (msg.type === "result") result = msg.result;
        else if (msg.type === "error") throw new FriendlyError(msg.error, msg.hint);
      }
    }
    if (!result) throw new FriendlyError("서버에서 결과를 받지 못했습니다.", "다시 실행해 주세요.");
    renderResult(result, false);
  } catch (err) {
    console.error(err);
    if (err instanceof FriendlyError) showError(err.message, err.hint);
    else { showError("서버와 연결이 끊겼습니다.", "터미널에서 서버가 켜져 있는지 확인하고 다시 실행해 주세요."); checkServer(); }
  } finally {
    setRunning(false);
  }
}

// ---------------- 결과 화면 그리기 ----------------
function renderResult(r, isSample) {
  lastResult = r;
  const v = VERDICTS[r.verdict] || VERDICTS.PENDING;

  els.sampleBanner.hidden = !isSample;
  els.verdictBadge.textContent = v.label;
  els.verdictBadge.className = "verdict-badge " + v.cls;
  els.checkedAt.innerHTML = `검증 기준 날짜 <strong>${esc(r.checkedAt)}</strong>${r.model ? ` · 분석 모델 ${esc(r.model)}` : ""}`;
  els.claimEcho.textContent = r.claim;
  els.verdictSummary.textContent = r.summary;

  // 검증 기준
  const c = r.criteria || {};
  const si = r.searchInfo || {};
  const searchText = si.languages
    ? `${si.languages.join(" · ")} 검색 · 공식 자료 ${si.officialFound ?? 0}건${si.supplemented ? " · 공식 자료 부족으로 보완 검색함" : ""}`
    : "";
  const rows = [
    ["주제 분류", si.topicLabel], ["검색 범위", searchText],
    ["주장의 기준 시점", c.timeframe], ["주장의 지역", c.region], ["주장의 대상", c.subject],
  ].filter(([, val]) => val);
  els.criteria.innerHTML = rows.map(([k, val]) => `<dt>${k}</dt><dd>${esc(val)}</dd>`).join("");

  // 자동 점검 안내
  els.adjustBox.hidden = !(r.adjustments && r.adjustments.length);
  els.adjustList.innerHTML = (r.adjustments || []).map((a) => `<li>${esc(a)}</li>`).join("");

  // 판정 이유
  els.reasoning.innerHTML = r.reasoning.length
    ? r.reasoning.map((p) => `<p>${esc(p.text)} ${refs(p.sourceIds)}</p>`).join("")
    : `<p class="empty-text">판정 이유가 제공되지 않았습니다.</p>`;
  els.conflictBox.hidden = !r.conflicts.length;
  els.conflictList.innerHTML = r.conflicts.map((x) => `<li>${esc(x.text)} ${refs(x.sourceIds)}</li>`).join("");

  // 핵심 근거
  els.evidenceCount.textContent = r.evidence.length ? `${r.evidence.length}건` : "";
  els.evidenceList.innerHTML = r.evidence.length
    ? r.evidence.map(renderEvidence).join("")
    : `<li class="no-results">관련 근거를 찾지 못했습니다</li>`;

  // 수정 제안
  const s = r.suggestion;
  if (s.shown) {
    const d = diffWords(s.original, s.text);
    els.originalText.innerHTML = d.left;
    els.suggestionText.innerHTML = d.right;
    els.compareWrap.hidden = false;
    els.suggestionNote.innerHTML = `${s.note ? `수정 이유: ${esc(s.note)} ` : ""}<span class="meta-tag">사용한 근거</span> ${refs(s.sourceIds)}`;
  } else {
    els.originalText.textContent = s.original;
    els.suggestionText.innerHTML = `<span class="empty-text">수정 제안 없음</span>`;
    els.compareWrap.hidden = false;
    els.suggestionNote.textContent = s.reason || "";
  }

  els.results.hidden = false;
  els.results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderEvidence(e) {
  const sup = SUPPORTS[e.support] || SUPPORTS.CONTEXT;
  const dateText = e.date ? `${esc(e.date)}${e.dateSource === "content" ? ' <span class="meta-tag">(본문 기준)</span>' : ""}` : "날짜 미상";
  const pub = `${esc(e.publisher)}${e.publisherSource === "ai" ? ' <span class="meta-tag">(AI 추정)</span>' : ""}`;
  const checks = Object.keys(CHECK_NAMES)
    .map((k) => `<span class="check c-${e.checks[k]}">${CHECK_NAMES[k]} ${CHECK_VALUES[e.checks[k]] || "확인 불가"}</span>`)
    .join("");

  let quoteHtml;
  if (e.quoteVerified) {
    quoteHtml = `<blockquote class="ev-quote"><span class="ql">AI가 인용한 관련 내용 · 원문 대조 확인됨</span>${esc(e.quote)}${e.quoteTranslation ? `<span class="qt">번역(AI): ${esc(e.quoteTranslation)}</span>` : ""}</blockquote>`;
  } else if (e.quoteRejected) {
    quoteHtml = `<blockquote class="ev-quote unverified"><span class="ql">⚠ AI 인용문이 원문에서 확인되지 않음 (판정 근거에서 제외)</span>${esc(e.quoteRejected)}</blockquote>`;
  } else {
    quoteHtml = "";
  }

  const safe = /^https?:\/\//i.test(e.url);
  const links = safe
    ? `<div class="ev-links">
         ${e.quoteVerified ? `<a class="ev-find" href="${esc(fragmentUrl(e.url, e.quote))}" target="_blank" rel="noopener noreferrer">원문에서 해당 문장 보기 ↗</a>` : ""}
         <a class="evidence-url" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.url)}</a>
       </div>`
    : `<span class="empty-text">출처 URL 없음</span>`;

  return `<li class="evidence-item" id="ev-${e.id}">
    <div class="evidence-top">
      <span class="ev-num">[${e.id}]</span>
      <span class="tier t-${e.tier}">${esc(e.tierLabel)}</span>
      <span class="stance ${sup.cls}">${sup.label}</span>
      <span class="evidence-meta">${pub} · ${dateText}</span>
    </div>
    <p class="evidence-title">${esc(e.title)}</p>
    ${e.tier === "reference" ? `<p class="ref-warning">위키백과·나무위키·블로그 등 누구나 고칠 수 있는 자료입니다. 참고용으로만 보여 주며 판정의 핵심 근거로 쓰지 않습니다.</p>` : ""}
    <div class="checks">${checks}</div>
    ${e.checkNote ? `<p class="check-note">${esc(e.checkNote)}</p>` : ""}
    ${quoteHtml}
    <details class="ev-snippet"><summary>검색된 원문 발췌 보기</summary><p>${esc(e.snippet)}</p></details>
    ${links}
  </li>`;
}

// 근거 번호 [1] [2] 를 해당 근거 카드로 가는 링크로
function refs(ids) {
  return (ids || []).map((id) => `<a class="src-ref" href="#ev-${id}">[${id}]</a>`).join("");
}

// 출처 페이지에서 해당 문장 위치로 바로 가는 주소 (Text Fragment)
function fragmentUrl(url, quote) {
  const enc = (s) => encodeURIComponent(s.trim()).replace(/-/g, "%2D").replace(/,/g, "%2C");
  const q = quote.replace(/\s+/g, " ").trim();
  let frag;
  if (q.length <= 60) frag = enc(q);
  else frag = `${enc(q.slice(0, 30).replace(/\s+\S*$/, ""))},${enc(q.slice(-25).replace(/^\S*\s+/, ""))}`;
  return url.replace(/#.*$/, "") + "#:~:text=" + frag;
}

// 낱말 단위로 두 문장을 비교해 바뀐 부분을 표시
function diffWords(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/);
  const n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, left = "", right = "";
  while (i < n && j < m) {
    if (A[i] === B[j]) { left += esc(A[i]); right += esc(B[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { left += mark("del", A[i]); i++; }
    else { right += mark("ins", B[j]); j++; }
  }
  while (i < n) left += mark("del", A[i++]);
  while (j < m) right += mark("ins", B[j++]);
  return { left, right };
}
function mark(tag, s) { return /^\s+$/.test(s) ? esc(s) : `<${tag}>${esc(s)}</${tag}>`; }

// ---------------- 결과 복사 ----------------
async function copyResult() {
  if (!lastResult) return;
  const r = lastResult;
  const ids = (a) => (a || []).map((i) => `[${i}]`).join("");
  const c = r.criteria || {};
  const lines = [
    "[ONA FactCheck 결과]",
    `주장: ${r.claim}`,
    `판정: ${VERDICTS[r.verdict].label}`,
    `검증 기준 날짜: ${r.checkedAt}`,
    c.timeframe ? `주장의 기준 시점: ${c.timeframe}` : "",
    `요약: ${r.summary}`,
    ...(r.adjustments?.length ? ["", "■ 자동 점검 안내", ...r.adjustments] : []),
    "",
    "■ 판정 이유",
    ...r.reasoning.map((p) => `${p.text} ${ids(p.sourceIds)}`),
    ...(r.conflicts.length ? ["", "■ 자료 간 충돌", ...r.conflicts.map((x) => `${x.text} ${ids(x.sourceIds)}`)] : []),
    "",
    "■ 핵심 근거",
    ...(r.evidence.length
      ? r.evidence.map((e) => `[${e.id}] (${e.tierLabel} / ${SUPPORTS[e.support].label}) ${e.title} - ${e.publisher}, ${e.date || "날짜 미상"}\n    ${e.quoteVerified ? `인용: "${e.quote}"\n    ${e.quoteTranslation ? `번역: ${e.quoteTranslation}\n    ` : ""}` : ""}${e.url}`)
      : ["관련 근거를 찾지 못했습니다"]),
    "",
    "■ 수정 제안",
    r.suggestion.shown ? `원문: ${r.suggestion.original}\n수정: ${r.suggestion.text} ${ids(r.suggestion.sourceIds)}` : (r.suggestion.reason || "수정 제안 없음"),
    "",
    "※ AI 판정은 참고 자료이며, 최종 판단은 기자·데스크가 합니다.",
  ];
  try {
    await navigator.clipboard.writeText(lines.filter((l) => l !== "").join("\n").replace(/\n■/g, "\n\n■"));
    showToast("결과를 복사했습니다. 메신저나 메일에 붙여 넣으세요.");
  } catch {
    showToast("복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
  }
}

// ---------------- 예시 화면 ----------------
function showSample() {
  const claim = "에베레스트산의 높이는 8,848m로 세계에서 가장 높은 산이다.";
  els.claim.value = claim;
  els.claim.dispatchEvent(new Event("input"));
  hideError();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  renderResult({
    claim, checkedAt: today, verdict: "MOSTLY_TRUE",
    summary: "세계 최고봉이라는 점은 맞지만, 최신 공식 측정값은 8,848.86m입니다.",
    criteria: { timeframe: "명시 안 됨 (현재 기준으로 해석)", region: "네팔·중국 국경", subject: "에베레스트산 해발고도" },
    reasoning: [
      { text: "에베레스트산이 해발고도 기준 세계에서 가장 높은 산이라는 점은 자료에서 확인됩니다.", sourceIds: [2] },
      { text: "다만 2020년 네팔·중국 공동 발표에 따른 최신 높이는 8,848.86m로, 주장의 8,848m는 과거 측정값입니다.", sourceIds: [1] },
    ],
    conflicts: [],
    adjustments: [],
    evidence: [
      { id: 1, title: "(예시) 에베레스트 새 공식 높이 발표", url: "https://example.com/everest-height", tier: "primary", tierLabel: "1차 자료",
        publisher: "예시 정부기관", publisherSource: "known", date: "2020-12-08", dateSource: "search", support: "CONTRADICTS",
        checks: { date: "NA", region: "MATCH", subject: "MATCH", figure: "MISMATCH" },
        checkNote: "같은 대상의 높이를 다루지만, 수치가 8,848.86m로 주장과 다릅니다.",
        quote: "네팔과 중국은 에베레스트의 새 높이를 8,848.86m로 공동 발표했다.", quoteVerified: true, quoteRejected: "",
        snippet: "(예시 원문) 네팔과 중국은 에베레스트의 새 높이를 8,848.86m로 공동 발표했다. …" },
      { id: 2, title: "(예시) 세계의 고산 목록", url: "https://example.com/highest-mountains", tier: "news", tierLabel: "언론 보도",
        publisher: "예시 신문", publisherSource: "known", date: "", dateSource: "", support: "PARTIAL_SUPPORT",
        checks: { date: "NA", region: "MATCH", subject: "MATCH", figure: "UNKNOWN" },
        checkNote: "세계 최고봉이라는 점은 뒷받침하지만 높이 수치는 나오지 않습니다.",
        quote: "에베레스트산은 해발고도 기준 세계 최고봉이다.", quoteVerified: true, quoteRejected: "",
        snippet: "(예시 원문) 에베레스트산은 해발고도 기준 세계 최고봉이다. …" },
    ],
    suggestion: { shown: true, original: claim, text: "에베레스트산의 높이는 8,848.86m(2020년 네팔·중국 공동 측정)로 세계에서 가장 높은 산이다.", sourceIds: [1, 2], note: "높이를 최신 공식 측정값으로 바꾸고 측정 시점을 덧붙였습니다.", reason: "" },
  }, true);
}

// ---------------- 작은 도우미 ----------------
class FriendlyError extends Error {
  constructor(message, hint) { super(message); this.hint = hint; }
}
function showError(title, hint = "") {
  els.errorBox.innerHTML = `<strong>${esc(title)}</strong>${esc(hint)}`;
  els.errorBox.hidden = false;
}
function hideError() { els.errorBox.hidden = true; }
function setRunning(on) {
  isRunning = on;
  els.checkBtn.disabled = on;
  els.sampleBtn.disabled = on;
  els.loading.hidden = !on;
}
function setStep(text) { els.loadingStep.textContent = text; }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
let toastTimer;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), 2600);
}

// 시작
checkServer();
