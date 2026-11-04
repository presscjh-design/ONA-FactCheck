/* =========================================================
   ONA FactCheck 팩트체크 규칙 파일 (서버에서만 실행됨)
   ---------------------------------------------------------
   1) Tavily로 근거 자료 검색
   2) 출처 신뢰도 분류 (1차 자료 우선)
   3) Gemini로 주장과 근거 비교
   4) AI 답변을 프로그램이 다시 검사 (번호·인용문·날짜/지역/대상/수치 일치)

   편집국에서 자주 고칠 부분:
   - PRIMARY_DOMAINS, PUBLIC_DOMAINS, NEWS_DOMAINS : 출처 분류 목록
   - PUBLISHER_NAMES : 사이트 주소 → 기관·매체 이름
   - SYSTEM_PROMPT : AI에게 주는 판정 지시문
   ========================================================= */

export const SETTINGS = {
  maxEvidence: 5,          // 화면에 보여 줄 근거 자료 최대 개수
  searchResultsEach: 8,    // 검색 1회당 받아 올 결과 수 (두 번 검색 후 합쳐서 5건 선택)
  minRelevance: 0.15,      // Tavily 관련도 점수가 이보다 낮은 자료는 제외
  maxContentChars: 4000,   // 자료 1건당 AI에게 넘길 본문 최대 길이
  tavilyTimeoutMs: 30000,
  geminiTimeoutMs: 120000,
};

// ---------------- 출처 분류 목록 ----------------
// 나라별 정부 공식 사이트 주소 (ISO 국가 코드 → 주소 끝부분)
export const COUNTRY_OFFICIAL_DOMAINS = {
  KR: ["go.kr", "korea.kr"], CN: ["gov.cn"], TW: ["gov.tw"], HK: ["gov.hk"], MO: ["gov.mo"],
  JP: ["go.jp"], US: ["gov"], GB: ["gov.uk"], FR: ["gouv.fr"], DE: ["bund.de"],
  CA: ["gc.ca", "canada.ca"], AU: ["gov.au"], NZ: ["govt.nz"], SG: ["gov.sg"],
  VN: ["gov.vn"], TH: ["go.th"], PH: ["gov.ph"], ID: ["go.id"], MY: ["gov.my"],
  IN: ["gov.in", "nic.in"], RU: ["gov.ru"], ES: ["gob.es"], IT: ["gov.it"],
  MX: ["gob.mx"], BR: ["gov.br"], EU: ["europa.eu"],
};

// 1차 자료: 정부·공공기관·국제기구의 공식 자료
export const PRIMARY_DOMAINS = [
  "kosis.kr", "bok.or.kr",
  ...Object.values(COUNTRY_OFFICIAL_DOMAINS).flat(),
  "int", "oecd.org", "un.org", "worldbank.org", "imf.org",
];

// 참고 자료: 누구나 고칠 수 있는 백과사전, 개인 블로그, 커뮤니티, SNS
// → 화면에 '참고 자료'로 표시하고, 판정의 핵심 근거로는 쓰지 않습니다.
export const REFERENCE_DOMAINS = [
  "wikipedia.org", "wikiwand.com", "namu.wiki", "namu.moe", "fandom.com",
  "baike.baidu.com", "baike.sogou.com", "zhihu.com",
  "blog.naver.com", "m.blog.naver.com", "cafe.naver.com", "kin.naver.com", "post.naver.com",
  "tistory.com", "brunch.co.kr", "velog.io", "blog.daum.net", "cafe.daum.net",
  "medium.com", "blogspot.com", "wordpress.com", "substack.com", "quora.com", "reddit.com",
  "dcinside.com", "fmkorea.com", "theqoo.net", "clien.net", "ruliweb.com",
  "youtube.com", "x.com", "twitter.com", "facebook.com", "instagram.com", "threads.net", "tiktok.com",
];
// 공공·연구기관: 국책연구기관, 공공기관, 대학
export const PUBLIC_DOMAINS = [
  "re.kr", "ac.kr", "edu",
  "nhis.or.kr", "hira.or.kr", "nps.or.kr", "kotra.or.kr", "kdi.re.kr",
];
// 언론 보도
export const NEWS_DOMAINS = [
  "yna.co.kr", "yonhapnewstv.co.kr", "kbs.co.kr", "mbc.co.kr", "imbc.com", "sbs.co.kr",
  "jtbc.co.kr", "ytn.co.kr", "mbn.co.kr", "ichannela.com", "tvchosun.com",
  "chosun.com", "joongang.co.kr", "donga.com", "hani.co.kr", "khan.co.kr",
  "hankookilbo.com", "kmib.co.kr", "seoul.co.kr", "segye.com", "munhwa.com",
  "mk.co.kr", "hankyung.com", "sedaily.com", "edaily.co.kr", "mt.co.kr", "fnnews.com",
  "newsis.com", "news1.kr", "ohmynews.com", "pressian.com", "nocutnews.co.kr",
  "bbc.com", "bbc.co.uk", "reuters.com", "apnews.com", "nytimes.com",
  "washingtonpost.com", "ft.com", "bloomberg.com", "wsj.com", "theguardian.com",
];

