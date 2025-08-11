import os, json, shutil
from pathlib import Path

# 의존성:
#   pip install pymupdf python-pptx openpyxl

# 폴더
FILES_DIR = Path("files")
SITE_DIR = Path("site")
SITE_FILES = SITE_DIR / "files"
SITE_INDEX = SITE_DIR / "index.json"

def ensure_dirs():
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    SITE_FILES.mkdir(parents=True, exist_ok=True)

def read_txt_bytesafe(path: Path) -> str:
    for enc in ("utf-8", "cp949", "euc-kr"):
        try:
            return path.read_text(encoding=enc)
        except Exception:
            continue
    return path.read_text(errors="ignore")

def extract_pdf(path: Path) -> str:
    import fitz  # PyMuPDF
    text = []
    with fitz.open(path) as doc:
        for page in doc:
            text.append(page.get_text())
    return "\n".join(text)

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

def make_entry(idx, path: Path, text: str, ftype: str):
    snippet = " ".join(text.split())[:300]
    return {
        "id": idx,
        "title": path.name,
        "file": path.name,
        "fileType": ftype,
        "link": f"./files/{path.name}",   # 페이지에서 직접 열 수 있도록 site/files 로 복사됨
        "snippet": snippet,
        "content": text
    }

def main():
    ensure_dirs()
    records = []
    i = 1

    # site에 열람용 파일 복사 초기화(이전 것 유지)
    # 필요 시 아래 주석 해제하여 매 배포마다 싹 갈아끼울 수도 있음
    # for old in SITE_FILES.glob("*"): old.unlink()

    for p in FILES_DIR.iterdir():
        if not p.is_file(): 
            continue
        ext = p.suffix.lower()
        text, ftype = "", ""
        try:
            if ext == ".pdf":
                text = extract_pdf(p); ftype = "pdf"
            elif ext in (".pptx",):
                text = extract_pptx(p); ftype = "pptx"
            elif ext in (".xlsx", ".xlsm", ".xls"):
                text = extract_xlsx(p); ftype = "xlsx"
            elif ext in (".txt", ".md", ".csv"):
                text = read_txt_bytesafe(p); ftype = "txt"
            else:
                # 지원 외 형식은 패스 (원하면 여기에 hwpx 등 확장 가능)
                continue
        except Exception as e:
            print(f"[WARN] 추출 실패: {p.name} -> {e}")
            continue

        # site/files 로 원본 복사(페이지에서 열 수 있게)
        shutil.copy2(p, SITE_FILES / p.name)
        records.append(make_entry(i, p, text, ftype))
        i += 1

    SITE_INDEX.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"인덱스 레코드 수: {len(records)}")

if __name__ == "__main__":
    main()
