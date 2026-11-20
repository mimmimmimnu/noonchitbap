
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from datetime import date, datetime
from pathlib import Path
import re

BASE_URL = "https://www.sungshin.ac.kr"
MENU_URL = BASE_URL + "/main_kor/11076/subview.do"

HEADERS = {
    "User-Agent": "Mozilla/5.0"
}


def get_menu_posts():

    response = requests.get(
        MENU_URL, headers=HEADERS, timeout=20
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    posts = []

    for cell in soup.select("td._artclTdTitle"):

        link = cell.select_one("a.artclLinkView")

        if not link:
            continue

        title = link.get_text(" ", strip=True)

        # 주간메뉴 게시글만 수집
        if "주간메뉴" not in title:
            continue

        match = re.search(
            r"\((\d{1,2})[./-](\d{1,2})\s*~\s*(\d{1,2})[./-](\d{1,2})\)",
            title
        )

        if not match:
            continue

        sm, sd, em, ed = map(int, match.groups())

        year = date.today().year

        start = date(year, sm, sd)
        end_year = year + 1 if (em, ed) < (sm, sd) else year
        end = date(end_year, em, ed)

        # 연말연초 기간 보정
        if start > date.today() and sm >= 11 and date.today().month <= 2:
            start = date(year - 1, sm, sd)

        posts.append({
            "title": title,
            "url": urljoin(MENU_URL, link["href"]),
            "start": start,
            "end": end
        })

    return posts


def find_this_week_menu(posts):

    today = date.today()

    for post in posts:

        if post["start"] <= today <= post["end"]:
            print("이번 주 메뉴판 발견!")
            print("제목:", post["title"])
            print("기간:", post["start"], "~", post["end"])

            return post

    print("오늘 날짜에 해당하는 메뉴판이 없습니다.")

    for post in posts:
        print(
            post["title"],
            post["start"],
            "~",
            post["end"]
        )

    return None


def download_menu_image(post):

    response = requests.get(
        post["url"],
        headers=HEADERS,
        timeout=20
    )
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # 실제 메뉴판 이미지 경로만 선택
    image = soup.find(
        "img",
        src=re.compile(r"editorUpload/images", re.I)
    )

    if not image:
        raise Exception("게시글에서 메뉴판 이미지를 찾지 못했습니다.")

    image_url = urljoin(post["url"], image["src"])

    image_response = requests.get(
        image_url,
        headers=HEADERS,
        timeout=20
    )
    image_response.raise_for_status()

    save_dir = Path("menu_images")
    save_dir.mkdir(exist_ok=True)

    save_path = save_dir / "this_week_menu.png"
    save_path.write_bytes(image_response.content)

    print("메뉴판 다운로드 성공!")
    print("이미지 주소:", image_url)
    print("저장 위치:", save_path.resolve())

    return save_path


if __name__ == "__main__":

    print("오늘 날짜:", datetime.now().date())

    posts = get_menu_posts()

    print("주간 메뉴 게시글:", len(posts), "개")

    selected_post = find_this_week_menu(posts)

    if selected_post:
        download_menu_image(selected_post)
    else:
        print("다운로드를 중단합니다.")
