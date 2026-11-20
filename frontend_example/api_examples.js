// UI 팀원용 예시: 하이브리드 OCR 메뉴판 파일 업로드
async function uploadWeeklyMenu(file, weekStart) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(
    `http://127.0.0.1:8000/menu/upload?week_start=${weekStart}`,
    { method: "POST", body: form }
  );
  if (!response.ok) throw new Error(await response.text());
  return await response.json(); // items를 화면에서 검토/수정
}

// 업로드한 이용자가 인식 결과를 확인·수정한 뒤 공용 메뉴로 저장
async function saveWeeklyMenu(weekStart, items) {
  const response = await fetch("http://127.0.0.1:8000/menu/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ week_start: weekStart, items })
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}

// 예측 요청: 메뉴 카테고리는 해당 날짜/식사의 저장 메뉴를 바탕으로 UI가 전달
async function getCongestion(menuCategory, exam) {
  const response = await fetch("http://127.0.0.1:8000/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ menu_category: menuCategory, exam })
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json();
}