export const PUBLISHER_NAMES = {
  "kostat.go.kr": "통계청", "mods.go.kr": "국가데이터처", "kosis.kr": "국가통계포털(KOSIS)",
  "korea.kr": "대한민국 정책브리핑", "data.go.kr": "공공데이터포털", "law.go.kr": "국가법령정보센터",
  "bok.or.kr": "한국은행", "ecos.bok.or.kr": "한국은행 경제통계시스템",
  "moef.go.kr": "기획재정부", "mohw.go.kr": "보건복지부", "moel.go.kr": "고용노동부",
  "me.go.kr": "환경부", "molit.go.kr": "국토교통부", "motie.go.kr": "산업통상자원부",
  "moe.go.kr": "교육부", "mois.go.kr": "행정안전부", "mofa.go.kr": "외교부",
  "mnd.go.kr": "국방부", "moj.go.kr": "법무부", "msit.go.kr": "과학기술정보통신부",
  "mafra.go.kr": "농림축산식품부", "mof.go.kr": "해양수산부", "mcst.go.kr": "문화체육관광부",
  "mogef.go.kr": "여성가족부", "unikorea.go.kr": "통일부", "mss.go.kr": "중소벤처기업부",
  "kdca.go.kr": "질병관리청", "kma.go.kr": "기상청", "police.go.kr": "경찰청",
  "nec.go.kr": "중앙선거관리위원회", "assembly.go.kr": "국회", "nabo.go.kr": "국회예산정책처",
  "ftc.go.kr": "공정거래위원회", "fsc.go.kr": "금융위원회", "fss.or.kr": "금융감독원",
  "president.go.kr": "대통령실", "opm.go.kr": "국무조정실", "scourt.go.kr": "대법원",
  "kdi.re.kr": "한국개발연구원(KDI)", "nhis.or.kr": "국민건강보험공단",
  "hira.or.kr": "건강보험심사평가원", "nps.or.kr": "국민연금공단",
  // 중국·대만·홍콩
  "gov.cn": "중국 정부", "www.gov.cn": "중국 국무원", "nia.gov.cn": "중국 국가이민관리국",
  "mps.gov.cn": "중국 공안부", "gwytb.gov.cn": "중국 국무원 대만사무판공실", "taiwan.cn": "중국 대만망(국무원 대만판공실 운영)",
  "mfa.gov.cn": "중국 외교부", "npc.gov.cn": "중국 전국인민대표대회", "stats.gov.cn": "중국 국가통계국",
  "gov.tw": "대만 정부", "mac.gov.tw": "대만 대륙위원회", "immigration.gov.tw": "대만 내정부 이민서",
  "boca.gov.tw": "대만 외교부 영사사무국", "mofa.gov.tw": "대만 외교부", "moi.gov.tw": "대만 내정부",
  "gov.hk": "홍콩 특별행정구 정부", "immd.gov.hk": "홍콩 입경처",
  // 일본·미국·영국
  "go.jp": "일본 정부", "mofa.go.jp": "일본 외무성", "moj.go.jp": "일본 법무성", "isa.go.jp": "일본 출입국재류관리청",
  "state.gov": "미국 국무부", "travel.state.gov": "미국 국무부 영사국", "uscis.gov": "미국 이민국(USCIS)",
  "dhs.gov": "미국 국토안보부", "cbp.gov": "미국 세관국경보호청", "gov.uk": "영국 정부",
  "oecd.org": "OECD", "un.org": "유엔(UN)", "who.int": "세계보건기구(WHO)",
  "worldbank.org": "세계은행", "imf.org": "국제통화기금(IMF)", "europa.eu": "유럽연합(EU)",
  "yna.co.kr": "연합뉴스", "kbs.co.kr": "KBS", "mbc.co.kr": "MBC", "imbc.com": "MBC",
  "sbs.co.kr": "SBS", "jtbc.co.kr": "JTBC", "ytn.co.kr": "YTN", "mbn.co.kr": "MBN",
  "chosun.com": "조선일보", "joongang.co.kr": "중앙일보", "donga.com": "동아일보",
  "hani.co.kr": "한겨레", "khan.co.kr": "경향신문", "hankookilbo.com": "한국일보",
  "kmib.co.kr": "국민일보", "seoul.co.kr": "서울신문", "segye.com": "세계일보",
  "munhwa.com": "문화일보", "mk.co.kr": "매일경제", "hankyung.com": "한국경제",
  "sedaily.com": "서울경제", "edaily.co.kr": "이데일리", "mt.co.kr": "머니투데이",
  "newsis.com": "뉴시스", "news1.kr": "뉴스1", "ohmynews.com": "오마이뉴스",
  "bbc.com": "BBC", "bbc.co.uk": "BBC", "reuters.com": "로이터", "apnews.com": "AP통신",
  "nytimes.com": "뉴욕타임스", "bloomberg.com": "블룸버그", "theguardian.com": "가디언",
};

// Tavily '1차 자료 우선 검색'에 넘길 사이트 목록
const PRIMARY_SEARCH_DOMAINS = [
  "go.kr", "korea.kr", "kosis.kr", "bok.or.kr", "kdi.re.kr",
  "oecd.org", "un.org", "who.int", "worldbank.org", "imf.org", "europa.eu",
];

export const TIERS = {
  primary:   { rank: 1, label: "1차 자료" },
  public:    { rank: 2, label: "공공·연구기관" },
  news:      { rank: 3, label: "언론 보도" },
  other:     { rank: 4, label: "기타" },
  reference: { rank: 5, label: "참고 자료" },   // 위키·블로그 등
};

// 주장의 주제 분류
export const TOPICS = {
  LAW_POLICY: "법률·정책·제도·출입국 규정",
  STATISTICS: "통계·수치",
  EVENT: "사건·발언·사실관계",
  SCIENCE_HEALTH: "과학·건강",
  OTHER: "기타",
};

