# -*- coding: utf-8 -*-
"""
MEAL FLOW backend
- weekly menu image/PDF upload
- OCR extraction (Tesseract Korean language data required)
- menu parsing + category suggestion
- admin confirmation and weekly menu storage
- Random Forest current / +30m / +60m prediction API

주의: 현재 Random Forest는 40개 가상 학습 데이터로 만든 시제품입니다.
"""

from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
import json
import re
import io
import os
import base64

import pandas as pd
import joblib
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import requests

from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

try:
    from PIL import Image
    import pytesseract
    import fitz  # PyMuPDF
except ImportError:
    Image = None
    pytesseract = None
    fitz = None

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "meal_flow_synthetic_40.csv"
MODEL_PATH = BASE_DIR / "meal_flow_rf_model.joblib"
MENU_PATH = BASE_DIR / "weekly_menus.json"

FEATURES = ["요일", "식사구분", "시간", "메뉴카테고리",
            "메뉴가중치", "시험기간", "시험가중치"]
TARGET = "실제동시이용인원"
WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]
MENU_WEIGHTS = {
    "육류·고기류": 1.00,
    "면류": 0.60,
    "밥류": 0.43,
    "국·탕·찌개류": 0.41,
    "분식류": 0.15,
    "해산물류": 0.12,
    "전·튀김류": 0.12,
}
CATEGORY_KEYWORDS = {
    "육류·고기류": ["제육", "불고기", "돈가스", "돈까스", "치킨", "닭갈비",
                  "갈비", "삼겹", "고기", "소불고기", "돼지", "함박", "찜닭"],
    "면류": ["국수", "라면", "막국수", "우동", "파스타", "짬뽕", "짜장면",
           "냉면", "쫄면", "칼국수", "쌀국수", "소바"],
    "밥류": ["비빔밥", "볶음밥", "덮밥", "김밥", "주먹밥", "카레라이스",
           "오므라이스", "밥"],
    "국·탕·찌개류": ["찌개", "국", "탕", "전골", "육개장", "된장", "미역국",
                  "순두부", "설렁탕"],
    "분식류": ["떡볶이", "순대", "튀김", "어묵", "핫도그"],
    "해산물류": ["생선", "고등어", "갈치", "오징어", "새우", "해물", "조개", "연어"],
    "전·튀김류": ["전", "부침개", "돈까스", "튀김", "감자전"],
}

app = FastAPI(
    title="MEAL FLOW API",
    version="1.2.0",
    description="누구나 주간 메뉴판을 업로드할 수 있습니다. Tesseract OCR 우선 처리 후 필요하면 Ollama Qwen2.5-VL로 보완합니다."
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 배포 시 UI 도메인으로 제한 권장
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def build_model():
    pre = ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"),
         ["요일", "식사구분", "메뉴카테고리"]),
        ("num", "passthrough",
         ["시간", "메뉴가중치", "시험기간", "시험가중치"]),
    ])
    rf = RandomForestRegressor(
        n_estimators=250, max_depth=8,
        min_samples_leaf=1, random_state=42
    )
    return Pipeline([("preprocess", pre), ("random_forest", rf)])

def load_and_train():
    df = pd.read_csv(DATA_PATH, encoding="utf-8-sig")
    tm = pd.to_datetime(df["시간"], format="%H:%M")
    df["시간"] = tm.dt.hour + tm.dt.minute / 60
    model = build_model()
    model.fit(df[FEATURES], df[TARGET])
    joblib.dump(model, MODEL_PATH)
    return model

if MODEL_PATH.exists():
    try:
        model = joblib.load(MODEL_PATH)
    except Exception:
        model = load_and_train()
else:
    model = load_and_train()

def load_menus():
    if MENU_PATH.exists():
        return json.loads(MENU_PATH.read_text(encoding="utf-8"))
    return {}

def save_menus(data):
    MENU_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                         encoding="utf-8")


def upload_to_images(filename: str, content: bytes):
    """업로드 이미지/PDF를 이미지 객체 목록으로 변환."""
    if Image is None or fitz is None:
        raise HTTPException(500, "Pillow와 PyMuPDF가 설치되지 않았습니다.")
    ext = Path(filename).suffix.lower()
    try:
        if ext in [".png", ".jpg", ".jpeg", ".bmp", ".webp"]:
            return [Image.open(io.BytesIO(content)).convert("RGB")]
        if ext == ".pdf":
            pdf = fitz.open(stream=content, filetype="pdf")
            images = []
            for page in pdf:
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                images.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
            return images
    except Exception as e:
        raise HTTPException(422, f"파일 이미지 변환 실패: {e}")
    raise HTTPException(400, "지원하지 않는 파일입니다. PNG/JPG/WEBP/PDF를 업로드하세요.")


