"use strict";

// =====================================================
// 1. 데이터 (기능/데이터 담당) - 값이 바뀌면 이 블록만 수정
// =====================================================
const DATA = {
  seats: 130,                 // 좌석 수 조사
  stayRatio: 0.25,            // 직전 30분 도착자 중 아직 앉아 있는 비율 (가정값)
  avg:  { lunch: 320, dinner: 70 },   // 평균 판매량 (중식 320장 / 석식 70장)
  hours: { lunch: "11:00~13:30", dinner: "17:00~18:30" },   // 운영 시간
  alpha: 0.3,                 // 설문 선호도 반영 강도 (0~1, 가정값)
  exam: 1.10,                 // 시험기간 보정 (가정값 - 인터뷰로 확인 필요)
  rain: 0.85,                 // 비·눈 오는 날은 외출이 줄어 식수 감소 (가정값 - 인터뷰로 확인 필요)

  // 구글폼 설문(36명): 요일 선호 순위 → 1순위=5점 ... 5순위=1점 합산
  survey: {
    n: 36,
    score: {
      lunch:  { 1: 80, 2: 112, 3: 131, 4: 82,  5: 98 },
      dinner: { 1: 83, 2: 108, 3: 87,  4: 117, 5: 112 }
    }
  },

  // 시간대별 도착 비율 (12시가 피크)
  slots: {
    lunch:  { t: ["11:00", "11:30", "12:00", "12:30", "13:00"],          w: [0.08, 0.18, 0.36, 0.26, 0.12] },   // 11:00~13:30, 12시 피크
    dinner: { t: ["17:00", "17:30", "18:00"],                          w: [0.30, 0.45, 0.25] }
  },

  // 이번 주(2026-11-16 ~ 11-20) 식단표: main=메인 2종, side=반찬/국, bar=플러스바, drink=음료
  menu: {
    1: {
      lunch:  { main: [["미트볼하이라이스", "🍛"], ["비엔나떡볶음", "🌭"]], side: ["볶음우동", "반달단무지", "계란파국", "배추김치"], bar: ["그린샐러드&드레싱", "산고추지", "현미밥"], drink: "오미자차/숭늉" },
      dinner: { main: [["순두부찌개", "🍲"], ["동그랑땡전", "🥞"]], side: ["느타리버섯볶음", "병아리콩샐러드", "잡곡밥", "배추김치"], bar: ["그린샐러드&드레싱", "궁채절임", "현미밥"], drink: "오미자차/숭늉" }
    },
    2: {
      lunch:  { main: [["셀프불고기또띠아쌈", "🌯"], ["갈릭필라프", "🍚"]], side: ["깻잎토마토살사", "가쓰오우동국", "배추김치"], bar: ["그린샐러드&드레싱", "마카로니샐러드", "현미밥"], drink: "망고주스/숭늉" },
      dinner: { main: [["오징어짬뽕", "🍜"], ["짜장소스", "🍝"]], side: ["군만두", "해파리냉채", "쌀밥", "배추김치"], bar: ["그린샐러드&드레싱", "단무지", "현미밥"], drink: "망고주스/숭늉" }
    },
    3: {
      lunch:  { main: [["김치닭볶음탕", "🍗"], ["들기름막국수", "🍜"]], side: ["멸치볶음", "콩나물국", "잡곡밥/쌀밥", "배추김치"], bar: ["그린샐러드&드레싱", "알새우칩", "현미밥"], drink: "매실차/숭늉" },
      dinner: { main: [["얼큰어묵탕", "🍢"], ["솔방울오징어데리야끼볶음", "🦑"]], side: ["감자채볶음", "무말랭이무침", "잡곡밥", "배추김치"], bar: ["그린샐러드&드레싱", "콘샐러드", "현미밥"], drink: "매실차/숭늉" }
    },
    4: {
      lunch:  { main: [["청양크림함박", "🍖"], ["쫄면야채무침", "🍜"]], side: ["건파래볶음", "유부우동국", "잡곡밥/쌀밥", "배추김치"], bar: ["그린샐러드&드레싱", "깍둑단무지유자무침", "현미밥"], drink: "석류주스/숭늉" },
      dinner: { main: [["육개장", "🍲"], ["숯불간장불고기", "🥩"]], side: ["고구마맛탕", "청포묵김무침", "잡곡밥", "배추김치"], bar: ["그린샐러드&드레싱", "해초무침", "현미밥"], drink: "석류주스/숭늉" }
    },
    5: {
      lunch:  { main: [["잔치국수", "🍜"], ["순대야채볶음", "🥘"]], side: ["매운양념꼬치어묵", "간장고추지&락교", "잡곡밥/쌀밥", "배추김치"], bar: ["그린샐러드&드레싱", "천사채샐러드", "현미밥"], drink: "포도주스/숭늉" },
      dinner: { main: [["참치마늘볶음밥", "🍚"], ["로제떡볶이", "🍝"]], side: ["설탕핫도그", "단무지", "열무된장국", "배추김치"], bar: ["그린샐러드&드레싱", "요구르트", "현미밥"], drink: "포도주스/숭늉" }
    }
  }
};

