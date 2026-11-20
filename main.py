
# -*- coding: utf-8 -*-
"""
MEAL FLOW - Integrated Backend

1. 주간 메뉴 크롤링 결과 연동
2. Tesseract OCR 메뉴 인식
3. 메뉴 카테고리 자동 분류
4. 메뉴 가중치 계산
5. Random Forest 혼잡도 예측
6. 현재 / 30분 후 / 60분 후 예측
7. 사용자 메뉴판 업로드 및 메뉴 수정
"""

from pathlib import Path
from datetime import datetime, timedelta, date
from typing import Optional
from collections import Counter
import json
import re
import io

import pandas as pd
import joblib

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

try:
    from PIL import Image
    import pytesseract
    import fitz
except ImportError:
    Image = None
    pytesseract = None
    fitz = None


# ==================================================
# 1. 기본 경로 및 설정
# ==================================================

BASE_DIR = Path(__file__).resolve().parent

DATA_PATH = BASE_DIR / "meal_flow_synthetic_40.csv"
MODEL_PATH = BASE_DIR / "meal_flow_rf_model.joblib"

# 크롤링 파이프라인 결과
PIPELINE_MENU_PATH = BASE_DIR / "weekly_menu.json"

# 웹사이트에서 사용할 정리된 메뉴 데이터
MENU_PATH = BASE_DIR / "weekly_menus.json"

TESSERACT_PATH = (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

if pytesseract is not None:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH


# ==================================================
# 2. Random Forest 설정
# ==================================================

FEATURES = [
    "요일",
    "식사구분",
    "시간",
    "메뉴카테고리",
    "메뉴가중치",
    "시험기간",
    "시험가중치"
]

TARGET = "실제동시이용인원"

WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]

MENU_WEIGHTS = {
    "육류·고기류": 1.00,
    "면류": 0.60,
    "밥류": 0.43,
    "국·탕·찌개류": 0.41,
    "분식류": 0.15,
    "해산물류": 0.12,
    "전·튀김류": 0.12
}


# ==================================================
# 3. 메뉴 카테고리 키워드
# ==================================================

CATEGORY_KEYWORDS = {
    "육류·고기류": [
        "제육", "불고기", "돈가스", "돈까스",
        "치킨", "닭갈비", "갈비", "삼겹",
        "고기", "돼지", "함박", "찜닭",
        "미트볼", "비엔나", "떡갈비",
        "순대", "수육", "보쌈", "스테이크",
        "닭볶음", "돈육", "소고기", "쇠고기"
    ],

    "면류": [
        "국수", "라면", "막국수", "우동",
        "파스타", "짬뽕", "짜장면", "냉면",
        "쫄면", "칼국수", "쌀국수", "소바",
        "볶음우동", "잔치국수"
    ],

    "밥류": [
        "비빔밥", "볶음밥", "덮밥", "김밥",
        "주먹밥", "카레라이스", "오므라이스",
        "필라프", "하이라이스", "포케",
        "마요밥", "밥"
    ],

    "국·탕·찌개류": [
        "찌개", "국", "탕", "전골",
        "육개장", "된장", "미역국",
        "순두부", "설렁탕", "짬뽕국",
        "어묵탕", "계란파국"
    ],

    "분식류": [
        "떡볶이", "떡볶음", "어묵",
        "핫도그", "꼬치"
    ],

    "해산물류": [
        "생선", "고등어", "갈치",
        "오징어", "새우", "해물",
        "조개", "연어", "참치",
        "멸치", "해파리", "어묵"
    ],

    "전·튀김류": [
        "전", "부침개", "튀김",
        "군만두", "돈까스", "맛탕"
    ]
}


# ==================================================
# 4. FastAPI 초기화
# ==================================================