// ---------------- AI 지시문 ----------------
const SYSTEM_PROMPT = `당신은 한국 언론사 뉴스룸의 팩트체크 담당 기자입니다.
기자가 기사에 넣으려는 주장을, 함께 제공되는 [검색 자료]만 근거로 검증합니다.

절대 원칙
1. 판단은 오직 [검색 자료]에 적힌 내용만 근거로 합니다. 당신이 알고 있는 지식이나 기억은 근거로 쓰지 않습니다.
2. 검색 자료에 없는 사실, 수치, 날짜, 기관명을 만들어 내지 않습니다.
3. URL은 절대 쓰지 않습니다. 자료는 번호([1], [2] …)로만 가리킵니다.
4. 근거가 부족하거나, 자료의 날짜·지역·대상·수치가 주장과 맞는지 확인할 수 없으면 PENDING(판단 유보)으로 판정합니다. 무리하게 사실로 판정하지 않습니다.
5. 자료끼리 내용이 충돌하면 conflicts에 무엇이 어떻게 다른지 설명합니다.
6. "1차 자료"(정부·공공기관·국제기구 공식 자료)를 가장 먼저, 가장 무겁게 검토합니다. 언론 보도는 1차 자료가 없을 때 보조로 씁니다.
7. 날짜와 적용 시점을 반드시 비교합니다. 주장이 말하는 시점(예: 2023년, 올해 1분기)과 자료가 다루는 시점이 다르면 그 자료로는 확정할 수 없습니다.
8. "참고 자료"(위키백과·나무위키·블로그·커뮤니티·SNS)는 누구나 고칠 수 있어 판정의 핵심 근거로 쓰지 않습니다. 배경 이해에만 쓰고, support는 CONTEXT로 표시합니다.
9. 법률·정책·제도·출입국 규정은 해당 국가 정부와 관계 기관의 공식 자료로만 확정합니다. 공식 자료가 없으면 언론 보도만으로 사실·사실 아님을 단정하지 말고 PENDING으로 판정합니다.
10. 외국어 자료(중국어·일본어·영어 등)도 똑같이 검토합니다. 판정 이유와 설명은 한국어로 씁니다.

자료별 점검 (sources 배열, 제공된 모든 자료에 대해 하나씩)
- support: 이 자료가 주장에 대해 갖는 의미
  DIRECT_SUPPORT(주장을 직접 뒷받침) / PARTIAL_SUPPORT(일부만 뒷받침) / CONTRADICTS(주장과 어긋남) / CONTEXT(배경 정보일 뿐 판정 근거는 아님) / IRRELEVANT(관련 없음)
- quote: 판단에 쓴 문장을 자료 "내용"에서 글자 그대로 복사합니다(200자 이내). 외국어 자료는 원래 언어 그대로 복사합니다. 바꿔 쓰거나 요약하지 않습니다. 쓸 문장이 없으면 빈 문자열.
- quote_translation: quote가 한국어가 아니면 한국어 번역, 한국어이면 빈 문자열.
- checks: 주장과 자료를 네 가지 기준으로 비교합니다.
  date(기준 시점), region(지역·국가), subject(대상·집단·지표의 정의), figure(수치)
  각각 MATCH(일치) / MISMATCH(불일치) / UNKNOWN(자료에서 확인 불가) / NA(주장에 해당 요소가 없음) 중 하나
- check_note: 점검 결과를 한두 문장으로 설명 (특히 MISMATCH, UNKNOWN인 이유)
- source_date: 자료 내용에서 확인되는 작성일 또는 통계 기준 시점. 없으면 빈 문자열.
- publisher: 자료 내용에서 확인되는 발행 기관·매체. 없으면 빈 문자열.

판정 등급 (verdict)
- TRUE(사실): 주장 전체가 1차 자료 등 신뢰할 근거와 일치
- MOSTLY_TRUE(대체로 사실): 핵심은 맞지만 사소한 부정확·누락이 있음
- HALF_TRUE(일부 사실): 맞는 부분과 틀리거나 오해 소지가 있는 부분이 섞임
- MOSTLY_FALSE(대체로 사실 아님): 일부 맞는 요소가 있으나 핵심이 근거와 어긋남
- FALSE(사실 아님): 핵심 내용이 근거와 명백히 어긋남
- PENDING(판단 유보): 근거 부족, 시점·지역·대상 확인 불가, 자료 충돌로 결론을 낼 수 없음

판정 이유 (reasoning): 문단마다 근거로 쓴 자료 번호를 source_ids에 넣습니다. 근거 번호가 없는 문장은 쓰지 않습니다.

수정 제안 (suggestion)
- 판정이 TRUE 또는 PENDING이면 needed=false.
- 그 밖에는 원문을 최소한으로 고쳐, 확인된 근거에 있는 사실만으로 정확한 문장을 씁니다. 사용한 자료 번호를 source_ids에 넣습니다.
- 근거만으로 정확한 문장을 만들 수 없으면 needed=false로 하고 note에 이유를 씁니다.

모든 설명은 한국어로, 기사체에 가깝게 간결하게 씁니다.`;

