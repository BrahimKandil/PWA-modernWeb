import io, os, re, sys
from html.parser import HTMLParser
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

SRC = sys.argv[1]
OUT = sys.argv[2]
html = io.open(SRC, encoding="utf-8").read()

BLOCKS = ("h1", "h2", "h3", "h4", "p", "li", "td", "th", "div", "ul", "ol", "table", "tr")

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.items = []          # ("h1"|"h2"|"h3"|"p"|"li"|"num"|"note"|"cover"|"break"|"table", payload)
        self.buf = ""
        self.stack = []
        self.row = None
        self.table = None
        self.cover = False
        self.depth_ol = 0

    def flush(self, kind):
        t = re.sub(r"[ \t]+", " ", self.buf).strip()
        self.buf = ""
        if not t:
            return None
        if kind == "cover":
            for line in (x.strip() for x in t.split(chr(10))):
                if line:
                    self.items.append(("cover", line))
            return None
        self.items.append((kind, t))
        return None

    def handle_starttag(self, tag, attrs):
        cls = dict(attrs).get("class", "")
        if tag in ("h1", "h2", "h3", "h4"):
            self.stack.append(tag)
            self.buf = ""
        elif tag == "p":
            self.stack.append("note" if "note" in cls else "p")
            self.buf = ""
        elif tag == "li":
            self.stack.append("num" if self.depth_ol else "li")
            self.buf = ""
        elif tag == "ol":
            self.depth_ol += 1
        elif tag == "ul":
            self.stack.append("ul")
        elif tag == "table":
            self.table = []
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.stack.append("cell")
            self.buf = ""
        elif tag == "br":
            self.buf += "\n"
        elif tag == "div":
            if "saut" in cls:
                self.items.append(("break", None))
            elif "couverture" in cls:
                self.items.append(("break", None))
            else:
                self.stack.append("cover" if cls in ("titre", "sous", "meta") else "p")
                self.buf = ""

    def handle_endtag(self, tag):
        if tag in ("h1", "h2", "h3", "h4"):
            self.flush(self.stack.pop())
        elif tag == "p":
            self.flush(self.stack.pop())
        elif tag == "li":
            self.flush(self.stack.pop())
        elif tag == "ol":
            self.depth_ol -= 1
        elif tag == "ul":
            if self.stack and self.stack[-1] == "ul":
                self.stack.pop()
        elif tag in ("td", "th"):
            txt = re.sub(r"[ \t]+", " ", self.buf).strip()
            self.buf = ""
            self.stack.pop()
            if self.row is not None:
                self.row.append(txt)
        elif tag == "tr":
            if self.table is not None and self.row:
                self.table.append(self.row)
            self.row = []
        elif tag == "div":
            if self.stack and self.stack[-1] in ("p", "cover"):
                self.flush(self.stack.pop())
        elif tag == "table":
            if self.table:
                self.items.append(("table", self.table))
            self.table = None

    def handle_data(self, data):
        if self.stack and self.stack[-1] in ("h1", "h2", "h3", "h4", "p", "note", "li", "num", "cell", "cover"):
            self.buf += data

doc = Document()
st = doc.styles["Normal"]
st.font.name = "Calibri"
st.font.size = Pt(10.5)
st.paragraph_format.space_after = Pt(4)
for name, size, color in (("Heading 1", 16, "3730A3"), ("Heading 2", 12.5, "4338CA"), ("Heading 3", 11, "1E293B")):
    s = doc.styles[name]
    s.font.name = "Calibri"
    s.font.size = Pt(size)
    s.font.color.rgb = RGBColor.from_string(color)
    s.font.bold = True
sec = doc.sections[0]
sec.top_margin = sec.bottom_margin = Cm(1.6)
sec.left_margin = sec.right_margin = Cm(1.4)

parser = P()
parser.feed(html)

def shade(cell, hexcolor):
    tcPr = cell._tc.get_or_add_tcPr()
    el = OxmlElement("w:shd")
    el.set(qn("w:val"), "clear")
    el.set(qn("w:fill"), hexcolor)
    tcPr.append(el)

for kind, payload in parser.items:
    if kind == "num":
        global_num = globals().get("_n", 0) + 1 if globals().get("_prev") == "num" else 1
    globals()["_prev"] = kind
    if kind == "break":
        doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)
    elif kind == "cover":
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(payload)
        if payload.strip() == "ARP Éducation":
            r.font.size = Pt(30); r.font.bold = True
            r.font.color.rgb = RGBColor.from_string("4F46E5")
            p.paragraph_format.space_before = Pt(140)
        elif payload.startswith("Version"):
            r.font.size = Pt(11); r.font.color.rgb = RGBColor.from_string("64748B")
        else:
            r.font.size = Pt(14); r.font.color.rgb = RGBColor.from_string("334155")
    elif kind == "note":
        p = doc.add_paragraph()
        r = p.add_run("Note — " + payload)
        r.italic = True
        r.font.color.rgb = RGBColor.from_string("334155")
    elif kind in ("h1", "h2", "h3", "h4"):
        doc.add_heading(payload, level={"h1": 1, "h2": 2, "h3": 3, "h4": 3}[kind])
    elif kind == "p":
        doc.add_paragraph(payload)
    elif kind == "li":
        doc.add_paragraph(payload, style="List Bullet")
    elif kind == "num":
        globals()["_n"] = global_num
        doc.add_paragraph("%d. %s" % (global_num, payload))
    elif kind == "table":
        rows = payload
        w = max(len(r) for r in rows)
        t = doc.add_table(rows=0, cols=w)
        t.style = "Table Grid"
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        t.autofit = True
        lay = OxmlElement("w:tblLayout")
        lay.set(qn("w:type"), "autofit")
        t._tbl.tblPr.append(lay)
        for i, row in enumerate(rows):
            cells = t.add_row().cells
            for j in range(w):
                txt = row[j] if j < len(row) else ""
                cells[j].text = ""
                para = cells[j].paragraphs[0]
                run = para.add_run(txt)
                run.font.size = Pt(8.5 if i else 9)
                if i == 0:
                    run.bold = True
                    shade(cells[j], "EEF2FF")
        doc.add_paragraph()

doc.save(OUT)
print("docx:", OUT, os.path.getsize(OUT), "octets,", len(parser.items), "blocs")
