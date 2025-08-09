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

let cachedRows = null;
let cachedHeader = null;

function normalize(str) {
  return (str || "")
    .normalize("NFC")
    .replace(/\u200B/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeForCompare(str) {
  return normalize(str).replace(/\s+/g, "");
}
function isValidName(str) {
  return /^[ㄱ-ㅎ가-힣a-zA-Z·.\- ]{1,50}$/.test(str);
}

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
        cell += '"';
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
        // ignore
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function mapColumns(header) {
  const candidates = {
    husband: ["남편", "남편이름", "남편 이름", "신랑", "배우자1", "I"],
    wife: ["아내", "아내이름", "아내 이름", "신부", "배우자2", "K"],
    year: ["연도", "년도", "Year"],
    order: ["차수", "회차", "기수"],
    period: ["기간", "수강기간", "일정", "일자"],
    parish: ["본당", "교구", "성당"]
  };

  function findIndex(keys) {
    for (const key of keys) {
      const target = key.replace(/\s+/g, "").toLowerCase();
      for (let i = 0; i < header.length; i++) {
        const h = (header[i] || "").toString().replace(/\s+/g, "").toLowerCase();
        if (h === target) return i;
      }
    }
    return -1;
  }

  const idx = {
    husband: findIndex(candidates.husband),
    wife: findIndex(candidates.wife),
    year: findIndex(candidates.year),
    order: findIndex(candidates.order),
    period: findIndex(candidates.period),
    parish: findIndex(candidates.parish)
  };

  if (idx.husband < 0 && header.length >= 9) idx.husband = 8;
  if (idx.wife < 0 && header.length >= 11) idx.wife = 10;

  return idx;
}

function renderResults(matches, cols) {
  resultsEl.innerHTML = "";
  if (matches.length === 0) {
    resultCount.textContent = "검색 결과가 없습니다.";
    return;
  }
  resultCount.textContent = `검색 결과 ${matches.length}건`;

  for (const row of matches) {
    const card = document.createElement("article");
    card.className = "card";

    const dl = document.createElement("dl");

    function addItem(label, value) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = normalize(value);
      dl.appendChild(dt);
      dl.appendChild(dd);
    }

    addItem("남편 이름", row[cols.husband] ?? "");
    addItem("아내 이름", row[cols.wife] ?? "");
    if (cols.year >= 0) addItem("연도", row[cols.year] ?? "");
    if (cols.order >= 0) addItem("차수", row[cols.order] ?? "");
    if (cols.period >= 0) addItem("기간", row[cols.period] ?? "");
    if (cols.parish >= 0) addItem("본당", row[cols.parish] ?? "");

    card.appendChild(dl);
    resultsEl.appendChild(card);
  }
}

function showError(message) {
  errorMsg.textContent = message;
  errorSection.classList.remove("hidden");
}
function hideError() {
  errorMsg.textContent = "";
  errorSection.classList.add("hidden");
}
function showResults() {
  resultsSection.classList.remove("hidden");
  emptyState.classList.add("hidden");
}
function showEmpty() {
  resultsSection.classList.add("hidden");
  emptyState.classList.remove("hidden");
  resultsEl.innerHTML = "";
  resultCount.textContent = "";
  hideError();
}

async function performSearch(rawQuery) {
  hideError();
  const query = normalize(rawQuery);
  const qKey = normalizeForCompare(query);

  if (!query) {
    showEmpty();
    return;
  }
  if (!isValidName(query)) {
    showError("이름에는 한글/영문/점/하이픈/가운뎃점/공백만 사용할 수 있습니다.");
    return;
  }

  try {
    if (!cachedRows) {
      const csvText = await fetchCSV(CSV_URL);
      const rows = parseCSV(csvText);
      if (!rows || rows.length < 2) {
        showError("데이터가 비어 있거나 형식이 올바르지 않습니다.");
        return;
      }
      cachedHeader = rows[0];
      cachedRows = rows.slice(1);
    }

    const cols = mapColumns(cachedHeader);

    if (cols.husband < 0 || cols.wife < 0) {
      showError("남편/아내 이름 컬럼을 찾지 못했습니다. 스프레드시트 헤더를 확인해주세요.");
      return;
    }

    const matches = cachedRows.filter(r => {
      const h = normalizeForCompare(r[cols.husband] || "");
      const w = normalizeForCompare(r[cols.wife] || "");
      return h === qKey || w === qKey;
    });

    showResults();
    renderResults(matches, cols);
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (err.name === "AbortError") {
      showError("요청이 지연되고 있습니다. 잠시 후 다시 시도해주세요.");
    } else {
      showError("데이터를 불러오는 중 오류가 발생했습니다. 네트워크 상태를 확인해주세요.");
      console.error(err);
    }
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  performSearch(input.value);
});

homeLink.addEventListener("click", (e) => {
  e.preventDefault();
  input.value = "";
  showEmpty();
  input.focus();
});

document.addEventListener("DOMContentLoaded", () => {
  showEmpty();
  input.focus();
});