// Gemini가 따라야 할 답변 형식
const ENUM_CHECK = { type: "string", enum: ["MATCH", "MISMATCH", "UNKNOWN", "NA"] };
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["TRUE", "MOSTLY_TRUE", "HALF_TRUE", "MOSTLY_FALSE", "FALSE", "PENDING"] },
    summary: { type: "string" },
    claim_timeframe: { type: "string", description: "주장이 말하는 기준 시점. 없으면 '명시 안 됨'" },
    claim_region: { type: "string", description: "주장이 말하는 지역·국가. 없으면 '명시 안 됨'" },
    claim_subject: { type: "string", description: "주장이 말하는 대상·지표" },
    reasoning: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, source_ids: { type: "array", items: { type: "integer" } } },
        required: ["text", "source_ids"],
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        properties: { description: { type: "string" }, source_ids: { type: "array", items: { type: "integer" } } },
        required: ["description", "source_ids"],
      },
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          support: { type: "string", enum: ["DIRECT_SUPPORT", "PARTIAL_SUPPORT", "CONTRADICTS", "CONTEXT", "IRRELEVANT"] },
          quote: { type: "string" },
          quote_translation: { type: "string" },
          source_date: { type: "string" },
          publisher: { type: "string" },
          checks: {
            type: "object",
            properties: { date: ENUM_CHECK, region: ENUM_CHECK, subject: ENUM_CHECK, figure: ENUM_CHECK },
            required: ["date", "region", "subject", "figure"],
          },
          check_note: { type: "string" },
        },
        required: ["id", "support", "quote", "quote_translation", "source_date", "publisher", "checks", "check_note"],
      },
    },
    suggestion: {
      type: "object",
      properties: {
        needed: { type: "boolean" },
        text: { type: "string" },
        source_ids: { type: "array", items: { type: "integer" } },
        note: { type: "string" },
      },
      required: ["needed", "text", "source_ids", "note"],
    },
  },
  required: ["verdict", "summary", "claim_timeframe", "claim_region", "claim_subject",
             "reasoning", "conflicts", "sources", "suggestion"],
};

// ---------------- 공개 함수: 팩트체크 전체 과정 ----------------
/**
 * @param {string} claim  검증할 주장
 * @param {{tavilyKey:string, geminiKey:string, geminiModel:string}} keys
 * @param {(step:string)=>void} onProgress  진행 상황 알림
 */
export async function runFactCheck(claim, keys, onProgress = () => {}) {
  const checkedAt = todayKST();

  onProgress("주장의 주제와 관련 국가를 파악하고 검색어를 정하고 있습니다…");
  const plan = await planSearch(claim, keys);

  const langText = plan.queries.filter((q) => q.lang_code !== "ko").map((q) => q.lang_label).join("·");
  onProgress(`정부·관계기관 공식 자료를 우선 검색하고 있습니다…${langText ? ` (한국어·${langText})` : ""}`);
  const { sources, searchInfo } = await searchEvidence(claim, plan, keys.tavilyKey, onProgress);

  if (sources.length === 0) {
    return {
      claim, checkedAt, noResults: true, searchInfo,
      verdict: "PENDING",
      summary: "관련 근거를 찾지 못했습니다.",
      criteria: { timeframe: "", region: "", subject: "" },
      reasoning: [{ text: "검색 결과에서 이 주장과 관련된 근거 자료를 찾지 못해 판단을 유보합니다. 표현을 바꾸거나 기관명·연도 등을 덧붙여 다시 검색해 보세요.", sourceIds: [] }],
      conflicts: [], evidence: [],
      suggestion: { shown: false, original: claim, text: "", sourceIds: [], note: "", reason: "근거 자료가 없어 수정 제안을 만들지 않았습니다." },
      adjustments: [],
    };
  }

  onProgress(`근거 자료 ${sources.length}건을 찾았습니다. Gemini가 주장과 비교하고 있습니다…`);
  const ai = await askGemini(claim, sources, checkedAt, keys, plan);

  onProgress("AI 판정을 근거 자료와 다시 대조하고 있습니다…");
  return { ...verifyAndBuild(claim, checkedAt, sources, ai, plan), searchInfo };
}

// ---------------- 0. 검색 계획 (주제·국가·공식 언어 검색어) ----------------
const PLAN_PROMPT = `당신은 언론사 팩트체크팀의 자료 조사 담당자입니다.
주장의 참·거짓은 판단하지 말고, 이 주장을 검증하려면 어디서 무엇을 검색해야 하는지만 계획합니다.

- topic: LAW_POLICY(법률·정책·제도·출입국/비자 규정·세금·규제) / STATISTICS(통계·수치) / EVENT(사건·발언) / SCIENCE_HEALTH / OTHER
- countries: 주장의 법률·정책·통계를 소관하는 국가·지역의 ISO 3166-1 alpha-2 코드 (예: 중국 CN, 대만 TW, 홍콩 HK, 일본 JP, 미국 US, 한국 KR, 유럽연합 EU). 최대 3개.
- queries: 검색어 2~4개.
  · 첫 번째는 핵심 낱말로 줄인 한국어 검색어.
  · 외국 제도·정책이면, 그 나라 정부가 실제로 쓰는 공식 용어로 공식 언어 검색어를 반드시 만듭니다.
    중국 본토는 简体中文, 대만·홍콩·마카오는 繁體中文, 일본은 日本語, 영어권은 English.
    (예: 대만 주민의 중국 본토 출입 → "台湾居民来往大陆通行证 入境 规定")
  · lang_code는 ko, zh-cn, zh-tw, ja, en 같은 코드, lang_label은 "중국어(간체)"처럼 한국어 이름.
- official_domains: 이 주제를 담당하는 정부·관계기관의 공식 웹사이트 주소(도메인만, 예: nia.gov.cn, mac.gov.tw). 확실히 아는 것만, 최대 8개. 모르면 빈 배열.`;

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string", enum: Object.keys(TOPICS) },
    countries: { type: "array", items: { type: "string" } },
    queries: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, lang_code: { type: "string" }, lang_label: { type: "string" } },
        required: ["text", "lang_code", "lang_label"],
      },
    },
    official_domains: { type: "array", items: { type: "string" } },
  },
  required: ["topic", "countries", "queries", "official_domains"],
};

