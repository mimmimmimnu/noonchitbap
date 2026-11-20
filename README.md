# 눈치밥 — 학식 혼잡도 예측 서비스

학교 홈페이지의 주간 식단표를 자동으로 가져와(OCR) 메뉴를 분류하고,
메뉴 종류·시간대를 바탕으로 학생식당 혼잡도를 예측해 보여주는 웹 서비스입니다.

```
frontend/   화면 (index.html, script.js, style.css)  ← main 브랜치
backend/    FastAPI 서버 + 크롤러/OCR + 혼잡도 모델     ← ai 브랜치
```

서버 하나(FastAPI)가 화면과 API를 함께 서비스합니다.

## 실행

1. Python 패키지 설치
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
2. Tesseract OCR 설치 (한국어 언어팩 `kor` 포함)
   - 윈도우: 기본 경로(`C:\Program Files\Tesseract-OCR\tesseract.exe`)에 설치하면 자동 인식
   - 그 외 경로/리눅스·맥: 환경변수 `TESSERACT_PATH` 로 실행 파일 경로를 지정하거나 PATH 에 등록
     (우분투 예: `sudo apt install tesseract-ocr tesseract-ocr-kor`)
3. 서버 실행
   ```bash
   python main.py
   ```
4. 브라우저에서 http://localhost:8000 접속 (API 문서: http://localhost:8000/docs)

## 메뉴 자동 업데이트

서버를 켠 상태에서 `python menu_scheduler.py` 를 실행하면
학교 홈페이지 주간메뉴 수집 → OCR → `weekly_menu.json` 저장 → `/menu/sync` 로 서버에 반영합니다.
주기적으로 돌리려면 작업 스케줄러(윈도우) 또는 cron(리눅스)에 등록하세요.

## API

| 경로 | 설명 |
|---|---|
| `GET /menu?week_start=YYYY-MM-DD` | 그 주(월요일 날짜) 메뉴 조회 |
| `POST /menu/sync` | 크롤링 결과(`weekly_menu.json`)를 서버 메뉴에 반영 |
| `POST /menu/upload` | 식단표 이미지/PDF OCR → 메뉴 후보 반환 |
| `POST /menu/confirm` | 확인·수정한 메뉴 저장 (자동 크롤링이 덮어쓰지 않음) |
| `GET /predict/slots?date=&meal=&exam=` | 하루 시간대별 혼잡도 (화면 차트용) |
| `POST /predict` | 현재 / 30분 후 / 60분 후 혼잡도 |
| `GET /health`, `GET /api` | 상태 확인 |

## 참고

- 혼잡도 모델은 가상 학습 데이터 40행(`meal_flow_synthetic_40.csv`)으로 학습한 시제품입니다.
- 프론트를 다른 주소에서 따로 띄우려면 `ALLOWED_ORIGINS` 환경변수(쉼표로 구분)로 허용 주소를 지정하세요.
