"use strict";

// =====================================================
// 1. 설정 & 상태
//    - 메뉴/혼잡도 데이터는 모두 백엔드(FastAPI)에서 받아옴
//    - 같은 서버에서 서비스하므로 API 주소는 상대 경로 사용
// =====================================================
const DN = ["일", "월", "화", "수", "목", "금", "토"];
const WD = ["월", "화", "수", "목", "금"];               // day(1~5) -> 백엔드 요일 표기
const MN = { lunch: "중식", dinner: "석식" };
const HOURS = { lunch: "11:00~13:30", dinner: "17:00~18:30" };
const SEATS = 130;

// 백엔드 main.py 의 MENU_WEIGHTS 와 동일한 카테고리
const CATEGORIES = ["육류·고기류", "면류", "밥류", "국·탕·찌개류", "분식류", "해산물류", "전·튀김류"];
const UNKNOWN_CAT = "분류 확인 필요";

const LEVEL_COLOR = {
  "여유": "var(--ok)",
  "보통": "var(--mid)",
  "혼잡": "var(--bad)",
  "매우 혼잡": "var(--very-bad)"
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const now = new Date();
let day = now.getDay();
if (day === 0 || day === 6) day = 1;
const todayDay = day;
let meal = now.getHours() >= 15 ? "dinner" : "lunch";
let isExam = false;

// ---------- 날짜 도구 (로컬 시간 기준) ----------
const pad = n => String(n).padStart(2, "0");
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function mondayOf(d) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}
const currentWeekStart = () => toISO(mondayOf(new Date()));