async function planSearch(claim, keys) {
  const fallback = { topic: "OTHER", countries: [], queries: [], officialDomains: [], planned: false };
  try {
    const data = await generateJson(PLAN_PROMPT, `[주장]\n${claim}`, PLAN_SCHEMA, keys);
    const countries = [...new Set((data.countries || []).map((c) => String(c).toUpperCase().trim()))]
      .filter((c) => /^[A-Z]{2}$/.test(c)).slice(0, 3);
    const queries = (data.queries || [])
      .map((q) => ({ text: clean(q?.text).slice(0, 300), lang_code: clean(q?.lang_code).toLowerCase() || "ko", lang_label: clean(q?.lang_label) || "" }))
      .filter((q) => q.text).slice(0, 4);
    const officialDomains = [...new Set((data.official_domains || [])
      .map((d) => String(d).toLowerCase().trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
      .filter((d) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)))].slice(0, 8);
    return {
      topic: TOPICS[data.topic] ? data.topic : "OTHER",
      countries, queries, officialDomains, planned: true,
    };
  } catch (err) {
    console.log(`[검색 계획] 실패 - 기본 검색으로 진행합니다 (${err?.status || err?.name || ""})`);
    return fallback;
  }
}

// ---------------- 1. 검색 ----------------
async function searchEvidence(claim, plan, apiKey, onProgress) {
  const claimQuery = claim.replace(/\s+/g, " ").trim().slice(0, 380);
  const base = {
    search_depth: "advanced",
    chunks_per_source: 3,
    max_results: SETTINGS.searchResultsEach,
    include_published_date: true,
    include_answer: false,
    include_raw_content: false,
    topic: "general",
  };
  const foreign = plan.queries.filter((q) => q.lang_code !== "ko");
  const koPlan = plan.queries.find((q) => q.lang_code === "ko");

  // 공식 자료 검색 대상: 한국·국제기구 + 관련 국가 정부 사이트 + AI가 제안한 담당 기관 사이트
  const officialDomains = [...new Set([
    ...PRIMARY_SEARCH_DOMAINS,
    ...plan.countries.flatMap((c) => COUNTRY_OFFICIAL_DOMAINS[c] || []),
    ...plan.officialDomains,
  ])];
  const countryOfficial = [...new Set([
    ...plan.countries.flatMap((c) => COUNTRY_OFFICIAL_DOMAINS[c] || []),
    ...plan.officialDomains,
  ])];

  // 1차 검색 (동시에): ① 공식 사이트 한정(한국어) ② 공식 사이트 한정(현지 공식 언어) ③ 일반 웹
  const round1 = [
    tavilySearch({ ...base, query: claimQuery, include_domains: officialDomains }, apiKey),
    ...foreign.map((q) => tavilySearch({ ...base, query: q.text, include_domains: countryOfficial.length ? countryOfficial : officialDomains }, apiKey)),
    tavilySearch({ ...base, query: claimQuery, country: "south korea" }, apiKey),
  ];
  let all = await gather(round1);

  // 공식 자료가 부족하면 검색 범위 보완: 현지 언어 일반 검색 + 한국어 핵심어 검색(위키·블로그 제외)
  const officialCount = (list) => uniqueByUrl(list).filter((r) => ["primary", "public"].includes(classifyTier(hostnameOf(r.url)))).length;
  let supplemented = false;
  if (officialCount(all) < 2) {
    supplemented = true;
    onProgress("공식 자료가 부족해 검색 범위를 넓혀 다시 찾고 있습니다…");
    const round2 = [
      ...foreign.map((q) => tavilySearch({ ...base, query: q.text, exclude_domains: REFERENCE_DOMAINS }, apiKey)),
      tavilySearch({ ...base, query: (koPlan?.text || claimQuery) + " 공식 발표", exclude_domains: REFERENCE_DOMAINS }, apiKey),
    ];
    all = all.concat(await gather(round2, true));
  }

  // 정리: 중복 제거 → 관련도 낮은 자료 제외 → 신뢰도 등급 순, 같은 등급은 관련도 순 → 한 사이트당 최대 2건
  const candidates = uniqueByUrl(all)
    .filter((r) => (r.score ?? 1) >= SETTINGS.minRelevance && (r.content || "").trim())
    .map((r) => {
      const host = hostnameOf(r.url);
      return {
        title: clean(r.title) || host,
        url: r.url,
        host,
        tier: classifyTier(host),
        content: clean(r.content).slice(0, SETTINGS.maxContentChars),
        score: r.score ?? 0,
        publishedDate: formatDate(r.published_date),
        knownPublisher: publisherOf(host),
      };
    })
    .sort((a, b) => TIERS[a.tier].rank - TIERS[b.tier].rank || b.score - a.score);

  const perHost = new Map();
  const picked = [];
  for (const c of candidates) {
    const site = c.host.split(".").slice(-3).join(".");
    if ((perHost.get(site) || 0) >= 2) continue;
    perHost.set(site, (perHost.get(site) || 0) + 1);
    picked.push(c);
    if (picked.length >= SETTINGS.maxEvidence) break;
  }
  const sources = picked.map((s, i) => ({ ...s, id: i + 1 }));

  return {
    sources,
    searchInfo: {
      topic: plan.topic,
      topicLabel: TOPICS[plan.topic],
      languages: ["한국어", ...foreign.map((q) => q.lang_label || q.lang_code)],
      queries: plan.queries.map((q) => q.text),
      officialFound: sources.filter((s) => ["primary", "public"].includes(s.tier)).length,
      referenceShown: sources.filter((s) => s.tier === "reference").length,
      supplemented,
    },
  };
}

