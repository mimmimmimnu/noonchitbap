"use strict";

// =====================================================
// 1. 데이터
// =====================================================
const DATA = {
  seats: 130,
  stayRatio: 0.25,
  avg:  { lunch: 320, dinner: 70 },
  hours: { lunch: "11:00~13:30", dinner: "17:00~18:30" },
  alpha: 0.3,
  exam: 1.10,
  weekLabel: "이번 주 식단표",

  survey: {
    n: 36,
    score: {
      lunch:  { 1: 80, 2: 112, 3: 131, 4: 82,  5: 98 },
      dinner: { 1: 83, 2: 108, 3: 87,  4: 117, 5: 112 }
    }
  },

  slots: {
    lunch:  { t: ["11:00", "11:30", "12:00", "12:30", "13:00"], w: [0.08, 0.18, 0.36, 0.26, 0.12] },
    dinner: { t: ["17:00", "17:30", "18:00"],                 w: [0.30, 0.45, 0.25] }
  },

  menu: {
    1: {
      lunch:  { main: [["미트볼하이라이스", "양식"], ["비엔나떡볶음", "분식"]], side: ["볶음우동", "반달단무지", "계란파국", "배추김치"], bar: ["그린샐러드&드레싱", "산고추지", "현미밥"], drink: "오미자차/숭늉" },
      dinner: { main: [["순두부찌개", "한식"], ["동그랑땡전", "한식"]], side: ["느타리버섯볶음", "병아리콩샐러드", "잡곡밥", "배추김치"], bar: ["그린샐러드&드레싱", "궁채절임", "현미밥"], drink: "오미자차/숭늉" }
    },
    2: {
      lunch:  { main: [["셀프불고기또띠아쌈", "양식"], ["갈릭필라프", "양식"]], side: ["깻잎토마토살사", "가쓰오우동국", "배추김치"], bar: ["그린샐러드&드레싱", "마카로니샐러드", "현미밥"], drink: "망고주스/숭늉" },
      dinner: { main: [["오징어짬뽕", "중식"], ["짜장소스", "중식"]], side: ["군만두", "해파리냉채", "쌀밥", "배추김치"], bar: ["그린샐러드&드레싱", "단무지", "현미밥"], drink: "망고주스/숭늉" }
    },
    3: {
      lunch:  { main: [["김치닭볶음탕", "한식"], ["들기름막국수", "한식"]], side: ["멸치볶음", "콩나물국", "잡곡밥/쌀밥", "배추김치"], bar: ["그린샐러드&드레싱", "알새우칩", "현미밥"], drink: "매실차/숭늉" },
      dinner: { main: [["얼큰어묵탕", "한식"], ["솔방울오징어데리야끼볶음", "일식"]], side: ["감자채볶음", "무말랭이무침", "잡곡밥", "배추김치"], bar: ["그린샐러드&드레싱", "콘샐러드", "현미밥"], drink: "매실차/숭늉" }
    },
    4: {
      lunch:  { main: [["청양크림함박", "양식"], ["쫄면야채무침", "분식"]], side: ["건파래볶음", "유부우동국", "잡곡밥/쌀밥", "배추김치"], bar: ["그린샐러드&드레싱", "깍둑단무지유자무침", "현미밥"], drink: "석류주스/숭늉" },
      dinner: { main: [["육개장", "한식"], ["숯불간장불고기", "한식"]], side: ["고구마맛탕", "청포묵김무침", "잡곡밥", "배추김치"], bar: ["그린샐러드&드레싱", "해초무침", "현미밥"], drink: "석류주스/숭늉" }
    },
    5: {
      lunch:  { main: [["잔치국수", "한식"], ["순대야채볶음", "분식"]], side: ["매운양념꼬치어묵", "간장고추지&락교", "잡곡밥/쌀밥", "배추김치"], bar: ["그린샐러드&드레싱", "천사채샐러드", "현미밥"], drink: "포도주스/숭늉" },
      dinner: { main: [["참치마늘볶음밥", "한식"], ["로제떡볶이", "분식"]], side: ["설탕핫도그", "단무지", "열무된장국", "배추김치"], bar: ["그린샐러드&드레싱", "요구르트", "현미밥"], drink: "포도주스/숭늉" }
    }
  }
};