const DN = ["일", "월", "화", "수", "목", "금", "토"];
const MN = { lunch: "중식", dinner: "석식" };
const now = new Date();
let day = now.getDay();
if (day === 0 || day === 6) day = 1;            // 주말이면 월요일 기준
const todayDay = day;
let meal = now.getHours() >= 15 ? "dinner" : "lunch";
let isExam = false;       // 시험기간 여부 (버튼으로 선택)
let isRain = false;       // 비/눈 여부 (버튼으로 선택)

// =====================================================
// 2. 단순 예측 모델
// =====================================================
// (1) 요일별 기본 식수: 평균(중식 320 / 석식 70)에 설문 요일 선호도를 alpha만큼 반영
//     총식수 = 평균 × (1 + alpha × (요일 선호점수 ÷ 평균 선호점수 − 1))
function baseTotal(d, m) {
  const sc = DATA.survey.score[m];
  const vals = Object.values(sc);
  const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
  return DATA.avg[m] * (1 + DATA.alpha * (sc[d] / mean - 1));
}

function predict(d, m) {
  // (2) 시험기간·날씨 보정
  let total = baseTotal(d, m);
  if (isExam) total *= DATA.exam;
  if (isRain) total *= DATA.rain;
  total = Math.round(total);

  // (4) 시간대별 점유율 = (이번 30분 도착 + 직전 30분 도착 × stayRatio) ÷ 좌석 수
  const S = DATA.slots[m];
  const arrivals = S.w.map(w => total * w);
  const crowd = arrivals.map((a, i) => (a + (i > 0 ? arrivals[i - 1] * DATA.stayRatio : 0)) / DATA.seats);
  return { total, crowd, times: S.t };
}

function level(r) {
  if (r < 0.5) return ["여유", "var(--ok)"];
  if (r < 0.8) return ["보통", "var(--mid)"];
  return ["혼잡", "var(--bad)"];
}

// =====================================================
// 3. 화면 그리기
// =====================================================
const $ = id => document.getElementById(id);

function renderPills(el, list, current, onClick) {
  el.innerHTML = "";
  list.forEach(([key, label]) => {
    const b = document.createElement("button");
    b.className = "pill" + (key === current ? " on" : "");
    b.textContent = label;
    b.onclick = () => onClick(key);
    el.appendChild(b);
  });
}

function menuCards(d, m) {
  const x = DATA.menu[d][m];
  const mains = x.main.map(it => `<div class="card"><div class="thumb">${it[1]}</div>
    <div class="card-body"><div class="t">${it[0]}</div><div class="c">${DN[d]}요일 ${MN[m]} 메인</div><span class="tag">${MN[m]}</span></div></div>`).join("");
  const sides = `<div class="card"><div class="thumb"><i class="bi bi-basket2"></i></div>
    <div class="card-body"><div class="t">반찬 · 국</div><div class="c">${x.side.join(", ")}</div>
    <div class="c">플러스바: ${x.bar.join(", ")}</div><div class="c">음료: ${x.drink}</div><span class="tag">${MN[m]}</span></div></div>`;
  return mains + sides;
}

function renderMarquee() {
  const cards = [];
  for (let d = 1; d <= 5; d++) {
    ["lunch", "dinner"].forEach(m => {
      DATA.menu[d][m].main.forEach(it => {
        cards.push(`<div class="card mq"><div class="thumb">${it[1]}</div>
          <div class="card-body"><div class="t">${it[0]}</div><div class="c">${DN[d]}요일 ${MN[m]}</div></div></div>`);
      });
    });
  }
  $("marquee").innerHTML = cards.join("") + cards.join("");
}