async function gather(promises, tolerant = false) {
  const results = await Promise.allSettled(promises);
  const ok = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);
  if (!tolerant && ok.length === 0 && results.every((r) => r.status === "rejected")) throw results[0].reason;
  return ok;
}

function uniqueByUrl(list) {
  const byUrl = new Map();
  for (const r of list) {
    if (!r?.url || !/^https?:\/\//i.test(r.url)) continue;
    const key = r.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    const prev = byUrl.get(key);
    if (!prev || (r.score ?? 0) > (prev.score ?? 0)) byUrl.set(key, r);
  }
  return [...byUrl.values()];
}

async function tavilySearch(body, apiKey) {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(SETTINGS.tavilyTimeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ServiceError("tavily", res.status, detail);
  }
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

// ---------------- 2. Gemini 분석 ----------------
async function askGemini(claim, sources, checkedAt, keys, plan) {
  const sourceText = sources.map((s) => [
    `[${s.id}]`,
    `제목: ${s.title}`,
    `사이트: ${s.host}${s.knownPublisher ? ` (${s.knownPublisher})` : ""}`,
    `출처 유형: ${TIERS[s.tier].label}${s.tier === "reference" ? " (위키·블로그 등 - 판정 핵심 근거로 사용 금지)" : ""}`,
    `게시일(검색엔진 제공): ${s.publishedDate || "미상"}`,
    `내용: ${s.content}`,
  ].join("\n")).join("\n\n");

  const userText = `검증 기준일(오늘): ${checkedAt}
주제 분류: ${TOPICS[plan.topic]}${plan.topic === "LAW_POLICY" ? " → 해당 국가 정부·관계기관 공식 자료로만 확정할 것" : ""}
관련 국가·지역: ${plan.countries.join(", ") || "미상"}

[검증할 주장]
${claim}

[검색 자료]
${sourceText}

위 [검색 자료]만 근거로 주장을 검증하고, 지정된 JSON 형식으로 답하세요. sources에는 [1]부터 [${sources.length}]까지 모든 자료를 빠짐없이 넣으세요.`;

  return generateJson(SYSTEM_PROMPT, userText, RESPONSE_SCHEMA, keys);
}

// Gemini에게 JSON 형식 답변을 받는 공통 함수
async function generateJson(systemText, userText, schema, keys) {
  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: { responseMimeType: "application/json", responseJsonSchema: schema },
  };

  let res = await callGemini(body, keys);
  // 답변 형식 지정 기능을 모델이 지원하지 않으면, 형식 지정 없이 한 번 더 시도
  if (res.status === 400) {
    const detail = await res.text().catch(() => "");
    if (/responseJsonSchema|response_json_schema|schema/i.test(detail)) {
      body.generationConfig = { responseMimeType: "application/json" };
      body.contents[0].parts[0].text += `\n\n답변 JSON 형식(스키마):\n${JSON.stringify(schema)}`;
      res = await callGemini(body, keys);
    } else {
      throw new ServiceError("gemini", 400, detail);
    }
  }
  if (!res.ok) throw new ServiceError("gemini", res.status, await res.text().catch(() => ""));

  const data = await res.json();
  if (data.promptFeedback?.blockReason) {
    throw new ServiceError("gemini", 200, `blocked: ${data.promptFeedback.blockReason}`, "AI가 이 요청을 차단했습니다.");
  }
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  if (!text) {
    throw new ServiceError("gemini", 200, `empty: ${cand?.finishReason || "unknown"}`, "AI가 답변을 내지 않았습니다.");
  }
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    parsed._model = res.usedModel || keys.geminiModel;
    return parsed;
  } catch {
    throw new ServiceError("gemini", 200, "invalid json", "AI 답변 형식이 올바르지 않습니다.");
  }
}

