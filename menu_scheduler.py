
import subprocess
import sys
import requests

from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent

PIPELINE_PATH = BASE_DIR / "menu_pipeline.py"

API_URL = "http://127.0.0.1:8000/menu/sync"


def run_scheduler():

    print("=" * 45)
    print("눈치밥 자동 메뉴 업데이트 시작")
    print("실행 시각:", datetime.now())
    print("=" * 45)

    # 1. 크롤링 및 OCR 파이프라인 실행
    if not PIPELINE_PATH.exists():
        print("[ERROR] menu_pipeline.py 파일을 찾을 수 없습니다.")
        return False

    print("\n[1] 학교 홈페이지 메뉴 수집 및 OCR 실행")

    result = subprocess.run(
        [sys.executable, str(PIPELINE_PATH)],
        cwd=BASE_DIR
    )

    if result.returncode != 0:
        print("[ERROR] 메뉴 수집 또는 OCR 실행 실패")
        return False

    print("\n[2] 메뉴 데이터 API 동기화")

    # 2. FastAPI 서버에 최신 메뉴 전달
    try:

        response = requests.post(
            API_URL,
            timeout=30
        )

        response.raise_for_status()

        print("[SUCCESS] 메뉴 데이터 동기화 완료")
        print(response.json())

    except requests.RequestException as e:

        print("[WARNING] API 서버에 연결하지 못했습니다.")
        print("오류:", e)
        print("OCR JSON은 생성되었으며, 서버가 실행된 뒤")
        print("/menu 또는 /predict 요청 시 동기화할 수 있습니다.")

    print("\n눈치밥 자동 업데이트 작업 종료")

    return True


if __name__ == "__main__":
    run_scheduler()