function render() {
  const p = predict(day, meal);
  const mLabel = MN[meal];

  // 조건 버튼 (시험기간 / 날씨)
  $("cond").innerHTML = "";
  [["exam", '<i class="bi bi-journal-text"></i> 시험기간', isExam], ["rain", '<i class="bi bi-cloud-rain-heavy"></i> 비·눈', isRain]].forEach(([k, label, on]) => {
    const b = document.createElement("button");
    b.className = "pill" + (on ? " on" : "");
    b.innerHTML = label;
    b.onclick = () => { if (k === "exam") isExam = !isExam; else isRain = !isRain; render(); };
    $("cond").appendChild(b);
  });

  // 히어로 추천
  let best = 0, peak = 0;
  p.crowd.forEach((c, i) => {
    if (c < p.crowd[best]) best = i;
    if (c > p.crowd[peak]) peak = i;
  });
  $("dl").textContent = `${DN[day]}요일 ${mLabel} 기준 · 예상 ${p.total}식`;
  const t = new Date();
  const hhmm = String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
  const toMin = x => { const [h, m] = x.split(":").map(Number); return h * 60 + m; };
  const nowMin = t.getHours() * 60 + t.getMinutes();
  const pct = c => Math.round(Math.min(c, 1) * 100);
  const live = t.getDay() >= 1 && t.getDay() <= 5 && day === todayDay;   // 오늘 요일을 보고 있을 때만 '지금' 기준
  const open = toMin(p.times[0]), close = toMin(p.times[p.times.length - 1]) + 30;

  if (live && nowMin >= open && nowMin < close) {
    let cur = 0;
    p.times.forEach((x, i) => { if (toMin(x) <= nowMin) cur = i; });
    let later = cur;
    for (let i = cur; i < p.crowd.length; i++) if (p.crowd[i] < p.crowd[later]) later = i;
    $("rec").textContent = `지금 ${hhmm} · ${level(p.crowd[cur])[0]}`;
    $("rec2").textContent = later === cur
      ? "지금이 남은 시간 중 가장 한적해요"
      : `이후 가장 한적한 시간은 ${p.times[later]} (${level(p.crowd[later])[0]})`;
  } else {
    const state = !live ? "" : nowMin < open ? `지금 ${hhmm} · ${mLabel} 운영 전 · ` : `지금 ${hhmm} · ${mLabel} 운영 종료 · `;
    $("rec").textContent = `${state}${p.times[best]} 방문 추천 (${level(p.crowd[best])[0]})`;
    $("rec2").textContent = `가장 붐비는 시간은 ${p.times[peak]}`;
  }

  // 오늘의 학식
  renderPills($("mealPills"), [["lunch", "중식"], ["dinner", "석식"]], meal, k => { meal = k; render(); });
  $("todayGrid").innerHTML = menuCards(todayDay, meal);

  // 이번 주 학식
  renderPills($("dayPills"), [1, 2, 3, 4, 5].map(d => [d, DN[d] + (d === todayDay ? " (오늘)" : "")]), day, k => { day = k; render(); });
  $("weekLunch").innerHTML = menuCards(day, "lunch");
  $("weekDinner").innerHTML = menuCards(day, "dinner");

  // 혼잡도 (중식/석식 각각 표시)
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

  // 모델 설명
  $("model").innerHTML = `<b style="color:var(--tx)">예측 방식 (단순 모델)</b><br>
    ① 요일 기본 식수 = <code>평균(중식 ${DATA.avg.lunch} / 석식 ${DATA.avg.dinner}) × (1 + ${DATA.alpha} × (요일 선호점수 ÷ 평균 점수 − 1))</code><br>
    ② 보정: 시험기간 × ${DATA.exam}, 비·눈 × ${DATA.rain} (가정값)<br>
    ③ 시간대 점유율 = <code>(해당 30분 도착 + 직전 30분 도착 × ${DATA.stayRatio}) ÷ 좌석 ${DATA.seats}석</code><br>
    ※ 요일 선호 점수는 설문 ${DATA.survey.n}명 응답 기준이라 표본이 작습니다. 가정값은 식당 인터뷰로 보정하세요.`;
}

// =====================================================
// 4. 시작
// =====================================================
renderMarquee();
render();
setInterval(render, 60000);   // 1분마다 현재 시간 기준으로 갱신

// =====================================================
// 5. 스크롤 효과 (부드럽게 나타나기 + 현재 메뉴 강조)
// =====================================================
(function () {
  if (!("IntersectionObserver" in window)) return;   // 지원 안 하면 그냥 보여줌

  // 섹션이 화면에 들어올 때 서서히 나타남
  const reveal = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("show"); reveal.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".sec, .cta, .foot").forEach(el => {
    el.classList.add("reveal");
    reveal.observe(el);
  });

  // 스크롤 위치에 맞춰 상단 메뉴 강조
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