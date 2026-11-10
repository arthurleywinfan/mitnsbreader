"""Turn the downloaded round PDFs into app/data/questions.json.

Usage: python -I tools/build_data.py
Needs pdftotext on PATH. Reads raw/*.pdf and raw/manifest.json.
"""
import json, re, subprocess, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "raw"
APP = ROOT / "docs"

CATS = ["EARTH AND SPACE", "CHEMISTRY", "BIOLOGY", "PHYSICS", "MATH", "MATHEMATICS",
        "ENERGY", "GENERAL SCIENCE", "COMPUTER SCIENCE", "EARTH SCIENCE", "ASTRONOMY"]
CAT_NAMES = {"MATHEMATICS": "Math", "MATH": "Math", "EARTH AND SPACE": "Earth & Space"}

START = re.compile(
    r"(?:(TOSS[\s-]?UP|BONUS)\s*)?(?<![\d.])(\d+)\s*\)\s*(" + "|".join(CATS) + r")\s*[–—-]?\s*"
    r"√?\s*(Multiple\s+Choice|Short\s+Answer)\s*[:\-–]?\s*",
    re.I,
)
FOOTER = re.compile(r"^\s*(MIT Science Bowl Invitational.*|Page \d+|\d{4} MIT Science Bowl High School Invitational.*)\s*$", re.I)


def pages_of(pdf):
    txt = subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), "-"],
                         capture_output=True, text=True, encoding="utf-8").stdout
    txt = txt.replace("ﬁ", "fi").replace("ﬂ", "fl").replace("ﬀ", "ff")
    # square-root signs sometimes land inside a category word ("MA√TH")
    txt = re.sub(r"(?<=[A-Z])√(?=[A-Z])", "", txt)
    out = []
    for p in txt.split("\f"):
        lines = [l for l in p.splitlines() if not FOOTER.match(l)]
        out.append(" ".join(l.strip() for l in lines if l.strip()))
    return out


def clean(s):
    s = re.sub(r"\s+", " ", s).strip()
    # rejoin words hyphenated across a line break ("con- stant")
    return re.sub(r"(?<=[a-z])- (?=[a-z])", "", s)


def split_choices(body):
    """Put W) X) Y) Z) choices on their own lines."""
    return re.sub(r"\s+(?=[WXYZ]\)\s)", "\n", body).strip()


def parse(entry):
    pages = pages_of(RAW / f"{entry['key']}.pdf")
    # one long string, remembering which page each char came from
    text, page_at = "", []
    for i, p in enumerate(pages):
        text += p + " "
        page_at.append(len(text))
    def page_for(pos):
        for i, end in enumerate(page_at):
            if pos < end:
                return i + 1
        return len(pages)

    hits = list(START.finditer(text))
    qs, seen = [], set()
    for i, m in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(text)
        chunk = text[m.end():end]
        if "ANSWER:" in chunk:
            q, a = chunk.split("ANSWER:", 1)
        else:
            q, a = chunk, ""
        cat = m.group(3).upper()
        num = int(m.group(2))
        # the BONUS/TOSS-UP label is sometimes split off; first copy of a number is the toss-up
        part = "Bonus" if num in seen else "Toss-up"
        seen.add(num)
        q = re.sub(r"\b(TOSS[\s-]?UP|BONUS)\b", " ", q)
        qs.append({
            "part": part,
            "num": num,
            "cat": CAT_NAMES.get(cat, cat.title()),
            "fmt": "MC" if m.group(4).lower().startswith("multiple") else "SA",
            "q": split_choices(clean(q)),
            "a": clean(a),
            "page": page_for(m.start()),
        })
    return qs


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    man = json.loads((RAW / "manifest.json").read_text())
    (APP / "pdf").mkdir(parents=True, exist_ok=True)
    (APP / "data").mkdir(parents=True, exist_ok=True)
    visuals = {e["key"].replace("-visual", ""): e["key"] for e in man if e["kind"] == "visual"}
    rounds, questions = [], []
    for e in sorted(man, key=lambda e: (-e["year"], e["kind"], e["round"])):
        shutil.copyfile(RAW / f"{e['key']}.pdf", APP / "pdf" / f"{e['key']}.pdf")
        if e["kind"] == "visual":
            continue
        qs = parse(e)
        ri = len(rounds)
        rounds.append({"key": e["key"], "year": e["year"], "label": e["label"],
                       "kind": e["kind"], "visual": visuals.get(e["key"]), "n": len(qs)})
        for q in qs:
            q["r"] = ri
            questions.append(q)
        flag = "" if len(qs) >= 8 else "   <-- check"
        print(f"{e['key']:14} {len(qs):3} questions{flag}")
    (APP / "data" / "questions.json").write_text(
        json.dumps({"rounds": rounds, "questions": questions}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")
    print(f"\n{len(rounds)} rounds, {len(questions)} questions")


if __name__ == "__main__":
    main()