app = FastAPI(
    title="MEAL FLOW API",
    version="2.0.0",
    description="주간 학식 메뉴 자동 수집 및 Random Forest 혼잡도 예측"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ==================================================
# 5. Random Forest 모델 생성
# ==================================================

def build_model():

    preprocessor = ColumnTransformer([
        (
            "cat",
            OneHotEncoder(handle_unknown="ignore"),
            ["요일", "식사구분", "메뉴카테고리"]
        ),
        (
            "num",
            "passthrough",
            ["시간", "메뉴가중치", "시험기간", "시험가중치"]
        )
    ])

    rf = RandomForestRegressor(
        n_estimators=250,
        max_depth=8,
        min_samples_leaf=1,
        random_state=42
    )

    return Pipeline([
        ("preprocess", preprocessor),
        ("random_forest", rf)
    ])


def load_and_train():

    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"학습 데이터가 없습니다: {DATA_PATH}"
        )

    df = pd.read_csv(
        DATA_PATH,
        encoding="utf-8-sig"
    )

    tm = pd.to_datetime(
        df["시간"],
        format="%H:%M"
    )

    df["시간"] = (
        tm.dt.hour + tm.dt.minute / 60
    )

    model = build_model()

    model.fit(
        df[FEATURES],
        df[TARGET]
    )

    joblib.dump(model, MODEL_PATH)

    print("[MODEL] Random Forest 학습 완료")

    return model


if MODEL_PATH.exists():

    try:
        model = joblib.load(MODEL_PATH)
        print("[MODEL] 기존 모델 로드 완료")

    except Exception:
        model = load_and_train()

else:
    model = load_and_train()


# ==================================================
# 6. 메뉴 카테고리 자동 분류
# ==================================================

def classify_menu(name: str):

    cleaned = re.sub(r"\s+", "", name)

    matches = []

    for category, keywords in CATEGORY_KEYWORDS.items():

        if any(keyword in cleaned for keyword in keywords):
            matches.append(category)

    if not matches:
        return "분류 확인 필요", None

    # 여러 카테고리가 매칭될 경우
    # 우선순위에 따라 대표 카테고리 선택
    category = matches[0]

    return category, MENU_WEIGHTS[category]


def calculate_menu_weight(items):

    weights = [
        item["weight"]
        for item in items
        if item.get("weight") is not None
    ]

    if not weights:
        return None

    return round(sum(weights) / len(weights), 3)


def get_representative_category(items):

    categories = [
        item["category"]
        for item in items
        if item.get("category") in MENU_WEIGHTS
    ]

    if not categories:
        return None

    counts = Counter(categories)

    return max(
        counts,
        key=lambda c: (
            counts[c],
            MENU_WEIGHTS[c]
        )
    )


# ==================================================
# 7. 메뉴 데이터 저장 및 불러오기
# ==================================================

def load_menus():

    if MENU_PATH.exists():

        try:
            return json.loads(
                MENU_PATH.read_text(encoding="utf-8")
            )

        except Exception:
            return {}

    return {}


def save_menus(data):

    MENU_PATH.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=4
        ),
        encoding="utf-8"
    )


# ==================================================
# 8. 크롤링 JSON을 예측용 데이터로 변환
# ==================================================