def image_to_png_bytes(image):
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def run_tesseract(images):
    """1차: 로컬 Tesseract OCR 및 평균 신뢰도 계산."""
    if Image is None or pytesseract is None:
        return "", 0.0
    page_texts, confidences = [], []
    try:
        for image in images:
            data = pytesseract.image_to_data(
                image, lang="kor+eng", output_type=pytesseract.Output.DICT
            )
            words = []
            for word, conf in zip(data.get("text", []), data.get("conf", [])):
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
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
        return "\n".join(page_texts), avg_conf
    except Exception:
        return "", 0.0



def run_qwen_vision(images):
    """2차: 로컬 Ollama 서버의 Qwen2.5-VL로 메뉴판 구조를 분석."""
    ollama_url = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
    model_name = os.getenv("OLLAMA_VISION_MODEL", "qwen2.5vl:7b")

    image_payloads = [
        base64.b64encode(image_to_png_bytes(image)).decode("ascii")
        for image in images[:8]
    ]

    prompt = """
너는 한국 대학교 식당 주간 메뉴판을 읽는 데이터 추출기다.
이미지의 표 행과 열 배치를 확인해 요일별, 식사별 메뉴를 정확히 연결하라.
중식과 석식을 구분하고 메뉴명은 이미지에 보이는 표현을 그대로 적어라.
추측해서 없는 메뉴를 만들지 말고 판독이 어려우면 confidence를 low로 표시하라.
반드시 JSON 객체 하나만 반환하고 설명이나 마크다운 코드블록은 쓰지 마라.
형식:
{"items":[{"weekday":"월","meal":"중식","menu_name":"메뉴명","confidence":"high"}],
 "notes":["판독상 주의사항"]}
weekday는 월/화/수/목/금/토/일, meal은 중식 또는 석식,
confidence는 high/medium/low다. 한 칸에 메뉴가 여러 개면 각각 항목으로 만든다.
"""
    try:
        response = requests.post(
            f"{ollama_url}/api/chat",
            json={
                "model": model_name,
                "messages": [{
                    "role": "user",
                    "content": prompt,
                    "images": image_payloads
                }],
                "stream": False,
                "format": "json",
                "options": {"temperature": 0}
            },
            timeout=300
        )
        response.raise_for_status()
        raw = response.json()["message"]["content"].strip()
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE)
        parsed = json.loads(raw)
        result = []
        for item in parsed.get("items", []):
            day, meal = item.get("weekday"), item.get("meal")
            name = str(item.get("menu_name", "")).strip()
            if day not in WEEKDAYS or meal not in ["중식", "석식"] or not name:
                continue
            category, weight = classify_menu(name)
            result.append({
                "weekday": day,
                "meal": meal,
                "menu_name": name,
                "category": category,
                "weight": weight,
                "recognition_confidence": item.get("confidence", "medium"),
                "recognition_source": "ollama_qwen2.5vl"
            })
        return result, parsed.get("notes", [])
    except requests.exceptions.ConnectionError:
        raise HTTPException(
            503,
            "Ollama 서버에 연결할 수 없습니다. Ollama를 실행하고 Qwen2.5-VL 모델을 내려받았는지 확인하세요."
        )
    except requests.exceptions.Timeout:
        raise HTTPException(504, "Qwen 이미지 분석 시간이 초과되었습니다. 이미지 크기나 페이지 수를 줄여주세요.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Qwen 이미지 분석에 실패했습니다: {e}")

def extract_text_from_upload(filename: str, content: bytes) -> str:
    """호환용 Tesseract 텍스트 추출 함수."""
    images = upload_to_images(filename, content)
    text, _ = run_tesseract(images)
    return text

def classify_menu(name: str):
    cleaned = name.strip()
    matches = []
    for category, keywords in CATEGORY_KEYWORDS.items():
        if any(k in cleaned for k in keywords):
            matches.append(category)
    # 메뉴명 하나에 여러 카테고리가 매칭되면 가장 먼저 정의된 분류를 제안
    category = matches[0] if matches else "분류 확인 필요"
    weight = MENU_WEIGHTS.get(category)
    return category, weight

