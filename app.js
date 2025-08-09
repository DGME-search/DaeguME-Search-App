// 공개 CSV 주소 (경양강호님 제공 링크)
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRsbSBEIpAUVChiBI6qs14orYM2fUiRoarUzeYlml765V1sfEEJSt2hl-aiQoJCeJw6Sjg3LQwf2p56/pub?gid=1039371593&single=true&output=csv";

const form = document.getElementById("searchForm");
const input = document.getElementById("query");
const homeLink = document.getElementById("homeLink");

const resultsSection = document.getElementById("resultsSection");
const resultCount = document.getElementById("resultCount");
const resultsEl = document.getElementById("results");
const errorSection = document.getElementById("errorSection");
const errorMsg = document.getElementById("errorMsg");
const emptyState = document.getElementById("emptyState");

// 캐시: 한 번 받아오면 메모리에 유지
let cachedRows = null; // Array<Array<string>>
let cachedHeader = null; // Array<string>

// 입력값 정규화(공백 정리, 유니코드 정규화)
function normalize(str) {
  return (str || "")
    .normalize("NFC")
    .replace(/\u200B/g, "") // zero-width 제거
    .replace(/\s+/g, " ")
    .trim();
}

// 비교용: 이름은 공백 제거 후 완전 일치 기준
function normalizeForCompare(str) {
  return normalize(str).replace(/\s+/g, "");
}

// 입력값 검증(허용 문자만)
function isValidName(str) {
  return /^[ㄱ-ㅎ가-힣a-zA-Z·.\- ]{1,50}$/.test(str);
}

// CSV 가져오기(타임아웃 포함)
async function fetchCSV(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`네트워크 오류: ${res.status}`);
    const text = await res.text();
    return text;
  } finally {
    clearTimeout(t);
  }
}

// CSV 파서(따옴표/콤마 처리)
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (insideQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"'; // 이스케이프된 따옴표
        i++;
      } else if (ch === '"') {
        insideQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        insideQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else if (ch === "\r") {
        // CRLF 지원: \r은 무시
      } else {
        cell += ch;
      }
    }
  }
  // 마지막 셀/행 처리
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// 헤더에서 필요한 컬럼 인덱스 찾기
function mapColumns(header) {
  // 가능한 레이블 후보(여러 표기 대응)
  const candidates = {
    husband: ["남편", 