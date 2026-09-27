"""Dump Daegann's Holostreets Shadow Amps Expanded List (DHSA) PDF into rows.

Each table row: {page, section, subsection, name, type, cost, effects[], added}
where added=True for entries printed in rust (DHSA additions; black = core book).
Usage: python tools/dhsa_rows.py <pdf> > rows.json
"""
import json
import sys

import fitz

RUST = 0x833C0B
COL_TYPE, COL_COST, COL_EFFECTS = 170, 225, 290  # x thresholds (points)


def rows(pdf):
    doc = fitz.open(pdf)
    out, section, sub, cur = [], "", "", None
    for pno, page in enumerate(doc, 1):
        lines = []
        for b in page.get_text("dict")["blocks"]:
            for l in b.get("lines", []):
                text = "".join(s["text"] for s in l["spans"]).replace("�", "'").strip()
                if not text:
                    continue
                s = l["spans"][0]
                lines.append((round(l["bbox"][1]), round(l["bbox"][0]), text, s["font"], s["color"]))
        lines.sort()
        for y, x, text, font, color in lines:
            if y < 40 or y > 740:  # running header / page number
                continue
            if font.startswith("Goldman-Bold"):
                section, sub = text.strip(), ""
                continue
            if font.startswith("Goldman"):
                if x < COL_TYPE:
                    sub = text.strip()
                continue  # column headers
            if x < COL_TYPE:
                if "Bold" in font:
                    cur = {"page": pno, "section": section, "subsection": sub, "name": text,
                           "type": "", "cost": "", "effects": [], "added": color == RUST}
                    out.append(cur)
                elif cur:
                    cur["name"] += " " + text  # wrapped name
            elif cur is None:
                continue
            elif x < COL_COST:
                cur["type"] = (cur["type"] + " " + text).strip()
            elif x < COL_EFFECTS:
                cur["cost"] = (cur["cost"] + " " + text).strip()
            else:
                # wrapped effect lines start lowercase or continue a sentence
                if cur["effects"] and (text[:1].islower() or cur["effects"][-1].endswith((",", "(", "and", "or", "the", "a", "of"))):
                    cur["effects"][-1] += " " + text
                else:
                    cur["effects"].append(text)
    return out


if __name__ == "__main__":
    json.dump(rows(sys.argv[1]), sys.stdout, indent=1, ensure_ascii=False)