function dateOfDay(d) {          // d: 1(월)~5(금) -> 이번 주 해당 날짜
  const m = mondayOf(new Date());
  m.setDate(m.getDate() + d - 1);
  return toISO(m);
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

// ---------- API ----------
async function api(path, options) {
  const res = await fetch(path, options);
  let body = null;
  try { body = await res.json(); } catch (_) { /* JSON 아님 */ }
  if (!res.ok) {
    const detail = body && typeof body.detail === "string" ? body.detail : null;
    throw new Error(detail || `서버 오류 (${res.status})`);
  }
  return body;
}

// =====================================================
// 2. 데이터 로딩 (메뉴 / 혼잡도 예측)
// =====================================================
let menuItems = [];
let menuState = "loading";          // loading | ok | empty | error

async function loadMenu() {
  try {
    const data = await api(`/menu?week_start=${currentWeekStart()}`);
    menuItems = data.status === "ok" ? (data.items || []) : [];
    menuState = menuItems.length ? "ok" : "empty";
  } catch (e) {
    menuItems = [];
    menuState = "error";
  }
}

const predCache = new Map();        // key -> { slots } | { error }
const inflight = new Map();         // key -> Promise
const predKey = (d, m) => `${dateOfDay(d)}|${m}|${isExam ? 1 : 0}`;

function fetchPrediction(d, m) {
  const key = predKey(d, m);
  if (predCache.has(key)) return Promise.resolve();
  if (inflight.has(key)) return inflight.get(key);

  const url = `/predict/slots?date=${dateOfDay(d)}&meal=${encodeURIComponent(MN[m])}&exam=${isExam}`;
  const p = api(url)
    .then(data => { predCache.set(key, { slots: data.slots || [] }); })
    .catch(e => { predCache.set(key, { error: e.message }); })
    .finally(() => { inflight.delete(key); });

  inflight.set(key, p);
  return p;
}

function getPred(d, m) {
  const hit = predCache.get(predKey(d, m));
  if (!hit) return { state: "loading" };
  if (hit.error) return { state: "error", message: hit.error };
  const slots = hit.slots.map(s => {
    if (s.status !== "ok") {
      return { ok: false, time: s.time, message: s.message || "예측할 수 없어요" };
    }
    return {
      ok: true,
      time: s.time,
      pct: s.occupancy_percent,
      people: s.predicted_people,
      label: s.congestion,
      color: LEVEL_COLOR[s.congestion] || "var(--mid)"
    };
  });
  return { state: "ready", slots };
}

// =====================================================
// 3. 화면 그리기
// =====================================================
function createInteractivePill(htmlLabel, isActive, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pill ih-btn" + (isActive ? " on" : "");
  b.innerHTML = `
    <span class="ih-dot" aria-hidden="true"></span>
    <span class="ih-front">${htmlLabel}</span>
    <span class="ih-hover" aria-hidden="true">
      <span>${htmlLabel}</span>
      <i data-lucide="arrow-right"></i>
    </span>
  `;
  b.onclick = onClick;
  return b;
}

function renderPills(el, list, current, onClick) {
  el.innerHTML = "";
  list.forEach(([key, label]) => {
    el.appendChild(createInteractivePill(label, key === current, () => onClick(key)));
  });
}

// ---------- 메뉴 카드 ----------
function menuFor(d, m) {
  return menuItems.filter(i => i.weekday === WD[d - 1] && i.meal === MN[m]);
}

function menuCards(d, m) {
  const iconName = m === "lunch" ? "sun" : "moon";
  const iconClass = m === "lunch" ? "ic-sun" : "ic-moon";
  const items = menuFor(d, m);

  let body;
  if (menuState === "loading") {
    body = `<p class="empty-note">메뉴를 불러오는 중이에요...</p>`;
  } else if (menuState === "error") {
    body = `<p class="empty-note err">서버에 연결하지 못했어요.<br><button type="button" class="btn outline" data-retry>다시 불러오기</button></p>`;
  } else if (!items.length) {
    body = `<p class="empty-note">이 식사의 메뉴가 아직 없어요.<br>식단표 사진을 올려 등록해 보세요.</p>`;
  } else {
    body = `<div class="mains">` + items.map((it, i) => `
      <div class="tile">
        <div class="tile-top">
          <span class="tile-num">MENU ${pad(i + 1)}</span>
          <span class="cat-badge" data-cat="${esc(it.category)}">${esc(it.category)}</span>
        </div>
        <b>${esc(it.menu_name)}</b>
      </div>`).join("") + `</div>`;
  }

  return `
  <article class="mcard m-${m}">
    <header class="mc-head">
      <div class="mc-title">
        <span class="mc-ico"><i data-lucide="${iconName}" class="${iconClass}"></i></span>
        <div><b>${MN[m]}</b><small>${DN[d]}요일 · ${HOURS[m]}</small></div>
      </div>
    </header>
    ${body}
  </article>`;
}

function renderControls() {
  $("cond").innerHTML = "";
  $("cond").appendChild(
    createInteractivePill('<i data-lucide="book-open"></i> 시험기간', isExam, () => {
      isExam = !isExam;
      render();
    })
  );

  renderPills($("mealPills"), [["lunch", "중식"], ["dinner", "석식"]], meal, k => { meal = k; render(); });
  renderPills(
    $("dayPills"),
    [1, 2, 3, 4, 5].map(d => [d, DN[d] + (d === todayDay ? " (오늘)" : "")]),
    day,
    k => { day = k; render(); }
  );
}

function renderMenus() {
  $("todayGrid").innerHTML = menuCards(todayDay, meal);
  $("weekGrid").innerHTML = menuCards(day, "lunch") + menuCards(day, "dinner");
}

// ---------- 혼잡도 ----------
let crowdToken = 0;

function renderCrowd() {
  const token = ++crowdToken;
  const missing = ["lunch", "dinner"].filter(m => !predCache.has(predKey(day, m)));

  drawCrowd();
  if (!missing.length) return;

  Promise.all(missing.map(m => fetchPrediction(day, m))).then(() => {
    if (token === crowdToken) drawCrowd();     // 그 사이 다른 요일을 눌렀다면 무시
  });
}

function chartHTML(pred) {
  if (pred.state === "loading") {
    return `<p class="empty-note">예측을 불러오는 중이에요...</p>`;
  }
  if (pred.state === "error") {
    return `<p class="empty-note err">예측을 불러오지 못했어요 (${esc(pred.message)})<br><button type="button" class="btn outline" data-retry>다시 불러오기</button></p>`;
  }
  if (!pred.slots.some(s => s.ok)) {
    const msg = pred.slots[0] ? pred.slots[0].message : "예측할 수 없어요";
    return `<p class="empty-note">${esc(msg)}<br>식단표를 등록하면 혼잡도 예측이 표시돼요.</p>`;
  }
  return pred.slots.map(s => {
    if (!s.ok) {
      return `<div class="col"><b style="color:var(--tx2)">-</b><div class="bar" style="height:2%;background:var(--line)" title="${esc(s.message)}"></div><span>${esc(s.time)}</span></div>`;
    }
    const h = Math.min(s.pct, 100) / 100 * 85;
    return `<div class="col"><b style="color:${s.color}">${Math.round(s.pct)}%</b>
      <div class="bar" style="height:${h}%;background:${s.color}" title="${esc(s.label)}"></div>
      <span>${esc(s.time)}</span></div>`;
  }).join("");
}

function briefHTML(label, text) {
  return `
    <div class="bc-main">
      <span class="bc-rec-label">${label}</span>
      <strong class="bc-rec-headline">${text}</strong>
    </div>`;
}

function drawBrief() {
  const box = $("briefCard");
  const mLabel = MN[meal];
  const pred = getPred(day, meal);

  if (pred.state === "loading") {
    box.innerHTML = briefHTML(`${DN[day]}요일 ${mLabel}`, "혼잡도를 계산하는 중이에요...");
    return;
  }
  if (pred.state === "error") {
    box.innerHTML = briefHTML(`${DN[day]}요일 ${mLabel}`, "혼잡도를 불러오지 못했어요");
    return;
  }

  const ok = pred.slots.filter(s => s.ok);
  if (!ok.length) {
    box.innerHTML = briefHTML(`${DN[day]}요일 ${mLabel}`, esc(pred.slots[0] ? pred.slots[0].message : "예측할 수 없어요"));
    return;
  }

  let best = 0;
  ok.forEach((s, i) => { if (s.pct < ok[best].pct) best = i; });

  const t = new Date();
  const hhmm = pad(t.getHours()) + ":" + pad(t.getMinutes());
  const toMin = x => { const [h, m] = x.split(":").map(Number); return h * 60 + m; };
  const nowMin = t.getHours() * 60 + t.getMinutes();
  const live = t.getDay() >= 1 && t.getDay() <= 5 && day === todayDay;
  const open = toMin(ok[0].time), close = toMin(ok[ok.length - 1].time) + 30;
  const status = s => `<span style="color:${s.color}">${esc(s.label)}</span>`;

  let recLabel = `${DN[day]}요일 ${mLabel} 가장 한적한 추천 시간`;
  let recMainText = `현재 ${hhmm} · ${ok[best].time} 방문 추천 (${status(ok[best])})`;

  if (live && nowMin >= open && nowMin < close) {
    let cur = 0;
    ok.forEach((s, i) => { if (toMin(s.time) <= nowMin) cur = i; });
    let later = cur;
    for (let i = cur; i < ok.length; i++) if (ok[i].pct < ok[later].pct) later = i;

    recLabel = later === cur
      ? `${DN[day]}요일 ${mLabel} · 지금이 남은 시간 중 가장 한적해요`
      : `${DN[day]}요일 ${mLabel} · 이후 가장 한적한 추천 시간`;
    recMainText = later === cur
      ? `현재 ${hhmm} · 지금 방문 추천 (${status(ok[cur])})`
      : `현재 ${hhmm} · ${ok[later].time} 방문 추천 (${status(ok[later])})`;
  } else if (live) {
    const state = nowMin < open ? `${mLabel} 운영 전` : `${mLabel} 운영 종료`;
    recLabel = `${DN[day]}요일 ${state} · 가장 한적한 추천 시간`;
  }

  box.innerHTML = briefHTML(recLabel, recMainText);
}

function drawStats() {
  const mLabel = MN[meal];
  const pred = getPred(day, meal);
  const ok = pred.state === "ready" ? pred.slots.filter(s => s.ok) : [];

  let peakNum = "-", peakLabel = `${DN[day]}요일 ${mLabel} 피크 예상 인원`;
  let bestTime = "-", peakPct = "-";

  if (ok.length) {
    let best = 0, peak = 0;
    ok.forEach((s, i) => {
      if (s.pct < ok[best].pct) best = i;
      if (s.pct > ok[peak].pct) peak = i;
    });
    peakNum = `${ok[peak].people}명`;
    peakLabel = `${DN[day]}요일 ${mLabel} 피크(${ok[peak].time}) 예상 인원`;
    bestTime = ok[best].time;
    peakPct = `${Math.round(Math.min(ok[peak].pct, 100))}%`;
  }

  $("stats").innerHTML = `
    <div class="stat"><b>${peakNum}</b><span>${peakLabel}</span></div>
    <div class="stat"><b>${bestTime}</b><span>가장 한적한 시간</span></div>
    <div class="stat"><b>${peakPct}</b><span>피크 좌석 점유율</span></div>
    <div class="stat"><b>${SEATS}석</b><span>전체 좌석 수</span></div>`;
}

function drawCrowd() {
  $("crowdSub").textContent = `${DN[day]}요일 · 좌석 ${SEATS}석 기준 예상 점유율`;
  [["lunch", "Lunch"], ["dinner", "Dinner"]].forEach(([m, id]) => {
    $("t" + id).textContent = HOURS[m];
    $("chart" + id).innerHTML = chartHTML(getPred(day, m));
  });
  drawBrief();
  drawStats();
}

function render() {
  renderControls();
  renderMenus();
  renderCrowd();
  refreshIcons();
}

// 메뉴·예측을 서버에서 새로 불러오기
async function refresh() {
  predCache.clear();
  menuState = "loading";
  render();
  await loadMenu();
  render();
}

document.addEventListener("click", e => {
  if (e.target.closest("[data-retry]")) refresh();
});

// =====================================================
// 4. 식단표 업로드 (OCR) → 확인·수정 → 저장
//    /menu/upload  : 이미지/PDF 를 OCR 해서 메뉴 후보를 돌려줌
//    /menu/confirm : 사용자가 확인·수정한 메뉴를 저장
// =====================================================
(function initMenuUploader() {
  const modal = $("uploadModal");
  const openBtns = [$("openUploadBtn"), $("openUploadBtn2")].filter(Boolean);
  const closeBtn = $("closeUploadBtn");
  const weekInput = $("weekStartInput");
  const dropzone = $("dropzone");
  const fileInput = $("menuFileInput");
  const placeholder = $("dropPlaceholder");
  const dropTitle = $("dropTitle");
  const previewImg = $("previewImg");
  const statusEl = $("parseStatus");
  const editorWrap = $("editorWrap");
  const editor = $("menuEditor");
  const runBtn = $("runParseBtn");
  const addRowBtn = $("addRowBtn");
  const applyBtn = $("applyMenuBtn");

  const DEFAULT_TITLE = dropTitle.textContent;
  let selectedFile = null;

  function openModal() {
    weekInput.value = currentWeekStart();
    modal.hidden = false;
    refreshIcons();
  }
  function closeModal() { modal.hidden = true; }

  openBtns.forEach(b => b.addEventListener("click", openModal));
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  function setStatus(text, kind) {
    statusEl.className = "parse-status" + (kind ? " " + kind : "");
    statusEl.textContent = text;
    statusEl.hidden = false;
  }

  // 선택한 날짜가 속한 주의 월요일 (서버는 월요일 날짜를 주 키로 사용)
  function pickedWeekStart() {
    const v = weekInput.value;
    const d = v ? new Date(v + "T00:00:00") : new Date();
    return toISO(mondayOf(isNaN(d) ? new Date() : d));
  }

  function resetEditor() {
    editor.innerHTML = "";
    editorWrap.hidden = true;
    addRowBtn.hidden = true;
    applyBtn.hidden = true;
  }

  function handleFile(file) {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    if (!isImage && !/\.pdf$/i.test(file.name)) {
      setStatus("PNG·JPG·WEBP 이미지 또는 PDF 파일만 올릴 수 있어요.", "err");
      return;
    }
    selectedFile = file;
    statusEl.hidden = true;
    resetEditor();

    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        previewImg.src = reader.result;
        previewImg.hidden = false;
        placeholder.hidden = true;
      };
      reader.readAsDataURL(file);
    } else {
      previewImg.hidden = true;
      placeholder.hidden = false;
      dropTitle.textContent = file.name;
    }
    runBtn.disabled = false;
  }

  fileInput.addEventListener("change", e => handleFile(e.target.files[0]));
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("drag");
    handleFile(e.dataTransfer.files[0]);
  });

  // ---------- 확인·수정 표 ----------
  function opts(list, selected) {
    return list.map(v => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(v)}</option>`).join("");
  }

  function rowHTML(item) {
    const cat = item.category || UNKNOWN_CAT;
    const catList = CATEGORIES.includes(cat) ? CATEGORIES : [cat, ...CATEGORIES];
    return `
      <div class="me-row">
        <select class="me-day" aria-label="요일">${opts(WD, item.weekday)}</select>
        <select class="me-meal" aria-label="식사">${opts(["중식", "석식"], item.meal)}</select>
        <input class="me-name" type="text" maxlength="40" value="${esc(item.menu_name)}" aria-label="메뉴명">
        <select class="me-cat" aria-label="카테고리">${opts(catList, cat)}</select>
        <button type="button" class="me-del" aria-label="이 메뉴 삭제">×</button>
      </div>`;
  }

  function showEditor(items) {
    editor.innerHTML = items.map(rowHTML).join("");
    editorWrap.hidden = false;
    addRowBtn.hidden = false;
    applyBtn.hidden = false;
  }

  editor.addEventListener("click", e => {
    const del = e.target.closest(".me-del");
    if (del) del.closest(".me-row").remove();
  });

  addRowBtn.addEventListener("click", () => {
    editor.insertAdjacentHTML("beforeend", rowHTML({ weekday: WD[todayDay - 1], meal: MN[meal], menu_name: "", category: CATEGORIES[0] }));
    const last = editor.lastElementChild;
    if (last) last.querySelector(".me-name").focus();
  });

  function collectItems() {
    return [...editor.querySelectorAll(".me-row")].map(row => ({
      weekday: row.querySelector(".me-day").value,
      meal: row.querySelector(".me-meal").value,
      menu_name: row.querySelector(".me-name").value.trim(),
      category: row.querySelector(".me-cat").value
    })).filter(it => it.menu_name);
  }

  // ---------- OCR 실행 ----------
  runBtn.addEventListener("click", async () => {
    if (!selectedFile) return;
    runBtn.disabled = true;
    resetEditor();
    setStatus("메뉴판에서 글자를 읽는 중이에요... 몇 초 걸릴 수 있어요.");

    const fd = new FormData();
    fd.append("file", selectedFile);

    try {
      const data = await api(`/menu/upload?week_start=${pickedWeekStart()}`, { method: "POST", body: fd });
      const items = data.items || [];
      showEditor(items);
      if (items.length) {
        setStatus(`메뉴 ${items.length}개를 인식했어요 (OCR 신뢰도 ${data.tesseract_confidence}%). 잘못 읽은 글자는 고치고, 필요 없는 줄은 지운 뒤 적용해 주세요.`, "ok");
      } else {
        setStatus("메뉴를 찾지 못했어요. 아래 '메뉴 추가'로 직접 입력할 수 있어요.", "err");
      }
    } catch (err) {
      setStatus(`인식 중 오류가 발생했어요: ${err.message}`, "err");
    } finally {
      runBtn.disabled = false;
    }
  });

  // ---------- 확정 저장 ----------
  applyBtn.addEventListener("click", async () => {
    const items = collectItems();
    if (!items.length) {
      setStatus("저장할 메뉴가 없어요. 메뉴를 추가해 주세요.", "err");
      return;
    }
    const wk = pickedWeekStart();
    applyBtn.disabled = true;
    try {
      const res = await api("/menu/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ week_start: wk, items })
      });
      await refresh();
      if (wk === currentWeekStart()) {
        closeModal();
      } else {
        setStatus(`${wk} 주 메뉴 ${res.saved_count}개를 저장했어요. 해당 주가 되면 자동으로 표시돼요.`, "ok");
      }
    } catch (err) {
      setStatus(`저장 중 오류가 발생했어요: ${err.message}`, "err");
    } finally {
      applyBtn.disabled = false;
    }
  });
})();

// =====================================================
// 5. 시작 & 스크롤 인터랙션
// =====================================================
refresh();
setInterval(renderCrowd, 60000);          // 현재 시각 기준 추천 문구 갱신 (캐시 사용)
setInterval(refresh, 10 * 60 * 1000);     // 10분마다 메뉴·예측 새로 불러오기

(function () {
  if (!("IntersectionObserver" in window)) return;

  const reveal = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("show"); reveal.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".sec").forEach(el => {
    el.classList.add("reveal");
    reveal.observe(el);
  });

  const links = document.querySelectorAll(".nav nav a");
  const spy = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
      }
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  ["today", "week", "crowd"].forEach(id => { const el = document.getElementById(id); if (el) spy.observe(el); });
})();

// 시네마틱 푸터 마그네틱 & 토글
(function () {
  document.querySelectorAll(".magnetic").forEach(el => {
    el.addEventListener("mousemove", e => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      el.style.transform = `translate(${x * 0.25}px, ${y * 0.25}px) scale(1.04)`;
    });
    el.addEventListener("mouseleave", () => {
      el.style.transform = "translate(0px, 0px) scale(1)";
    });
  });

  const topBtn = document.getElementById("scrollTopBtn");
  if (topBtn) topBtn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });

})();

// 커튼 리빌 푸터 & 메인 영역 투명도 크로스페이드
(function () {
  const mainEl = document.querySelector(".page-main");
  const wrap = document.querySelector(".c-footer-wrap");
  const footer = document.querySelector(".c-footer");
  const center = document.querySelector(".c-center");
  const giant = document.getElementById("giantText");
  if (!wrap || !footer || !center) return;

  function updateFooterReveal() {
    const rect = wrap.getBoundingClientRect();
    const vh = window.innerHeight;
    const raw = (vh - rect.top) / vh;
    const progress = Math.max(0, Math.min(1, raw));
    const eased = 1 - Math.pow(1 - progress, 2.2);

    if (mainEl) {
      mainEl.style.opacity = (1 - eased * 0.85).toFixed(3);
    }

    footer.classList.toggle("is-active", progress > 0.35);
    footer.style.opacity = eased.toFixed(3);
    center.style.opacity = Math.max(0, (progress - 0.15) / 0.85).toFixed(3);
    center.style.transform = `translateY(${((1 - eased) * 40).toFixed(1)}px)`;

    if (giant) {
      giant.style.opacity = (eased * 0.9).toFixed(3);
      giant.style.transform = `translateX(-50%) translateY(${((1 - eased) * 30).toFixed(1)}px)`;
    }
  }

  window.addEventListener("scroll", updateFooterReveal, { passive: true });
  window.addEventListener("resize", updateFooterReveal);
  updateFooterReveal();
})();