def convert_pipeline_menu():

    if not PIPELINE_MENU_PATH.exists():
        return None

    try:
        source = json.loads(
            PIPELINE_MENU_PATH.read_text(
                encoding="utf-8"
            )
        )

        week_start = source.get("week_start")

        if not week_start:
            return None

        menu_data = source.get("menu", {})

        converted_items = []

        day_mapping = {
            "월요일": "월",
            "화요일": "화",
            "수요일": "수",
            "목요일": "목",
            "금요일": "금"
        }

        # OCR에서 제외할 불필요한 문구
        ignored_keywords = [
            "그린샐러드",
            "드레싱",
            "배추김치",
            "현미밥",
            "잡곡밥",
            "쌀밥",
            "단무지",
            "음료",
            "주스",
            "숭늉",
            "오미자차",
            "매실차",
            "요구르트",
            "한끼슬림팩",
            "선식세트",
            "성신여자대학교",
            "상단 메뉴",
            "연락 바랍니다",
            "조회수"
        ]

        for full_day, meals in menu_data.items():

            day = day_mapping.get(full_day)

            if not day:
                continue

            for meal_name in ["중식", "석식"]:

                meal_data = meals.get(meal_name, {})

                lines = meal_data.get("lines", [])

                for line in lines:

                    name = str(line).strip()

                    # 날짜 제거
                    if re.search(r"\d{4}-\d{2}-\d{2}", name):
                        continue

                    # OCR 잡문자 제거
                    name = re.sub(
                        r"^[\s|:：\-_=ㆍ]+",
                        "",
                        name
                    )

                    name = re.sub(
                        r"[\s|:：]+$",
                        "",
                        name
                    )

                    if len(name) < 2 or len(name) > 40:
                        continue

                    if any(
                        word in name
                        for word in ignored_keywords
                    ):
                        continue

                    # 명백한 OCR 잡문자 제외
                    if not re.search(
                        r"[가-힣]{2,}",
                        name
                    ):
                        continue

                    category, weight = classify_menu(name)

                    # 분류 가능한 주메뉴만 우선 저장
                    if category == "분류 확인 필요":
                        continue

                    converted_items.append({
                        "weekday": day,
                        "meal": meal_name,
                        "menu_name": name,
                        "category": category,
                        "weight": weight,
                        "recognition_source": "tesseract_pipeline"
                    })

        # 중복 제거
        unique_items = []
        seen = set()

        for item in converted_items:

            key = (
                item["weekday"],
                item["meal"],
                item["menu_name"]
            )

            if key not in seen:
                seen.add(key)
                unique_items.append(item)

        return {
            "source": source.get("source"),
            "post_title": source.get("post_title"),
            "post_url": source.get("post_url"),
            "week_start": week_start,
            "week_end": source.get("week_end"),
            "updated_at": source.get("updated_at"),
            "items": unique_items
        }

    except Exception as e:

        print("[MENU] 파이프라인 JSON 변환 실패:", e)

        return None



def sync_pipeline_menu():

    converted = convert_pipeline_menu()

    if not converted:
        return False

    menus = load_menus()
    week_start = converted["week_start"]

    existing = menus.get(week_start)

    # 사용자가 직접 확인하고 확정한 메뉴는 보호
    if existing and existing.get("source") == "user_confirmed":
        print("[MENU] 사용자 확정 메뉴 유지")
        return True

    # 기존 자동 수집 데이터와 비교
    if existing:
        old_url = existing.get("post_url")
        old_updated = existing.get("source_updated_at")

        new_url = converted.get("post_url")
        new_updated = converted.get("updated_at")

        # 게시글과 수정 시각이 모두 같으면 갱신 생략
        if old_url == new_url and old_updated == new_updated:
            print("[MENU] 변경된 메뉴 없음")
            return True

    # 신규 메뉴 또는 수정된 메뉴 저장
    menus[week_start] = {
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "source": "automatic_crawling",
        "post_url": converted.get("post_url"),
        "source_updated_at": converted.get("updated_at"),
        "items": converted["items"]
    }

    save_menus(menus)

    print("[MENU] 새 메뉴 또는 수정 메뉴 자동 반영:", week_start)

    return True



# ==================================================
# 9. 현재 날짜에 해당하는 메뉴 조회
# ==================================================

def get_meal(dt):

    t = dt.hour + dt.minute / 60

    if 11 <= t < 13.5:
        return "중식"

    if 17 <= t < 18.5:
        return "석식"

    return None


def resolve_saved_menu_info(dt):

    sync_pipeline_menu()

    monday = (
        dt.date() -
        timedelta(days=dt.weekday())
    ).isoformat()

    saved = load_menus().get(monday)

    if not saved:
        return None, None, None

    meal = get_meal(dt)

    if meal is None:
        return None, None, None

    day = WEEKDAYS[dt.weekday()]

    items = [
        item for item in saved.get("items", [])
        if item.get("weekday") == day
        and item.get("meal") == meal
        and item.get("category") in MENU_WEIGHTS
    ]

    if not items:
        return None, None, None

    category = get_representative_category(items)

    weight = calculate_menu_weight(items)

    return category, weight, items


