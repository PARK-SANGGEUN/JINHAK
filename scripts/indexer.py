import os, json, shutil
from pathlib import Path

# 의존성: pip install pymupdf python-pptx openpyxl
# files/ 안의 PDF, PPTX, XLSX, TXT를 읽어 site/index.json 생성 + 보기용 파일을 site/files/로 복사

FILES_DIR = Path("files")
SITE_DIR = Path("site")
SITE_FILES = SITE_DIR / "files"
INDEX_JSON = SITE_DIR / "index.json"

def ensure_dirs():
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    SITE_FILES.mkdir(parents=True, exist_ok=True)

def read_txt(path: Path) -> str:
    for enc in ("utf-8", "cp949", "euc-kr"):
        try:
            return path.read_text(encoding=enc)
        except Exception:
            pass
    return path.read_text(errors="ignore")

def extract_pdf(path: Path) -> str:
    import fitz  # PyMuPDF
    out = []
    with fitz.open(path) as doc:
        for page in doc:
            out.append(page.get_text())
    return "\n".join(out)

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

def make_record(i: int, p: Path, text: str, ftype: str):
    snippet = " ".join(text.split())[:300]
    return {
        "id": i,
        "title": p.name,
        "file": p.name,
        "fileType": ftype,
        "link": f"./files/{p.name}",   # site/files/ 로 복사됨
        "snippet": snippet,
        "content": text
    }

def main():
    ensure_dirs()
    records = []
    i = 1

    if not FILES_DIR.exists():
        FILES_DIR.mkdir(parents=True, exist_ok=True)

    # files/ 바로 아래만 스캔 (원하면 .rglob("*")로 바꿔 하위폴더 포함 가능)
    for p in sorted(FILES_DIR.iterdir()):
        if not p.is_file():
            continue
        ext = p.suffix.lower()
        text, ftype = "", ""
        try:
            if ext == ".pdf":
                text = extract_pdf(p); ftype = "pdf"
            elif ext == ".pptx":
                text = extract_pptx(p); ftype = "pptx"
            elif ext in (".xlsx", ".xlsm", ".xls"):
                text = extract_xlsx(p); ftype = "xlsx"
            elif ext in (".txt", ".md", ".csv"):
                text = read_txt(p); ftype = "txt"
            else:
                # 미지원 확장자는 건너뜀
                continue
        except Exception as e:
            print(f"[WARN] 추출 실패: {p.name} -> {e}")
            continue

        # 공개용 사본을 site/files 에 복사 (브라우저에서 바로 열기)
        shutil.copy2(p, SITE_FILES / p.name)
        records.append(make_record(i, p, text, ftype))
        i += 1

    INDEX_JSON.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"인덱스 레코드 수: {len(records)}")

if __name__ == "__main__":
    main()