def parse_menu_text(text: str, week_start: Optional[str]):
    """
    Best-effort line parser. OCR layouts vary, so this returns editable suggestions.
    Recognizes weekday headings and meal headings; lines that cannot be mapped
    are still returned for admin correction.
    """
    lines = [re.sub(r"\s+", " ", x).strip(" •·-|\t") for x in text.splitlines()]
    lines = [x for x in lines if x and len(x) <= 100]
    day_map = {
        "월": "월", "월요일": "월", "화": "화", "화요일": "화",
        "수": "수", "수요일": "수", "목": "목", "목요일": "목",
        "금": "금", "금요일": "금", "토": "토", "토요일": "토",
        "일": "일", "일요일": "일"
    }
    current_day = None
    current_meal = "중식"
    items = []
    for line in lines:
        day_found = None
        for key, val in day_map.items():
            if re.search(rf"(^|[\s\[\(]){key}($|[\s\]\):：])", line):
                day_found = val
                break
        if day_found:
            current_day = day_found
        if "석식" in line or "저녁" in line:
            current_meal = "석식"
        elif "중식" in line or "점심" in line:
            current_meal = "중식"

        # Ignore obvious labels/date-only lines
        content = re.sub(r"(월요일|화요일|수요일|목요일|금요일|월|화|수|목|금)\s*", "", line)
        content = re.sub(r"(중식|석식|점심|저녁|조식)", "", content).strip(" :：")
        if current_day and content and not re.fullmatch(r"\d{1,2}[./-]\d{1,2}", content):
            # Split common menu separators
            names = [n.strip() for n in re.split(r"[,，/|·•]", content) if n.strip()]
            for name in names:
                if len(name) < 2 or name in ["메뉴", "식단", "메뉴표"]:
                    continue
                cat, weight = classify_menu(name)
                items.append({
                    "weekday": current_day,
                    "meal": current_meal,
                    "menu_name": name,
                    "category": cat,
                    "weight": weight
                })
    # de-duplicate exact OCR repeats
    seen, unique = set(), []
    for item in items:
        key = (item["weekday"], item["meal"], item["menu_name"])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    return unique

class MenuConfirm(BaseModel):
    week_start: str = Field(..., description="주 시작일 YYYY-MM-DD")
    items: list[dict]

class PredictRequest(BaseModel):
    menu_category: Optional[str] = None
    exam: bool = False
    now: Optional[str] = None  # optional ISO datetime for testing; otherwise server local time

def get_meal(dt):
    t = dt.hour + dt.minute / 60
    if 11 <= t < 13.5:
        return "중식"
    if 17 <= t < 18.5:
        return "석식"
    return None

def resolve_saved_menu_category(dt):
    """저장된 해당 주간 메뉴에서 요일/중식·석식에 맞는 대표 카테고리를 찾습니다."""
    monday = (dt.date() - timedelta(days=dt.weekday())).isoformat()
    saved = load_menus().get(monday)
    if not saved:
        return None
    meal = get_meal(dt)
    if meal is None:
        return None
    day = WEEKDAYS[dt.weekday()]
    categories = [
        item.get("category") for item in saved.get("items", [])
        if item.get("weekday") == day
        and item.get("meal") == meal
        and item.get("category") in MENU_WEIGHTS
    ]
    if not categories:
        return None
    # 대표 카테고리 선정: 메뉴에 가장 많이 등장한 카테고리.
    # 동률이면 현재 MENU_WEIGHTS에서 가중치가 높은 카테고리를 선택합니다.
    counts = {c: categories.count(c) for c in set(categories)}
    return sorted(counts, key=lambda c: (counts[c], MENU_WEIGHTS[c]), reverse=True)[0]


def predict_at(dt, menu_category, exam):
    meal = get_meal(dt)
    if meal is None:
        return {"datetime": dt.isoformat(timespec="minutes"),
                "status": "closed", "message": "현재 학식 운영시간이 아닙니다."}
    if dt.weekday() >= 5:
        return {"datetime": dt.isoformat(timespec="minutes"),
                "status": "unsupported_day", "message": "주말은 현재 학습 데이터 범위 밖입니다."}
    if not menu_category:
        return {"datetime": dt.isoformat(timespec="minutes"),
                "status": "menu_required", "message": "해당 날짜의 메뉴 카테고리를 등록해 주세요."}
    if menu_category not in MENU_WEIGHTS:
        return {"datetime": dt.isoformat(timespec="minutes"),
                "status": "invalid_menu", "message": "등록되지 않은 메뉴 카테고리입니다."}
    exam_value = 1 if exam else 0
    row = pd.DataFrame([{
        "요일": WEEKDAYS[dt.weekday()],
        "식사구분": meal,
        "시간": dt.hour + dt.minute / 60,
        "메뉴카테고리": menu_category,
        "메뉴가중치": MENU_WEIGHTS[menu_category],
        "시험기간": exam_value,
        "시험가중치": 1.20 if exam else 1.00
    }])
    raw = float(model.predict(row[FEATURES])[0])
    # Keep raw prediction visible; do not cap to seat count.
    people = max(0, round(raw))
    occupancy = people / 130 * 100
    if occupancy < 40: level = "여유"
    elif occupancy < 70: level = "보통"
    elif occupancy < 90: level = "혼잡"
    else: level = "매우 혼잡"
    return {
        "datetime": dt.isoformat(timespec="minutes"),
        "status": "ok",
        "meal": meal,
        "predicted_people": people,
        "raw_prediction": round(raw, 2),
        "occupancy_percent": round(occupancy, 1),
        "congestion": level,
        "seat_count": 130,
        "is_synthetic_model": True
    }