const SAMPLE_AI_PARSED_MENU = {
  weekLabel: "AI 인식 완료 · 차주 주간 식단표",
  menu: {
    1: {
      lunch:  { main: [["치즈돈까스", "일식"], ["매콤비빔국수", "분식"]], side: ["크림스프", "양배추샐러드", "단무지", "배추김치"], bar: ["그린샐러드", "피클", "현미밥"], drink: "사과주스/숭늉" },
      dinner: { main: [["부대찌개", "한식"], ["계란말이", "한식"]], side: ["어묵볶음", "콩나물무침", "잡곡밥", "배추김치"], bar: ["그린샐러드", "고추장아찌", "현미밥"], drink: "사과주스/숭늉" }
    },
    2: {
      lunch:  { main: [["제육덮밥", "한식"], ["잔치우동", "일식"]], side: ["야채튀김", "부추겉절이", "계란국", "배추김치"], bar: ["그린샐러드", "마카로니", "현미밥"], drink: "매실차/숭늉" },
      dinner: { main: [["마파두부덮밥", "중식"], ["탕수육", "중식"]], side: ["짜사이무침", "계란탕", "쌀밥", "배추김치"], bar: ["그린샐러드", "단무지", "현미밥"], drink: "매실차/숭늉" }
    },
    3: {
      lunch:  { main: [["로제파스타", "양식"], ["케이준치킨샐러드", "양식"]], side: ["마늘빵", "콘스프", "오이피클", "배추김치"], bar: ["그린샐러드", "감자샐러드", "현미밥"], drink: "오렌지주스/숭늉" },
      dinner: { main: [["된장찌개", "한식"], ["고등어구이", "한식"]], side: ["시금치나물", "도토리묵무침", "잡곡밥", "배추김치"], bar: ["그린샐러드", "무말랭이", "현미밥"], drink: "오렌지주스/숭늉" }
    },
    4: {
      lunch:  { main: [["소불고기버섯전골", "한식"], ["잡채", "한식"]], side: ["호박전", "미역줄기볶음", "잡곡밥", "배추김치"], bar: ["그린샐러드", "콩자반", "현미밥"], drink: "수정과/숭늉" },
      dinner: { main: [["김치볶음밥", "한식"], ["치즈라볶이", "분식"]], side: ["김말이튀김", "유부국", "단무지", "배추김치"], bar: ["그린샐러드", "요구르트", "현미밥"], drink: "수정과/숭늉" }
    },
    5: {
      lunch:  { main: [["가츠동", "일식"], ["야끼소바", "일식"]], side: ["타코야끼", "미소장국", "초생강", "배추김치"], bar: ["그린샐러드", "해초샐러드", "현미밥"], drink: "복숭아아이스티/숭늉" },
      dinner: { main: [["설렁탕", "한식"], ["석박지&수육무침", "한식"]], side: ["부추무침", "오징어젓갈", "쌀밥", "석박지"], bar: ["그린샐러드", "양파절임", "현미밥"], drink: "복숭아아이스티/숭늉" }
    }
  }
};

const DN = ["일", "월", "화", "수", "목", "금", "토"];
const MN = { lunch: "중식", dinner: "석식" };
const now = new Date();
let day = now.getDay();
if (day === 0 || day === 6) day = 1;
const todayDay = day;
let meal = now.getHours() >= 15 ? "dinner" : "lunch";
let isExam = false;

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

// =====================================================
// 2. 단순 예측 모델
// =====================================================
function baseTotal(d, m) {
  const sc = DATA.survey.score[m];
  const vals = Object.values(sc);
  const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
  return DATA.avg[m] * (1 + DATA.alpha * (sc[d] / mean - 1));
}

function predict(d, m) {
  let total = baseTotal(d, m);
  if (isExam) total *= DATA.exam;
  total = Math.round(total);

  const S = DATA.slots[m];
  const arrivals = S.w.map(w => total * w);
  const crowd = arrivals.map((a, i) => (a + (i > 0 ? arrivals[i - 1] * DATA.stayRatio : 0)) / DATA.seats);
  return { total, crowd, times: S.t };
}

function level(r) {
  if (r < 0.5) return ["여유", "var(--ok)"];
  if (r < 0.8) return ["보통", "var(--mid)"];
  if (r < 1.0) return ["혼잡", "var(--bad)"];
  return ["매우혼잡", "var(--very-bad)"];
}

