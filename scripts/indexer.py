# scripts/indexer.py
# files/ 안의 PDF, PPTX, XLSX, TXT를 읽어 site/index.json 생성
# PDF는 "페이지 단위"로 레코드를 만들어 p.번호와 함께 링크합니다.

import json, shutil
from pathlib import Path

# 의존성:
#   pip install pymupdf python-pptx openpyxl

FILES_DIR = Path("files")
SITE_DIR = Path("site")
SITE_FILES = SITE_DIR / "files"
INDEX_JSON = SITE_DIR / "index.json"


# ---------- helpers ----------
def ensure_dirs():
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    SITE_FILES.mkdir(parents=True, exist_ok=True)
    FILES_DIR.mkdir(parents=True, exist_ok=True)


def read_txt(path: Path) -> str:
    for enc in ("utf-8", "cp949", "euc-kr"):
        try:
            return path.read_text(encoding=enc)
        except Exception:
            continue
    return path.read_text(errors="ignore")


def extract_pdf_pages(path: Path):
    import fitz  # PyMuPDF
    with fitz.open(path) as doc:
        for i, page in enumerate(doc, start=1):
            yield i, page.get_text() or ""


def extract_pptx(path: Path) -> str:
    from pptx import Presentation
    prs = Presentation(path)
    out = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text:
                out.append(shape.text)
    return "\n".join(out)


def extract_xlsx(path: Path) -> str:
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    out = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            for v in row:
                if v is not None:
                    out.append(str(v))
    return "\n".join(out)


def snippet_of(text: str, n: int = 300) -> str:
    return " ".join((text or "").split())[:n]


# ---------- main ----------
def main():
    ensure_dirs()
    records = []
    rid = 1

    for p in sorted(FILES_DIR.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()

        # 공개용 파일은 site/files/에 복사(없으면 복사, 있으면 덮어쓰기)
        try:
            shutil.copy2(p, SITE_FILES / p.name)
        except Exception as e:
            print(f"[WARN] 복사 실패: {p.name} -> {e}")

        try:
            if ext == ".pdf":
                # 페이지 단위 레코드
                for page_no, text in extract_pdf_pages(p):
                    records.append({
                        "id": rid,
                        "title": f"{p.name} (p.{page_no})",
                        "file": p.name,
                        "fileType": "pdf",
                        "page": page_no,
                        "link": f"./files/{p.name}#page={page_no}",
                        "snippet": snippet_of(text),
                        "content": text,
                    })
                    rid += 1
                continue  # 다음 파일

            elif ext == ".pptx":
                text = extract_pptx(p)
                records.append({
                    "id": rid,
                    "title": p.name,
                    "file": p.name,
                    "fileType": "pptx",
                    "link": f"./files/{p.name}",
                    "snippet": snippet_of(text),
                    "content": text,
                })
                rid += 1

            elif ext in (".xlsx", ".xlsm", ".xls"):
                text = extract_xlsx(p)
                records.append({
                    "id": rid,
                    "title": p.name,
                    "file": p.name,
                    "fileType": "xlsx",
                    "link": f"./files/{p.name}",
                    "snippet": snippet_of(text),
                    "content": text,
                })
                rid += 1

            elif ext in (".txt", ".md", ".csv"):
                text = read_txt(p)
                records.append({
                    "id": rid,
                    "title": p.name,
                    "file": p.name,
                    "fileType": "txt",
                    "link": f"./files/{p.name}",
                    "snippet": snippet_of(text),
                    "content": text,
                })
                rid += 1

            else:
                # 미지원 확장자 건너뜀 (원하면 hwpx 등 추가 가능)
                pass

        except Exception as e:
            print(f"[WARN] 추출 실패: {p.name} -> {e}")
            continue

    # 인덱스 저장
    INDEX_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"인덱스 레코드 수: {len(records)}")


if __name__ == "__main__":
    main()