# ==================================================
# 10. 사용자 요청 모델
# ==================================================

class MenuConfirm(BaseModel):

    week_start: str = Field(
        ...,
        description="주 시작일 YYYY-MM-DD"
    )

    items: list[dict]


class PredictRequest(BaseModel):

    menu_category: Optional[str] = None

    menu_weight: Optional[float] = None

    exam: bool = False

    now: Optional[str] = None


# ==================================================
# 11. 혼잡도 예측
# ==================================================

def predict_at(dt, menu_category, menu_weight, exam):

    meal = get_meal(dt)

    if meal is None:

        return {
            "datetime": dt.isoformat(timespec="minutes"),
            "status": "closed",
            "message": "현재 학식 운영시간이 아닙니다."
        }

    if dt.weekday() >= 5:

        return {
            "datetime": dt.isoformat(timespec="minutes"),
            "status": "unsupported_day",
            "message": "주말은 현재 학습 데이터 범위 밖입니다."
        }

    if not menu_category:

        return {
            "datetime": dt.isoformat(timespec="minutes"),
            "status": "menu_required",
            "message": "해당 날짜의 메뉴 데이터가 없습니다."
        }

    if menu_category not in MENU_WEIGHTS:

        return {
            "datetime": dt.isoformat(timespec="minutes"),
            "status": "invalid_menu",
            "message": "등록되지 않은 메뉴 카테고리입니다."
        }

    # 메뉴 가중치가 전달되지 않았다면 기본값 사용
    if menu_weight is None:
        menu_weight = MENU_WEIGHTS[menu_category]

    exam_value = 1 if exam else 0

    row = pd.DataFrame([{

        "요일": WEEKDAYS[dt.weekday()],

        "식사구분": meal,

        "시간": dt.hour + dt.minute / 60,

        "메뉴카테고리": menu_category,

        "메뉴가중치": menu_weight,

        "시험기간": exam_value,

        "시험가중치": 1.20 if exam else 1.00

    }])

    raw = float(
        model.predict(row[FEATURES])[0]
    )

    people = max(0, round(raw))

    seat_count = 130

    occupancy = people / seat_count * 100

    if occupancy < 40:
        level = "여유"

    elif occupancy < 70:
        level = "보통"

    elif occupancy < 90:
        level = "혼잡"

    else:
        level = "매우 혼잡"

    return {

        "datetime": dt.isoformat(timespec="minutes"),

        "status": "ok",

        "meal": meal,

        "menu_category": menu_category,

        "menu_weight": menu_weight,

        "predicted_people": people,

        "raw_prediction": round(raw, 2),

        "occupancy_percent": round(occupancy, 1),

        "congestion": level,

        "seat_count": seat_count,

        "is_synthetic_model": True
    }


# ==================================================
# 12. 이미지 / PDF 업로드 처리
# ==================================================

def upload_to_images(filename, content):

    if Image is None or fitz is None:

        raise HTTPException(
            500,
            "Pillow와 PyMuPDF가 설치되지 않았습니다."
        )

    ext = Path(filename).suffix.lower()

    try:

        if ext in [
            ".png", ".jpg", ".jpeg",
            ".bmp", ".webp"
        ]:

            return [
                Image.open(
                    io.BytesIO(content)
                ).convert("RGB")
            ]

        if ext == ".pdf":

            pdf = fitz.open(
                stream=content,
                filetype="pdf"
            )

            images = []

            for page in pdf:

                pix = page.get_pixmap(
                    matrix=fitz.Matrix(2, 2),
                    alpha=False
                )

                images.append(
                    Image.open(
                        io.BytesIO(pix.tobytes("png"))
                    ).convert("RGB")
                )

            return images

    except Exception as e:

        raise HTTPException(
            422,
            f"이미지 변환 실패: {e}"
        )

    raise HTTPException(
        400,
        "PNG/JPG/WEBP/PDF 파일만 지원합니다."
    )


