
import os
import requests
import pytesseract
import json
import re

from bs4 import BeautifulSoup
from PIL import Image
from pathlib import Path
from urllib.parse import urljoin
from datetime import date, datetime

# =====================================
# 1. 기본 설정
# =====================================

BASE_DIR = Path(__file__).resolve().parent

BASE_URL = "https://www.sungshin.ac.kr"
MENU_URL = BASE_URL + "/main_kor/11076/subview.do"

IMAGE_DIR = BASE_DIR / "menu_images"
CROP_DIR = BASE_DIR / "menu_crops"
JSON_PATH = BASE_DIR / "weekly_menu.json"

# 환경변수 TESSERACT_PATH 우선, 없으면 윈도우 기본 경로 확인,
# 그 외에는 PATH 의 tesseract 사용
TESSERACT_PATH = os.getenv(
    "TESSERACT_PATH",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

if Path(TESSERACT_PATH).exists():
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}

DAYS = ["월요일", "화요일", "수요일", "목요일", "금요일"]

# 기존에 테스트한 이미지 분리 좌표
DAY_POSITIONS = [
    ("월요일", 0.105, 0.28),
    ("화요일", 0.28, 0.455),
    ("수요일", 0.455, 0.63),
    ("목요일", 0.63, 0.805),
    ("금요일", 0.805, 0.985)
]

MEAL_POSITIONS = [
    ("중식", 0.15, 0.56),
    ("석식", 0.48, 0.99)
]


# =====================================
# 2. 홈페이지 주간 메뉴 게시글 수집
# =====================================

def get_menu_posts():

    response = requests.get(
        MENU_URL,
        headers=HEADERS,
        timeout=20
    )

    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    posts = []

    for cell in soup.select("td._artclTdTitle"):

        link = cell.select_one("a.artclLinkView")

        if not link:
            continue

        title = link.get_text(" ", strip=True)

        if "주간메뉴" not in title:
            continue

        match = re.search(
            r"\((\d{1,2})[./-](\d{1,2})\s*~\s*"
            r"(\d{1,2})[./-](\d{1,2})\)",
            title
        )

        if not match:
            continue

        sm, sd, em, ed = map(int, match.groups())

        today = date.today()

        # 오늘 날짜를 포함하는 기간인지 확인
        for year in [today.year - 1, today.year, today.year + 1]:

            start = date(year, sm, sd)

            end_year = year + 1 if (em, ed) < (sm, sd) else year
            end = date(end_year, em, ed)

            if start <= today <= end:

                posts.append({
                    "title": title,
                    "url": urljoin(MENU_URL, link["href"]),
                    "start": str(start),
                    "end": str(end)
                })

                break

    return posts


# =====================================
# 3. 이번 주 게시글 선택
# =====================================

def select_this_week(posts):

    if not posts:
        raise Exception(
            "오늘 날짜에 해당하는 주간 메뉴가 없습니다."
        )

    post = posts[0]

    print("\n[이번 주 메뉴 선택]")
    print("제목:", post["title"])
    print("기간:", post["start"], "~", post["end"])

    return post


# =====================================
# 4. 메뉴판 이미지 다운로드
# =====================================

def download_menu_image(post):

    response = requests.get(
        post["url"],
        headers=HEADERS,
        timeout=20
    )

    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    image = soup.find(
        "img",
        src=re.compile(r"editorUpload/images", re.I)
    )

    if not image:
        raise Exception(
            "게시글에서 메뉴판 이미지를 찾지 못했습니다."
        )

    image_url = urljoin(post["url"], image["src"])

    image_response = requests.get(
        image_url,
        headers=HEADERS,
        timeout=20
    )

    image_response.raise_for_status()

    IMAGE_DIR.mkdir(exist_ok=True)

    image_path = IMAGE_DIR / "this_week_menu.png"

    from io import BytesIO

    original = Image.open(
        BytesIO(image_response.content)
    ).convert("RGB")

    original.save(image_path)

    print("\n[이미지 다운로드 완료]")
    print(image_path)

    return image_path


# =====================================
# 5. 요일별 중식 / 석식 분리
# =====================================

def crop_menu_images(image_path):

    image = Image.open(image_path)

    width, height = image.size

    CROP_DIR.mkdir(exist_ok=True)

    crop_paths = {}

    for day, x1, x2 in DAY_POSITIONS:

        for meal, y1, y2 in MEAL_POSITIONS:

            cropped = image.crop((
                int(width * x1),
                int(height * y1),
                int(width * x2),
                int(height * y2)
            ))

            filename = f"{day}_{meal}.png"

            save_path = CROP_DIR / filename

            cropped.save(save_path)

            crop_paths[(day, meal)] = save_path

    print("\n[이미지 분리 완료]")
    print("총 이미지:", len(crop_paths))

    return crop_paths


# =====================================
# 6. Tesseract OCR 실행
# =====================================

def recognize_menu(crop_paths):

    results = {}

    for (day, meal), image_path in crop_paths.items():

        image = Image.open(image_path)

        # 이미지 확대
        image = image.resize((
            image.width * 2,
            image.height * 2
        ))

        text = pytesseract.image_to_string(
            image,
            lang="kor+eng",
            config="--psm 6"
        )

        lines = [
            line.strip()
            for line in text.splitlines()
            if line.strip()
        ]

        results.setdefault(day, {})

        results[day][meal] = {
            "raw_text": text,
            "lines": lines
        }

        print(f"\n[{day} {meal}]")

        for line in lines:
            print(line)

    return results


# =====================================
# 7. JSON 파일 저장
# =====================================

def save_json(post, results):

    data = {
        "source": "성신여자대학교 공식 구내식당",
        "post_title": post["title"],
        "post_url": post["url"],
        "week_start": post["start"],
        "week_end": post["end"],
        "updated_at": datetime.now().isoformat(
            timespec="seconds"
        ),
        "menu": results
    }

    with open(
        JSON_PATH,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            data,
            file,
            ensure_ascii=False,
            indent=4
        )

    print("\n[JSON 저장 완료]")
    print(JSON_PATH)


# =====================================
# 8. 전체 파이프라인 실행
# =====================================

def main():

    print("================================")
    print(" MEAL FLOW MENU PIPELINE")
    print("================================")

    print("\n1. 홈페이지 메뉴 게시글 수집")

    posts = get_menu_posts()

    print("이번 주 메뉴 게시글:", len(posts), "개")

    print("\n2. 이번 주 메뉴 선택")

    post = select_this_week(posts)

    print("\n3. 메뉴판 이미지 다운로드")

    image_path = download_menu_image(post)

    print("\n4. 요일별 이미지 분리")

    crop_paths = crop_menu_images(image_path)

    print("\n5. 메뉴 OCR 인식")

    results = recognize_menu(crop_paths)

    print("\n6. JSON 저장")

    save_json(post, results)

    print("\n================================")
    print(" 전체 메뉴 파이프라인 완료!")
    print("================================")


if __name__ == "__main__":
    main()