// =====================================================
// 3. 화면 그리기
// =====================================================
const $ = id => document.getElementById(id);

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

function chipList(list) {
  return list.map(x => `<span>${x}</span>`).join("");
}

function menuCards(d, m) {
  const x = DATA.menu[d][m];
  const iconName = m === "lunch" ? "sun" : "moon";
  const iconClass = m === "lunch" ? "ic-sun" : "ic-moon";

  const mains = x.main.map((it, i) => {
    const name = Array.isArray(it) ? it[0] : it;
    const cat = Array.isArray(it) && it[1] ? it[1] : "추천";
    return `
      <div class="tile">
        <div class="tile-top">
          <span class="tile-num">MAIN 0${i + 1}</span>
          <span class="cat-badge" data-cat="${cat}">${cat}</span>
        </div>
        <b>${name}</b>
      </div>`;
  }).join("");

  return `
  <article class="mcard m-${m}">
    <header class="mc-head">
      <div class="mc-title">
        <span class="mc-ico"><i data-lucide="${iconName}" class="${iconClass}"></i></span>
        <div><b>${MN[m]}</b><small>${DN[d]}요일 · ${DATA.hours[m]}</small></div>
      </div>
    </header>
    <div class="mains">${mains}</div>
    <div class="mc-sec"><span class="mc-label"><i data-lucide="soup"></i> 반찬 · 국</span><div class="chips2">${chipList(x.side)}</div></div>
    <div class="mc-sec"><span class="mc-label"><i data-lucide="plus-circle"></i> 플러스바</span><div class="chips2">${chipList(x.bar)}</div></div>
    <div class="mc-sec"><span class="mc-label"><i data-lucide="cup-soda"></i> 음료</span><div class="chips2">${chipList(x.drink.split("/"))}</div></div>
  </article>`;
}

function render() {
  const p = predict(day, meal);
  const mLabel = MN[meal];

  // 조건 버튼 (시험기간)
  $("cond").innerHTML = "";
  $("cond").appendChild(
    createInteractivePill('<i data-lucide="book-open"></i> 시험기간', isExam, () => {
      isExam = !isExam;
      render();
    })
  );

  // 히어로 추천 브리핑 카드
  let best = 0, peak = 0;
  p.crowd.forEach((c, i) => {
    if (c < p.crowd[best]) best = i;
    if (c > p.crowd[peak]) peak = i;
  });

  const t = new Date();
  const hhmm = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
  const toMin = x => { const [h, m] = x.split(":").map(Number); return h * 60 + m; };
  const nowMin = t.getHours() * 60 + t.getMinutes();
  const pct = c => Math.round(Math.min(c, 1) * 100);
  const live = t.getDay() >= 1 && t.getDay() <= 5 && day === todayDay;
  const open = toMin(p.times[0]), close = toMin(p.times[p.times.length - 1]) + 30;

  const formatStatus = (r) => {
    const [text, color] = level(r);
    return `<span style="color:${color}">${text}</span>`;
  };

  let recLabel = `${DN[day]}요일 ${mLabel} 가장 한적한 추천 시간`;
  let recMainText = `현재 ${hhmm} · ${p.times[best]} 방문 추천 (${formatStatus(p.crowd[best])})`;

  if (live && nowMin >= open && nowMin < close) {
    let cur = 0;
    p.times.forEach((x, i) => { if (toMin(x) <= nowMin) cur = i; });
    let later = cur;
    for (let i = cur; i < p.crowd.length; i++) if (p.crowd[i] < p.crowd[later]) later = i;

    recLabel = later === cur
      ? `${DN[day]}요일 ${mLabel} · 지금이 남은 시간 중 가장 한적해요`
      : `${DN[day]}요일 ${mLabel} · 이후 가장 한적한 추천 시간`;
    recMainText = later === cur
      ? `현재 ${hhmm} · 지금 방문 추천 (${formatStatus(p.crowd[cur])})`
      : `현재 ${hhmm} · ${p.times[later]} 방문 추천 (${formatStatus(p.crowd[later])})`;
  } else if (live) {
    const state = nowMin < open ? `${mLabel} 운영 전` : `${mLabel} 운영 종료`;
    recLabel = `${DN[day]}요일 ${state} · 가장 한적한 추천 시간`;
    recMainText = `현재 ${hhmm} · ${p.times[best]} 방문 추천 (${formatStatus(p.crowd[best])})`;
  }

  $("briefCard").innerHTML = `
    <div class="bc-main">
      <span class="bc-rec-label">${recLabel}</span>
      <strong class="bc-rec-headline">${recMainText}</strong>
    </div>
  `;

  // 오늘의 학식
  renderPills($("mealPills"), [["lunch", "중식"], ["dinner", "석식"]], meal, k => { meal = k; render(); });
  $("todayGrid").innerHTML = menuCards(todayDay, meal);

  // 이번 주 학식
  
  renderPills($("dayPills"), [1, 2, 3, 4, 5].map(d => [d, DN[d] + (d === todayDay ? " (오늘)" : "")]), day, k => { day = k; render(); });
  $("weekGrid").innerHTML = menuCards(day, "lunch") + menuCards(day, "dinner");

  // 혼잡도
  $("crowdSub").textContent = `${DN[day]}요일 · 좌석 ${DATA.seats}석 기준 예상 점유율`;
  [["lunch", "Lunch"], ["dinner", "Dinner"]].forEach(([m, id]) => {
    const q = predict(day, m);
    $("t" + id).textContent = DATA.hours[m];
    $("chart" + id).innerHTML = q.crowd.map((c, i) => {
      const [name, color] = level(c);
      return `<div class="col"><b style="color:${color}">${pct(c)}%</b>
        <div class="bar" style="height:${Math.min(c, 1) * 85}%;background:${color}" title="${name}"></div>
        <span>${q.times[i]}</span></div>`;
    }).join("");
  });

  // 숫자 통계
  $("stats").innerHTML = `
    <div class="stat"><b>${p.total}식</b><span>${DN[day]}요일 ${mLabel} 예상 총식수</span></div>
    <div class="stat"><b>${p.times[best]}</b><span>가장 한적한 시간</span></div>
    <div class="stat"><b>${Math.round(Math.min(p.crowd[peak], 1) * 100)}%</b><span>피크(${p.times[peak]}) 좌석 점유율</span></div>
    <div class="stat"><b>${DATA.seats}석</b><span>전체 좌석 수</span></div>`;

  
  refreshIcons();
}