def run_tesseract(images):

    if Image is None or pytesseract is None:
        raise HTTPException(
            500,
            "Tesseract 또는 Pillow가 설치되지 않았습니다."
        )

    page_texts = []
    confidences = []

    try:

        for image in images:

            data = pytesseract.image_to_data(
                image,
                lang="kor+eng",
                output_type=pytesseract.Output.DICT
            )

            words = []

            for word, conf in zip(
                data.get("text", []),
                data.get("conf", [])
            ):

                word = str(word).strip()

                try:
                    score = float(conf)
                except (TypeError, ValueError):
                    score = -1

                if word:

                    words.append(word)

                    if score >= 0:
                        confidences.append(score)

            page_texts.append(" ".join(words))

        avg_conf = (
            sum(confidences) / len(confidences)
            if confidences else 0
        )

        return "\n".join(page_texts), avg_conf

    except Exception as e:

        raise HTTPException(
            500,
            f"OCR 실행 실패: {e}"
        )


# ==================================================
# 13. 업로드 메뉴 텍스트 파싱
# ==================================================

def parse_menu_text(text, week_start=None):

    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in text.splitlines()
    ]

    items = []

    current_day = None
    current_meal = "중식"

    day_patterns = {
        "월": "월", "월요일": "월",
        "화": "화", "화요일": "화",
        "수": "수", "수요일": "수",
        "목": "목", "목요일": "목",
        "금": "금", "금요일": "금"
    }

    for line in lines:

        if not line:
            continue

        for key, value in day_patterns.items():

            if re.search(
                rf"(^|[\s\[\(]){key}($|[\s\]\):：])",
                line
            ):

                current_day = value
                break

        if "석식" in line or "저녁" in line:
            current_meal = "석식"

        elif "중식" in line or "점심" in line:
            current_meal = "중식"

        if not current_day:
            continue

        if len(line) > 40:
            continue

        if re.search(r"\d{4}-\d{2}-\d{2}", line):
            continue

        name = line.strip(" •·-|:")

        if len(name) < 2:
            continue

        category, weight = classify_menu(name)

        items.append({
            "weekday": current_day,
            "meal": current_meal,
            "menu_name": name,
            "category": category,
            "weight": weight
        })

    unique = []
    seen = set()

    for item in items:

        key = (
            item["weekday"],
            item["meal"],
            item["menu_name"]
        )

        if key not in seen:

            seen.add(key)
            unique.append(item)

    return unique


# ==================================================
# 14. API: 상태 확인
# ==================================================

@app.get("/health")
def health():

    return {

        "status": "ok",

        "service": "MEAL FLOW",

        "model": "RandomForestRegressor",

        "trees": 250,

        "training_data": "40 synthetic rows",

        "pipeline_menu_exists": PIPELINE_MENU_PATH.exists(),

        "saved_menu_exists": MENU_PATH.exists()
    }


# ==================================================
# 15. API: 크롤링 메뉴 동기화
# ==================================================

@app.post("/menu/sync")
def sync_menu():

    success = sync_pipeline_menu()

    if not success:

        raise HTTPException(
            404,
            "weekly_menu.json을 찾지 못했습니다."
        )

    return {
        "status": "success",
        "message": "크롤링 메뉴 데이터 동기화 완료",
        "menu_file": str(PIPELINE_MENU_PATH)
    }


# ==================================================
# 16. API: 메뉴판 업로드
# ==================================================

@app.post("/menu/upload")
async def upload_menu(
    file: UploadFile = File(...),
    week_start: Optional[str] = None
):

    content = await file.read()

    if len(content) > 15 * 1024 * 1024:

        raise HTTPException(
            413,
            "파일 크기는 15MB 이하로 업로드해 주세요."
        )

    images = upload_to_images(
        file.filename or "upload",
        content
    )

    text, confidence = run_tesseract(images)

    items = parse_menu_text(
        text,
        week_start
    )

    return {

        "filename": file.filename,

        "week_start": week_start,

        "ocr_text": text,

        "tesseract_confidence": round(confidence, 1),

        "items": items,

        "notice": "OCR 결과를 확인하고 수정한 뒤 저장하세요."
    }