// Gemini 호출: 서버가 붐비면(503·429·500) 잠시 쉬었다가 다시 시도하고,
// 그래도 안 되면 예비 모델(GEMINI_FALLBACK_MODEL)로 한 번 더 시도합니다.
async function callGemini(body, keys) {
  const fallbacks = String(keys.geminiFallbackModel || "")
    .split(",").map((m) => m.trim()).filter((m) => m && m !== keys.geminiModel);
  const models = [keys.geminiModel, keys.geminiModel, keys.geminiModel, ...fallbacks];
  const waits = [0, 3000, 6000, ...fallbacks.map(() => 2000)];
  let res;
  for (let i = 0; i < models.length; i++) {
    if (waits[i]) await new Promise((r) => setTimeout(r, waits[i]));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(models[i])}:generateContent`;
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": keys.geminiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SETTINGS.geminiTimeoutMs),
    });
    if (![429, 500, 503].includes(res.status)) {
      res.usedModel = models[i];
      return res;
    }
    console.log(`[Gemini] ${models[i]} 응답 ${res.status} - 다시 시도합니다 (${i + 1}/${models.length})`);
  }
  return res;
}

// ---------------- 3. AI 답변 검사 ----------------
const VERDICT_CODES = ["TRUE", "MOSTLY_TRUE", "HALF_TRUE", "MOSTLY_FALSE", "FALSE", "PENDING"];
const SUPPORT_CODES = ["DIRECT_SUPPORT", "PARTIAL_SUPPORT", "CONTRADICTS", "CONTEXT", "IRRELEVANT"];
const CHECK_CODES = ["MATCH", "MISMATCH", "UNKNOWN", "NA"];
const VERDICT_LABEL = {
  TRUE: "사실", MOSTLY_TRUE: "대체로 사실", HALF_TRUE: "일부 사실",
  MOSTLY_FALSE: "대체로 사실 아님", FALSE: "사실 아님", PENDING: "판단 유보",
};

function verifyAndBuild(claim, checkedAt, sources, ai, plan = { topic: "OTHER" }) {
  const adjustments = [];
  const validIds = new Set(sources.map((s) => s.id));
  const keepIds = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => validIds.has(n)))];
  const str = (v) => (typeof v === "string" ? v.trim() : "");

  // 자료별 AI 점검 결과 정리
  const aiById = new Map();
  for (const s of Array.isArray(ai.sources) ? ai.sources : []) {
    const id = Number(s?.id);
    if (validIds.has(id) && !aiById.has(id)) aiById.set(id, s);
  }

  const evidence = sources.map((s) => {
    const a = aiById.get(s.id) || {};
    const checks = {};
    for (const k of ["date", "region", "subject", "figure"]) {
      checks[k] = CHECK_CODES.includes(a.checks?.[k]) ? a.checks[k] : "UNKNOWN";
    }
    const quote = str(a.quote).slice(0, 300);
    const quoteVerified = quote.length >= 8 && normalize(s.content).includes(normalize(quote));
    const support = SUPPORT_CODES.includes(a.support) ? a.support : "CONTEXT";
    const aiDate = str(a.source_date);
    // AI가 기관명 대신 사이트 주소를 적었으면 기관명으로 보지 않음
    const aiPub = /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(str(a.publisher)) ? "" : str(a.publisher);
    a.publisher = aiPub;
    return {
      id: s.id,
      title: s.title,
      url: s.url,
      host: s.host,
      tier: s.tier,
      tierLabel: TIERS[s.tier].label,
      publisher: s.knownPublisher || str(a.publisher) || s.host,
      publisherSource: s.knownPublisher ? "known" : str(a.publisher) ? "ai" : "host",
      date: s.publishedDate || aiDate || "",
      dateSource: s.publishedDate ? "search" : aiDate ? "content" : "",
      support,
      checks,
      checkNote: str(a.check_note),
      quote: quoteVerified ? quote : "",
      quoteTranslation: quoteVerified ? str(a.quote_translation).slice(0, 400) : "",
      quoteVerified,
      quoteRejected: quote && !quoteVerified ? quote : "",
      snippet: s.content.slice(0, 600),
      assessed: aiById.has(s.id),
    };
  });

  // '결정적 근거' 판단: 인용문이 원문에서 확인되고, 날짜·지역·대상이 주장과 일치(또는 해당 없음)
  // + 출처 등급 조건: 위키·블로그 등 참고 자료는 제외, 법률·정책 주제는 정부·공공기관 자료만 인정
  const isLawPolicy = plan.topic === "LAW_POLICY";
  const tierOk = (e) => isLawPolicy ? (e.tier === "primary" || e.tier === "public") : e.tier !== "reference";
  const ctxOk = (e) => ["date", "region", "subject"].every((k) => e.checks[k] === "MATCH" || e.checks[k] === "NA");
  const supportOk = (e, allowPartial) =>
    e.quoteVerified && ctxOk(e) &&
    (e.support === "DIRECT_SUPPORT" || (allowPartial && e.support === "PARTIAL_SUPPORT")) &&
    (e.checks.figure === "MATCH" || e.checks.figure === "NA");
  const refuteOk = (e) =>
    e.quoteVerified && ctxOk(e) && e.support === "CONTRADICTS" && e.checks.figure !== "UNKNOWN";
  const isDecisiveSupport = (e, allowPartial) => tierOk(e) && supportOk(e, allowPartial);
  const isDecisiveRefute = (e) => tierOk(e) && refuteOk(e);

  let verdict = VERDICT_CODES.includes(ai.verdict) ? ai.verdict : "PENDING";
  const reasoning = (Array.isArray(ai.reasoning) ? ai.reasoning : [])
    .map((r) => ({ text: str(r?.text), sourceIds: keepIds(r?.source_ids) }))
    .filter((r) => r.text);
  const conflicts = (Array.isArray(ai.conflicts) ? ai.conflicts : [])
    .map((c) => ({ text: str(c?.description), sourceIds: keepIds(c?.source_ids) }))
    .filter((c) => c.text);

  const citedIds = new Set(reasoning.flatMap((r) => r.sourceIds));
  const cited = evidence.filter((e) => citedIds.has(e.id));
  const original = verdict;

  if (verdict !== "PENDING") {
    let ok;
    if (cited.length === 0) {
      ok = false;
      adjustments.push("AI의 판정 이유에 실제로 존재하는 근거 번호가 없습니다.");
    } else if (verdict === "TRUE") {
      ok = cited.some((e) => isDecisiveSupport(e, false));
    } else if (verdict === "MOSTLY_TRUE") {
      ok = cited.some((e) => isDecisiveSupport(e, true));
    } else if (verdict === "HALF_TRUE") {
      ok = cited.some((e) => isDecisiveSupport(e, true) || isDecisiveRefute(e));
    } else {
      ok = cited.some(isDecisiveRefute);
    }
    if (!ok) {
      // 등급 조건 때문에 탈락한 경우를 구분해서 안내
      const blockedByTier = cited.filter((e) => !tierOk(e) && (supportOk(e, true) || refuteOk(e)));
      if (blockedByTier.length) {
        const ids = blockedByTier.map((e) => `[${e.id}]`).join(" ");
        adjustments.push(isLawPolicy
          ? `법률·정책·제도 관련 주장은 해당 국가 정부·관계기관의 공식 자료로 확인되어야 합니다. AI가 인용한 ${ids}은(는) ${[...new Set(blockedByTier.map((e) => e.tierLabel))].join("·")}여서 핵심 근거로 인정하지 않았습니다.`
          : `AI가 인용한 ${ids}은(는) 위키·블로그 등 참고 자료여서 핵심 근거로 인정하지 않았습니다.`);
      } else if (cited.length) {
        adjustments.push("AI가 인용한 근거 중 날짜·지역·대상·수치가 주장과 일치한다고 확인되고, 인용 문장이 원문에서 그대로 확인되는 자료가 없습니다.");
      }
      adjustments.push(`그래서 AI 판정 '${VERDICT_LABEL[original]}'을(를) '판단 유보'로 조정했습니다. 근거 자료를 직접 확인해 주세요.`);
      verdict = "PENDING";
    }
  }

  const rejectedQuotes = evidence.filter((e) => e.quoteRejected).map((e) => e.id);
  if (rejectedQuotes.length) {
    adjustments.push(`자료 ${rejectedQuotes.map((i) => `[${i}]`).join(" ")}에서 AI가 인용한 문장이 원문에서 확인되지 않아 인용문을 표시하지 않았습니다.`);
  }

  // 수정 제안: 결정적 근거만 사용한 경우에만 표시
  const sg = ai.suggestion || {};
  const sgIds = keepIds(sg.source_ids);
  const decisiveIds = new Set(evidence.filter((e) => isDecisiveSupport(e, true) || isDecisiveRefute(e)).map((e) => e.id));
  let suggestion = { shown: false, original: claim, text: "", sourceIds: sgIds, note: str(sg.note), reason: "" };
  if (verdict === "TRUE") suggestion.reason = "사실로 판정되어 수정할 필요가 없습니다.";
  else if (verdict === "PENDING") suggestion.reason = "판단 유보 상태이므로 확인된 근거만으로 수정 문장을 만들 수 없습니다.";
  else if (!sg.needed || !str(sg.text)) suggestion.reason = str(sg.note) || "AI가 확인된 근거만으로는 수정 문장을 만들 수 없다고 판단했습니다.";
  else if (sgIds.length === 0 || !sgIds.every((id) => decisiveIds.has(id))) {
    suggestion.reason = "수정 문장에 쓰인 근거가 점검을 통과하지 못해 제안을 표시하지 않았습니다.";
  } else {
    suggestion = { ...suggestion, shown: true, text: str(sg.text) };
  }

  return {
    claim, checkedAt, noResults: false,
    verdict,
    aiVerdict: original,
    summary: verdict === original ? str(ai.summary) : `확인 가능한 근거가 부족해 판단을 유보합니다. (AI 1차 판정: ${VERDICT_LABEL[original]})`,
    criteria: {
      timeframe: str(ai.claim_timeframe),
      region: str(ai.claim_region),
      subject: str(ai.claim_subject),
    },
    reasoning, conflicts, evidence, suggestion, adjustments,
    model: str(ai._model),
  };
}

// ---------------- 도우미 ----------------
export class ServiceError extends Error {
  constructor(service, status, detail = "", friendly = "") {
    super(`${service} ${status}`);
    this.service = service;
    this.status = status;
    this.detail = String(detail).slice(0, 500);
    this.friendly = friendly;
  }
}

function hostnameOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
function matchesDomain(host, domain) {
  return host === domain || host.endsWith("." + domain);
}
function classifyTier(host) {
  if (REFERENCE_DOMAINS.some((d) => matchesDomain(host, d))) return "reference";
  if (PRIMARY_DOMAINS.some((d) => matchesDomain(host, d))) return "primary";
  if (PUBLIC_DOMAINS.some((d) => matchesDomain(host, d))) return "public";
  if (NEWS_DOMAINS.some((d) => matchesDomain(host, d))) return "news";
  return "other";
}
function publisherOf(host) {
  // 가장 구체적인 주소부터 찾기 (예: ecos.bok.or.kr → bok.or.kr)
  if (PUBLISHER_NAMES["www." + host]) return PUBLISHER_NAMES["www." + host];
  const generic = new Set(["gov.cn", "gov.tw", "gov.hk", "go.jp", "gov.uk"]);
  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts.slice(i).join(".");
    const name = PUBLISHER_NAMES[key];
    // 지방정부 등 목록에 없는 하위 기관은 "중국 정부 기관 (주소)"처럼 표시
    if (name) return generic.has(key) && key !== host ? `${name} 기관 (${host})` : name;
  }
  return "";
}
function formatDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
}
function todayKST() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}
function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
function normalize(s) {
  return String(s || "").toLowerCase().replace(/[\s"'“”‘’`·…\.\,\(\)\[\]]/g, "");
}
