MEAL FLOW - 주간 메뉴판 업로드 + OCR + AI 예측 API

[기능]
1. 사진(PNG/JPG/WEBP) 또는 PDF 메뉴판 업로드
2. Tesseract OCR로 한글/영문 텍스트 추출
3. 요일/중식/석식/메뉴명 추출 시도
4. 메뉴 키워드 기반 카테고리 및 가중치 제안
5. 관리자가 수정한 메뉴를 주간 메뉴 JSON에 저장
6. Random Forest 현재/30분 후/60분 후 예측 API 제공

[중요한 OCR 설치]
Python 패키지뿐 아니라 Tesseract OCR 프로그램과 한국어 언어 데이터(kor)가 필요합니다.
Windows:
- Tesseract OCR 설치 프로그램을 설치
- 설치 시 Korean/kor 언어 데이터 포함
- 설치 경로가 PATH에 추가되어야 합니다.
- PATH 설정이 안 되면 main.py 상단에 다음을 지정할 수 있습니다:
  import pytesseract
  pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

[실행 - PowerShell]
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn main:app --reload

브라우저에서 http://127.0.0.1:8000/docs 접속

[API]
GET  /health
POST /menu/upload   (multipart file, 선택 week_start)
POST /menu/confirm  (JSON: week_start, items)
GET  /menu?week_start=YYYY-MM-DD
POST /predict       (JSON: menu_category, exam, 선택 now)

[누구나 이용 가능한 메뉴 등록 흐름]
1. 웹사이트 이용자가 POST /menu/upload로 메뉴판 파일 전송
2. 반환된 items와 ocr_text를 확인
3. 업로드한 이용자가 items를 화면에서 수정/검토
4. POST /menu/confirm으로 공용 메뉴에 저장
5. GET /menu로 저장된 주간 메뉴 확인

[권한 및 운영상 주의]
- 현재 프로젝트에는 로그인, 관리자 계정, 역할 구분이 없습니다. 누구나 업로드 및 저장 API를 호출할 수 있습니다.
- 저장된 메뉴는 모든 이용자에게 공통 적용됩니다.
- 누구나 기존 주간 메뉴를 덮어쓸 수 있으므로 실제 공개 서비스에서는 중복 등록 방지, 수정 이력, 신고/되돌리기 또는 간단한 검증 절차를 추가하는 것을 권장합니다.

[OCR 한계]
- 메뉴판의 표/다단 레이아웃, 작은 글씨, 흐린 사진에서는 요일과 메뉴 연결이 틀릴 수 있습니다.
- 현재 파서는 범용 OCR이 아니라 키워드 기반의 초기 프로토타입입니다.
- 반드시 관리자가 인식 결과를 검토하고 수정한 뒤 저장해야 합니다.
- 메뉴 카테고리 자동 분류는 키워드 규칙 기반이며 별도 학습된 이미지/언어 AI가 아닙니다.
- 실제 운영 전 여러 종류의 메뉴판으로 테스트하고 파서를 개선해야 합니다.

[AI 예측 한계]
- Random Forest는 40개 가상 데이터로 학습한 프로토타입입니다.
- 실제 혼잡도 정확도가 검증되지 않았습니다.
- 현재 메뉴 등록 결과는 예측 요청의 menu_category에 연결해야 합니다.
- 주간 메뉴 저장 후 /predict 요청에서 menu_category를 생략하면 저장된 해당 요일/식사의 메뉴를 찾아 대표 카테고리를 자동 적용합니다. 대표 카테고리는 메뉴 카테고리 등장 횟수 우선, 동률이면 가중치가 높은 카테고리를 선택합니다.


[하이브리드 이미지 인식 방식]
1. 1차: Tesseract OCR로 이미지/PDF에서 텍스트를 추출하고 평균 confidence를 계산합니다.
2. 2차 fallback: 아래 중 하나면 로컬 Ollama Qwen2.5-VL 모델을 호출합니다.
   - Tesseract 평균 confidence 65 미만
   - 추출된 메뉴 항목 3개 미만
   - 메뉴 카테고리 미분류 비율 40% 이상
3. Vision API가 요일/중식·석식/메뉴명을 JSON 형태로 추출합니다.
4. 메뉴 카테고리와 가중치는 기존 Python 분류 로직이 연결합니다.
5. 이용자가 결과를 확인·수정한 뒤 공용 주간 메뉴로 저장합니다.

[Ollama + Qwen2.5-VL 설정]
- 외부 API 키는 필요하지 않습니다.
- Ollama 설치: https://ollama.com/download
- Ollama 0.7.0 이상 설치 후 PowerShell에서:
  ollama pull qwen2.5vl:7b
- 모델 테스트:
  ollama run qwen2.5vl:7b
- 기본 주소: http://127.0.0.1:11434
- 선택적으로 주소/모델 변경:
  $env:OLLAMA_HOST="http://127.0.0.1:11434"
  $env:OLLAMA_VISION_MODEL="qwen2.5vl:7b"
- Tesseract 결과가 충분하면 Qwen 모델을 호출하지 않습니다.
- OCR 결과가 부족할 때는 Ollama가 실행 중이어야 합니다.

[중요]
- Tesseract 평균 confidence는 글자 인식 신뢰도의 대략적인 지표이지 메뉴판 구조가 정확하다는 보증은 아닙니다.
- Vision API도 오인식할 수 있으므로 사용자가 결과를 검토한 뒤 저장해야 합니다.
- PDF는 페이지를 이미지로 변환해 Vision API에 전달합니다.


[Ollama + Qwen2.5-VL 설치 - Windows]
1. Ollama 설치: https://ollama.com/download
2. Ollama 0.7.0 이상을 설치하고 실행합니다.
3. PowerShell에서 모델 다운로드:
   ollama pull qwen2.5vl:7b
4. 모델 실행/확인:
   ollama run qwen2.5vl:7b
5. 별도 터미널에서 FastAPI 실행:
   uvicorn main:app --reload

기본 Ollama 주소: http://127.0.0.1:11434
필요 시 환경변수:
   $env:OLLAMA_HOST="http://127.0.0.1:11434"
   $env:OLLAMA_VISION_MODEL="qwen2.5vl:7b"

[운영 관련 주의]
- 외부 AI API 키나 외부 API 사용량 한도는 없습니다. 모델 추론은 설치한 PC/서버에서 수행됩니다.
- 다만 무제한 성능을 뜻하지는 않습니다. 처리량은 CPU/GPU, RAM/VRAM, 동시 접속 수에 따라 달라집니다.
- 웹사이트를 다른 학생들이 이용하려면 Ollama를 실행하는 컴퓨터/서버가 계속 켜져 있고 FastAPI에서 접근 가능해야 합니다.
- 로컬 PC에서 개발할 때 127.0.0.1은 해당 PC 자신을 뜻합니다. 클라우드 배포 시 OLLAMA_HOST를 서버 내부 Ollama 주소로 변경해야 합니다.
- Qwen2.5-VL은 Ollama 공식 라이브러리 모델이며 현재 Ollama 0.7.0 이상이 필요합니다.