# ==================================================
# 17. API: 메뉴 확정 및 저장
# ==================================================

@app.post("/menu/confirm")
def confirm_menu(payload: MenuConfirm):

    try:

        datetime.strptime(
            payload.week_start,
            "%Y-%m-%d"
        )

    except ValueError:

        raise HTTPException(
            400,
            "week_start는 YYYY-MM-DD 형식이어야 합니다."
        )

    valid = []

    for item in payload.items:

        day = item.get("weekday")

        meal = item.get("meal")

        name = str(
            item.get("menu_name", "")
        ).strip()

        category = item.get("category")

        if (
            day not in WEEKDAYS
            or meal not in ["중식", "석식"]
            or not name
        ):
            continue

        if category not in MENU_WEIGHTS:

            category, weight = classify_menu(name)

        else:

            weight = MENU_WEIGHTS[category]

        valid.append({

            "weekday": day,

            "meal": meal,

            "menu_name": name,

            "category": category,

            "weight": weight

        })

    menus = load_menus()

    menus[payload.week_start] = {

        "saved_at": datetime.now().isoformat(
            timespec="seconds"
        ),

        "source": "user_confirmed",

        "items": valid
    }

    save_menus(menus)

    return {

        "status": "saved",

        "week_start": payload.week_start,

        "saved_count": len(valid),

        "items": valid,

        "notice": "확정 메뉴가 공용 메뉴 데이터에 저장되었습니다."
    }


# ==================================================
# 18. API: 주간 메뉴 조회
# ==================================================

@app.get("/menu")
def get_menu(week_start: str):

    sync_pipeline_menu()

    menus = load_menus()

    if week_start not in menus:

        return {
            "status": "not_found",
            "items": []
        }

    return {
        "status": "ok",
        **menus[week_start]
    }


# ==================================================
# 19. API: 현재 / 30분 후 / 60분 후 예측
# ==================================================

@app.post("/predict")
def predict(payload: PredictRequest):

    try:

        now = (
            datetime.fromisoformat(payload.now)
            if payload.now
            else datetime.now()
        )

    except ValueError:

        raise HTTPException(
            400,
            "now는 ISO 날짜 형식이어야 합니다."
        )

    results = []

    time_points = [
        ("현재", now),
        ("30분 후", now + timedelta(minutes=30)),
        ("60분 후", now + timedelta(minutes=60))
    ]

    for label, dt in time_points:

        # 사용자가 직접 카테고리를 입력한 경우 우선 사용
        if payload.menu_category:

            category = payload.menu_category

            weight = (
                payload.menu_weight
                if payload.menu_weight is not None
                else MENU_WEIGHTS.get(category)
            )

            menu_source = "request"

        else:

            category, weight, items = resolve_saved_menu_info(dt)

            menu_source = "weekly_menu_pipeline"

        result = predict_at(
            dt,
            category,
            weight,
            payload.exam
        )

        result["menu_category_used"] = category

        result["menu_weight_used"] = weight

        result["menu_source"] = menu_source

        results.append({
            "label": label,
            **result
        })

    return {

        "current_time": now.isoformat(
            timespec="minutes"
        ),

        "predictions": results,

        "notice": (
            "현재 모델은 가상 학습 데이터 40개로 "
            "학습한 시제품입니다."
        )
    }


# ==================================================
# 20. 기본 주소
# ==================================================

@app.get("/")
def root():

    return {

        "message": "MEAL FLOW API is running",

        "version": "2.0.0",

        "docs": "/docs",

        "model": "Random Forest 250 trees"
    }


# ==================================================
# 21. 서버 실행
# ==================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000
    )