// =====================================================
// 4. AI 식단표 사진 자동 인식 & 적용 기능
// =====================================================
(function initMenuUploader() {
  const modal = $("uploadModal");
  const openBtns = [$("openUploadBtn"), $("openUploadBtn2")].filter(Boolean);
  const closeBtn = $("closeUploadBtn");
  const keyInput = $("geminiKey");
  const dropzone = $("dropzone");
  const fileInput = $("menuFileInput");
  const placeholder = $("dropPlaceholder");
  const previewImg = $("previewImg");
  const statusEl = $("parseStatus");
  const previewEl = $("parsePreview");
  const runBtn = $("runParseBtn");
  const demoBtn = $("demoParseBtn");
  const applyBtn = $("applyMenuBtn");

  let selectedBase64 = null;
  let selectedMime = "image/jpeg";
  let parsedDraft = null;

  const savedKey = localStorage.getItem("nunchibap_gemini_key");
  if (savedKey && keyInput) keyInput.value = savedKey;
  if (keyInput) {
    keyInput.addEventListener("change", () => {
      localStorage.setItem("nunchibap_gemini_key", keyInput.value.trim());
    });
  }

  function openModal() { modal.hidden = false; refreshIcons(); }
  function closeModal() { modal.hidden = true; }

  openBtns.forEach(b => b.addEventListener("click", openModal));
  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

  function handleFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    selectedMime = file.type;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      selectedBase64 = dataUrl.split(",")[1];
      previewImg.src = dataUrl;
      previewImg.hidden = false;
      placeholder.hidden = true;
      runBtn.disabled = false;
      statusEl.hidden = true;
      previewEl.hidden = true;
      applyBtn.hidden = true;
    };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener("change", e => handleFile(e.target.files[0]));
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("drag"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("drag");
    handleFile(e.dataTransfer.files[0]);
  });

  function showParsedResult(resultObj) {
    parsedDraft = resultObj;
    const rows = [1, 2, 3, 4, 5].map(d => {
      const l = resultObj.menu[d]?.lunch?.main?.map(x => x[0]).join(", ") || "-";
      const dn = resultObj.menu[d]?.dinner?.main?.map(x => x[0]).join(", ") || "-";
      return `<div class="pp-row"><b>${DN[d]}요일</b><span>중식: ${l} / 석식: ${dn}</span></div>`;
    }).join("");
    previewEl.innerHTML = rows;
    previewEl.hidden = false;
    applyBtn.hidden = false;
  }

  runBtn.addEventListener("click", async () => {
    const apiKey = keyInput.value.trim();
    if (!apiKey) {
      statusEl.className = "parse-status err";
      statusEl.textContent = "Gemini API Key를 입력하거나, 왼쪽 아래 '샘플 차주 식단표로 AI 시연' 버튼을 눌러주세요.";
      statusEl.hidden = false;
      return;
    }
    if (!selectedBase64) return;

    runBtn.disabled = true;
    statusEl.className = "parse-status";
    statusEl.textContent = "AI가 식단표 이미지에서 월~금 요일과 중식·석식 메뉴를 추출하고 있습니다...";
    statusEl.hidden = false;
    previewEl.hidden = true;
    applyBtn.hidden = true;

    const prompt = `이 대학 학생식당 주간 식단표 이미지를 분석해서 월요일(1)~금요일(5)까지의 중식(lunch)과 석식(dinner)을 아래 JSON 형식으로만 반환해줘.
반드시 순수 JSON만 출력하고 마크다운 백틱(\`\`\`)은 쓰지 마.
각 main 메뉴는 ["메뉴명", "카테고리"] 형태이며 카테고리는 반드시 "한식", "양식", "중식", "분식", "일식" 중 하나로 분류해.
형식:
{
  "weekLabel": "식단표 상단 날짜 또는 주차 텍스트",
  "menu": {
    "1": {
      "lunch": { "main": [["메뉴1", "한식"], ["메뉴2", "분식"]], "side": ["반찬1", "국"], "bar": ["샐러드", "현미밥"], "drink": "음료/숭늉" },
      "dinner": { "main": [["메뉴1", "한식"], ["메뉴2", "양식"]], "side": ["반찬1", "국"], "bar": ["샐러드", "현미밥"], "drink": "음료/숭늉" }
    },
    "2": { ... }, "3": { ... }, "4": { ... }, "5": { ... }
  }
}`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: selectedMime, data: selectedBase64 } }
              ]
            }],
            generationConfig: { responseMimeType: "application/json" }
          })
        }
      );
      if (!res.ok) throw new Error(`API 오류 (${res.status})`);
      const json = await res.json();
      const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = JSON.parse(rawText);

      statusEl.className = "parse-status ok";
      statusEl.textContent = "AI가 월~금 중식·석식 구분 및 카테고리 분류를 완료했습니다!";
      showParsedResult(parsed);
    } catch (err) {
      statusEl.className = "parse-status err";
      statusEl.textContent = `분석 중 오류가 발생했습니다: ${err.message}. API 키를 확인하거나 샘플 시연 버튼을 이용해 보세요.`;
    } finally {
      runBtn.disabled = false;
    }
  });

  demoBtn.addEventListener("click", () => {
    statusEl.className = "parse-status";
    statusEl.textContent = "AI Vision 모델이 식단표 표 구조를 분석 중입니다...";
    statusEl.hidden = false;
    previewEl.hidden = true;
    applyBtn.hidden = true;

    setTimeout(() => {
      statusEl.className = "parse-status ok";
      statusEl.textContent = "AI 분석 완료: 월~금 중식·석식 20종 메뉴와 한식/양식/중식/일식/분식 분류가 완료되었습니다.";
      showParsedResult(SAMPLE_AI_PARSED_MENU);
    }, 650);
  });

  applyBtn.addEventListener("click", () => {
    if (!parsedDraft || !parsedDraft.menu) return;
    DATA.menu = parsedDraft.menu;
    if (parsedDraft.weekLabel) DATA.weekLabel = parsedDraft.weekLabel;
    render();
    closeModal();
  });
})();

// =====================================================
// 5. 시작 & 스크롤 인터랙션
// =====================================================
render();
setInterval(render, 60000);

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

  const modelBtn = document.getElementById("toggleModelBtn");
  const modelBox = document.getElementById("model");
  if (modelBtn && modelBox) {
    modelBtn.onclick = () => { modelBox.hidden = !modelBox.hidden; };
  }
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