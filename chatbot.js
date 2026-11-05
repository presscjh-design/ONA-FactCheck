/* =========================================================
   ONA FactCheck 챗봇 화면 파일 (브라우저에서 실행)
   ---------------------------------------------------------
   이 파일에는 API 키가 없습니다. 메시지를 서버(/api/chat)로
   보내고 답을 보여 줄 뿐입니다. 판정 등급 이름 등은 app.js의
   VERDICTS, SUPPORTS, esc()를 함께 사용합니다.
   대화 내용은 이 화면에만 있고 새로고침하면 사라집니다.
   ========================================================= */
(function () {
  const MAX_MESSAGE = 8000;
  const SUGGESTIONS = [
    "어떻게 작동해?",
    "2023년 한국의 합계출산율은 0.72명이라는 게 사실이야?",
  ];
  const chat = {
    open: false, busy: false,
    history: [],        // 최근 대화 [{role, text}]
    lastClaim: "",      // 후속 질문이 이어받을 주장
    lastScope: null,    // 직전 검색 범위
    lastCheck: null,    // 직전 판정 결과 (전체)
  };

  // ---------------- 화면 만들기 ----------------
  const fab = document.createElement("button");
  fab.type = "button";
  fab.id = "chatFab";
  fab.className = "chat-fab";
  fab.setAttribute("aria-label", "취재 도우미 열기");
  fab.setAttribute("aria-expanded", "false");
  fab.setAttribute("aria-controls", "chatPanel");
  fab.innerHTML = `
    <svg class="ico-open" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17h0A1.5 1.5 0 0 1 4 15.5z"/></svg>
    <svg class="ico-close" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M6 6l12 12M18 6 6 18"/></svg>`;

  const panel = document.createElement("section");
  panel.id = "chatPanel";
  panel.className = "chat-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "취재 도우미");
  panel.innerHTML = `
    <header class="chat-head">
      <div>
        <strong>취재 도우미</strong>
        <span>판정은 참고용이며 출처 확인이 필요합니다</span>
      </div>
      <button type="button" id="chatReset" class="chat-reset">새 대화</button>
    </header>
    <div id="chatLog" class="chat-log" aria-live="polite"></div>
    <form id="chatForm" class="chat-form">
      <textarea id="chatInput" rows="2" maxlength="${MAX_MESSAGE}" aria-label="메시지 입력"
        placeholder="주장, 질문, 기사 문단을 입력하세요"></textarea>
      <button type="submit" id="chatSend" class="chat-send">보내기</button>
    </form>`;
  document.body.append(panel, fab);

  const log = panel.querySelector("#chatLog");
  const input = panel.querySelector("#chatInput");
  const sendBtn = panel.querySelector("#chatSend");

  // ---------------- 열기·닫기 ----------------
  function setOpen(open) {
    chat.open = open;
    panel.hidden = !open;
    fab.classList.toggle("is-open", open);
    fab.setAttribute("aria-expanded", String(open));
    fab.setAttribute("aria-label", open ? "취재 도우미 닫기" : "취재 도우미 열기");
    if (open) { if (!log.childElementCount) greet(); input.focus(); scrollDown(); }
  }
  fab.addEventListener("click", () => setOpen(!chat.open));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && chat.open) { setOpen(false); fab.focus(); }
  });

  function greet() {
    addBot(`<p>확인할 주장, 궁금한 점, 기사나 보도자료 문단을 보내 주세요.</p>
      <p class="chat-tip">예: '정부 자료로만', '최근 한 달 기사로', '대구·경북 언론으로'처럼 검색 범위를 지정할 수 있습니다.</p>`);
    const row = document.createElement("div");
    row.className = "chat-suggest";
    for (const s of SUGGESTIONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s;
      b.addEventListener("click", () => { row.remove(); send(s); });
      row.append(b);
    }
    log.append(row);
  }

  panel.querySelector("#chatReset").addEventListener("click", () => {
    if (chat.busy) return;
    Object.assign(chat, { history: [], lastClaim: "", lastScope: null, lastCheck: null });
    log.innerHTML = "";
    greet();
    input.focus();
  });

  // ---------------- 입력 ----------------
  panel.querySelector("#chatForm").addEventListener("submit", (e) => {
    e.preventDefault();
    send(input.value);
  });
  input.addEventListener("keydown", (e) => {
    // 한글 조합 중 Enter는 글자 확정이므로 보내지 않음
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      send(input.value);
    }
  });

  function send(value) {
    const message = String(value || "").trim();
    if (!message || chat.busy) return;
    input.value = "";
    addUser(message);
    remember("user", message);
    request({ message });
  }

  // 기사에서 뽑은 문장을 눌렀을 때: 메시지 판단 없이 그 문장만 검증
  function checkClaim(claim, scope) {
    if (chat.busy) return false;
    addUser(claim);
    remember("user", claim);
    request({ action: "check", claim, scope });
    return true;
  }

  // ---------------- 서버와 대화 ----------------
  async function request(payload) {
    if (location.protocol === "file:") {
      addBot(`<p>서버를 통해 접속해야 챗봇을 쓸 수 있습니다.</p>`);
      return;
    }
    setBusy(true);
    syncWithScreen();
    const wait = addProgress("메시지를 살펴보고 있습니다…");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, context: buildContext() }),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({}));
        throw new ChatError(e.error || `서버 오류가 발생했습니다. (코드 ${res.status})`, e.hint);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", answer = null;
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
          if (msg.type === "progress") wait.update(msg.step);
          else if (msg.type === "result") answer = msg.message;
          else if (msg.type === "error") throw new ChatError(msg.error, msg.hint);
        }
      }
      if (!answer) throw new ChatError("서버에서 답을 받지 못했습니다.", "다시 시도해 주세요.");
      wait.remove();
      show(answer);
    } catch (err) {
      console.error(err);
      wait.remove();
      if (err instanceof ChatError) addBot(`<p class="chat-error">${esc(err.message)}</p>${err.hint ? `<p class="chat-tip">${esc(err.hint)}</p>` : ""}`);
      else addBot(`<p class="chat-error">서버와 연결이 끊겼습니다.</p><p class="chat-tip">서버가 켜져 있는지 확인하고 다시 시도해 주세요.</p>`);
    } finally {
      setBusy(false);
    }
  }
  class ChatError extends Error {
    constructor(message, hint) { super(message); this.hint = hint || ""; }
  }

  // 화면 위쪽에서 직접 실행한 판정이 더 최근이면 그 결과를 이어받음 (예시 화면은 제외)
  function syncWithScreen() {
    const banner = document.getElementById("sampleBanner");
    if (!lastResult || lastResult === chat.lastCheck || (banner && !banner.hidden)) return;
    chat.lastCheck = lastResult;
    chat.lastClaim = lastResult.claim;
    chat.lastScope = null;
  }

  function buildContext() {
    const r = chat.lastCheck;
    return {
      history: chat.history.slice(0, -1).slice(-8),
      lastClaim: chat.lastClaim,
      lastScope: chat.lastScope,
      lastCheck: r ? {
        claim: r.claim, verdict: r.verdict, summary: r.summary, checkedAt: r.checkedAt,
        reasoning: r.reasoning, conflicts: r.conflicts, adjustments: r.adjustments,
        evidence: (r.evidence || []).map((e) => ({
          id: e.id, title: e.title, publisher: e.publisher, tierLabel: e.tierLabel, date: e.date,
          support: e.support, quote: e.quote, quoteTranslation: e.quoteTranslation,
          checks: e.checks, checkNote: e.checkNote, snippet: e.snippet,
        })),
      } : null,
    };
  }

  function remember(role, text) {
    chat.history.push({ role, text: String(text).slice(0, 800) });
    if (chat.history.length > 12) chat.history.splice(0, chat.history.length - 12);
  }

  // ---------------- 답변 표시 ----------------
  function show(m) {
    if (m.kind === "check") return showCheck(m);
    if (m.kind === "claims") return showClaims(m);
    if (m.kind === "qa") {
      remember("bot", m.text);
      addBot(`${paragraphs(m.text)}<p class="chat-tip">직전 판정의 근거 ${Number(m.usedOnly) || 0}건만 사용했습니다. 새로 검색하지 않았습니다.</p>`);
      return;
    }
    remember("bot", m.text);
    addBot(paragraphs(m.text));
  }

  function showCheck(m) {
    const r = m.result;
    chat.lastCheck = r;
    chat.lastClaim = m.claim;
    chat.lastScope = m.scope || null;
    const v = VERDICTS[r.verdict] || VERDICTS.PENDING;
    remember("bot", `판정: ${v.label}. 주장: ${m.claim}. ${r.summary}`);

    const f = m.followup;
    const followHtml = f ? `
      <div class="chat-follow">
        <span class="chat-tag">이전 주장 이어받음</span>
        ${f.inherited.length ? `<p><b>이어받은 조건</b> ${esc(f.inherited.join(" · "))}</p>` : ""}
        ${f.changed.length ? `<p><b>변경된 조건</b> ${f.changed.map((c) => `${esc(c.condition)}: ${esc(c.from)} → <mark>${esc(c.to)}</mark>`).join(" · ")}</p>` : ""}
      </div>` : "";

    const s = m.scopeInfo || {};
    const scopeHtml = `
      <div class="chat-scope">
        <p><b>적용한 검색 범위</b> ${esc(s.label || "")}</p>
        ${(s.applied || []).length ? `<p>${esc(s.applied.join(" · "))}</p>` : ""}
        ${(s.limitations || []).map((x) => `<p class="chat-limit">${esc(x)}</p>`).join("")}
      </div>`;

    const notes = [...(m.notes || []), ...(r.adjustments || [])];
    const evidence = (r.evidence || []).filter((e) => e.support !== "IRRELEVANT");

    const el = addBot(`
      ${followHtml}
      <div class="chat-verdict"><span class="verdict-badge ${v.cls}">${esc(v.label)}</span></div>
      <blockquote class="chat-claim">${esc(m.claim)}</blockquote>
      <p>${esc(r.summary)}</p>
      ${scopeHtml}
      ${notes.length ? `<ul class="chat-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
      ${evidence.length ? `<h4 class="chat-sub">근거 자료 ${evidence.length}건</h4><ol class="chat-evidence">${evidence.map(evidenceItem).join("")}</ol>` : `<p class="chat-tip">표시할 근거 자료가 없습니다.</p>`}
      <button type="button" class="chat-full">전체 화면에서 보기</button>`);
    log.scrollTop = el.offsetTop - log.offsetTop - 8;   // 긴 결과는 판정이 먼저 보이도록 맨 위부터
    el.querySelector(".chat-full").addEventListener("click", () => {
      renderResult(r, false);
      if (window.matchMedia("(max-width: 640px)").matches) setOpen(false);
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function evidenceItem(e) {
    const support = SUPPORTS[e.support] || SUPPORTS.CONTEXT;
    const quote = e.quote ? `<q>${esc(e.quote)}</q>${e.quoteTranslation ? `<span class="chat-trans">${esc(e.quoteTranslation)}</span>` : ""}` : "";
    return `<li>
      <p class="chat-ev-head"><b>[근거 ${Number(e.id)}]</b> ${esc(e.publisher || e.host)} · ${esc(e.tierLabel)}${e.date ? ` · ${esc(e.date)}` : ""} · ${esc(support.label)}</p>
      ${quote}
      ${safeUrl(e.url) ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title || e.url)}</a>` : ""}
    </li>`;
  }

  function showClaims(m) {
    remember("bot", m.text);
    const el = addBot(`${paragraphs(m.text)}<div class="chat-claims"></div>`);
    const box = el.querySelector(".chat-claims");
    for (const c of m.claims) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chat-claim-btn";
      b.textContent = c.text;
      if (c.unclear) b.classList.add("is-unclear");
      b.addEventListener("click", () => {
        if (c.unclear) {   // 날짜가 불분명한 문장은 바로 검색하지 않고 기자가 고치도록 입력창에 넣음
          input.value = `${c.text} 사실이야?`;
          input.focus();
          return;
        }
        if (checkClaim(c.text, m.scope)) { b.disabled = true; b.classList.add("is-done"); }
      });
      box.append(b);
      if (c.note) {
        const n = document.createElement("p");
        n.className = "chat-limit";
        n.textContent = c.note;
        box.append(n);
      }
    }
    log.scrollTop = el.offsetTop - log.offsetTop - 8;
  }

  // ---------------- 말풍선 ----------------
  function addUser(text) {
    const el = document.createElement("div");
    el.className = "chat-msg user";
    el.textContent = text;
    log.append(el);
    scrollDown();
  }
  function addBot(html) {
    const el = document.createElement("div");
    el.className = "chat-msg bot";
    el.innerHTML = html;   // html은 모두 esc()로 처리한 값만 넣습니다
    log.append(el);
    scrollDown();
    return el;
  }
  function addProgress(text) {
    const el = document.createElement("div");
    el.className = "chat-msg bot chat-progress";
    el.innerHTML = `<span class="chat-dot" aria-hidden="true"></span><span></span>`;
    el.lastChild.textContent = text;
    log.append(el);
    scrollDown();
    return {
      update(t) { el.lastChild.textContent = t; scrollDown(); },
      remove() { el.remove(); },
    };
  }
  function setBusy(busy) {
    chat.busy = busy;
    sendBtn.disabled = busy;
  }
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  // 줄바꿈을 문단으로 바꾸고, [근거 n]을 해당 출처 링크로 연결
  function paragraphs(text) {
    return String(text).split(/\n+/).filter(Boolean).map((p) => `<p>${linkCitations(esc(p))}</p>`).join("");
  }
  function linkCitations(html) {
    return html.replace(/\[근거\s*(\d+)\]/g, (whole, n) => {
      const e = (chat.lastCheck?.evidence || []).find((x) => x.id === Number(n));
      return e && safeUrl(e.url)
        ? `<a class="chat-cite" href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">[근거 ${Number(n)}]</a>`
        : `<span class="chat-cite">[근거 ${Number(n)}]</span>`;
    });
  }
  function safeUrl(u) { return /^https?:\/\//i.test(String(u || "")); }
})();