@app.get("/health")
def health():
    return {"status": "ok", "service": "MEAL FLOW", "model": "RandomForestRegressor",
            "trees": 250, "training_data": "40 synthetic rows"}

@app.post("/menu/upload")
async def upload_menu(file: UploadFile = File(...), week_start: Optional[str] = None):
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(413, "파일 크기는 15MB 이하로 업로드해 주세요.")

    images = upload_to_images(file.filename or "upload", content)

    # 1차: Tesseract OCR
    ocr_text, ocr_confidence = run_tesseract(images)
    ocr_items = parse_menu_text(ocr_text, week_start)
    unknown_count = sum(
        1 for item in ocr_items
        if item.get("category") == "분류 확인 필요"
    )

    # 인식 품질이 낮을 때만 2차 Vision API 호출
    fallback_reasons = []
    if ocr_confidence < 65:
        fallback_reasons.append("tesseract_confidence_low")
    if len(ocr_items) < 3:
        fallback_reasons.append("too_few_menu_items")
    if ocr_items and unknown_count / len(ocr_items) >= 0.4:
        fallback_reasons.append("many_unclassified_items")

    vision_notes = []
    if fallback_reasons:
        vision_items, vision_notes = run_qwen_vision(images)
        if len(vision_items) >= max(3, len(ocr_items) // 2):
            items = vision_items
            method = "tesseract_then_ollama_qwen"
        else:
            items = vision_items or ocr_items
            method = "hybrid_fallback_low_result"
    else:
        items = ocr_items
        method = "tesseract_only"

    return {
        "filename": file.filename,
        "week_start": week_start,
        "ocr_text": ocr_text,
        "tesseract_confidence": round(ocr_confidence, 1),
        "recognition_method": method,
        "fallback_reasons": fallback_reasons,
        "vision_notes": vision_notes,
        "items": items,
        "notice": "Tesseract를 먼저 사용하고 인식 결과가 부족하면 이미지 인식 AI로 보완합니다. 결과를 확인·수정한 뒤 공용 메뉴로 저장하세요."
    }

@app.post("/menu/confirm")
def confirm_menu(payload: MenuConfirm):
    try:
        datetime.strptime(payload.week_start, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "week_start는 YYYY-MM-DD 형식이어야 합니다.")
    valid = []
    for item in payload.items:
        day = item.get("weekday")
        meal = item.get("meal")
        name = str(item.get("menu_name", "")).strip()
        category = item.get("category")
        if day not in WEEKDAYS or meal not in ["중식", "석식"] or not name:
            continue
        if category not in MENU_WEIGHTS:
            category = "분류 확인 필요"
        valid.append({
            "weekday": day, "meal": meal, "menu_name": name,
            "category": category,
            "weight": MENU_WEIGHTS.get(category)
        })
    menus = load_menus()
    menus[payload.week_start] = {
        "saved_at": datetime.now().isoformat(timespec="seconds"),
        "items": valid
    }
    save_menus(menus)
    return {"status": "saved", "week_start": payload.week_start,
            "saved_count": len(valid), "items": valid,
            "notice": "메뉴가 공용 주간 메뉴로 저장되어 모든 웹사이트 이용자의 예측에 적용됩니다."}

@app.get("/menu")
def get_menu(week_start: str):
    menus = load_menus()
    if week_start not in menus:
        return {"status": "not_found", "items": []}
    return {"status": "ok", **menus[week_start]}

@app.post("/predict")
def predict(payload: PredictRequest):
    now = datetime.fromisoformat(payload.now) if payload.now else datetime.now()
    results = []
    for label, dt in [
        ("현재", now),
        ("30분 후", now + timedelta(minutes=30)),
        ("60분 후", now + timedelta(minutes=60))
    ]:
        # 요청에 메뉴 카테고리가 직접 오면 우선 사용하고,
        # 없으면 업로드·저장된 주간 메뉴에서 자동으로 찾아 적용합니다.
        category = payload.menu_category or resolve_saved_menu_category(dt)
        result = predict_at(dt, category, payload.exam)
        result["menu_category_used"] = category
        result["menu_source"] = "request" if payload.menu_category else "weekly_menu_upload"
        results.append({"label": label, **result})
    return {
        "current_time": now.isoformat(timespec="minutes"),
        "predictions": results,
        "notice": "현재 모델은 가상 학습 데이터 40개로 학습한 시제품입니다."
    }

@app.get("/")
def root():
    return {"message": "MEAL FLOW API is running", "docs": "/docs"}
