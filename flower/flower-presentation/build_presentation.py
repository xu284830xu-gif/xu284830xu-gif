from pathlib import Path
from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR, MSO_AUTO_SIZE
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.oxml.ns import qn

ROOT = Path(r"C:\Users\ASUS\Documents\deepseek-harness\default-workspace\qq-bridge-setup\qq-bridge\state\agents\flower-presentation")
ASSETS = ROOT / "assets"
OUT = ROOT / "花间集-创新创业路演-跟党走就队.pptx"

# ---------- design tokens ----------
CREAM = RGBColor(0xF4, 0xF1, 0xE9)
PAPER = RGBColor(0xFF, 0xFD, 0xF8)
DARK = RGBColor(0x12, 0x3C, 0x32)
DARK_2 = RGBColor(0x1B, 0x4B, 0x3E)
GREEN = RGBColor(0x1F, 0x58, 0x48)
GREEN_MID = RGBColor(0x3C, 0x74, 0x62)
SAGE = RGBColor(0xA8, 0xC3, 0xB1)
SAGE_SOFT = RGBColor(0xE6, 0xEE, 0xE8)
SAGE_PALE = RGBColor(0xF0, 0xF5, 0xF1)
GOLD = RGBColor(0xC1, 0x9A, 0x56)
GOLD_SOFT = RGBColor(0xF5, 0xEC, 0xD8)
PEACH = RGBColor(0xD9, 0x95, 0x79)
PEACH_SOFT = RGBColor(0xFB, 0xED, 0xE7)
RED = RGBColor(0xAF, 0x55, 0x48)
INK = RGBColor(0x1C, 0x2B, 0x25)
INK_SOFT = RGBColor(0x42, 0x52, 0x4B)
MUTED = RGBColor(0x77, 0x83, 0x7C)
MUTED_LIGHT = RGBColor(0x9C, 0xA5, 0x9F)
LINE = RGBColor(0xE3, 0xDE, 0xD1)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
CREAM_SOFT = RGBColor(0xEC, 0xE8, 0xDC)
GOLD_DARK = RGBColor(0x93, 0x70, 0x35)

BODY = "Microsoft YaHei"
DISPLAY = "SimSun"
LATIN = "Georgia"

SW, SH = 13.333, 7.5
TEAM = "跟党走就队"

prs = Presentation()
prs.slide_width = Inches(SW)
prs.slide_height = Inches(SH)


def rgb_hex(color):
    return str(color)


def set_font(run, name):
    run.font.name = name
    rPr = run._r.get_or_add_rPr()
    for tag in ("a:ea", "a:cs"):
        el = rPr.find(qn(tag))
        if el is None:
            el = etree.SubElement(rPr, qn(tag))
        el.set("typeface", name)


def add_text(slide, text, x, y, w, h, size=12, color=INK, bold=False,
             font=BODY, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
             line_spacing=1.12, letter_spacing=0, italic=False, margin=0):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Inches(margin)
    tf.vertical_anchor = anchor
    lines = str(text).split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        p.space_before = Pt(0)
        p.space_after = Pt(0)
        run = p.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.italic = italic
        run.font.color.rgb = color
        set_font(run, font)
        if letter_spacing:
            run._r.get_or_add_rPr().set("spc", str(int(letter_spacing * 100)))
    return box


def add_rich_text(slide, runs, x, y, w, h, size=12, color=INK, font=BODY,
                  align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, line_spacing=1.12):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.clear()
    tf.word_wrap = True
    tf.auto_size = MSO_AUTO_SIZE.NONE
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = line_spacing
    p.space_before = Pt(0)
    p.space_after = Pt(0)
    for item in runs:
        run = p.add_run()
        run.text = item["text"]
        run.font.size = Pt(item.get("size", size))
        run.font.bold = item.get("bold", False)
        run.font.italic = item.get("italic", False)
        run.font.color.rgb = item.get("color", color)
        set_font(run, item.get("font", font))
    return box


def set_bg(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def set_shape_alpha(shape, alpha):
    spPr = shape._element.spPr
    solid = spPr.find(qn("a:solidFill"))
    if solid is None:
        return
    srgb = solid.find(qn("a:srgbClr"))
    if srgb is None:
        return
    a = srgb.find(qn("a:alpha"))
    if a is None:
        a = etree.SubElement(srgb, qn("a:alpha"))
    a.set("val", str(int(alpha * 100000)))


def add_shape(slide, kind, x, y, w, h, fill=None, line=None, line_width=0.8,
              radius=None, alpha=None, rotation=0):
    shape = slide.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.shadow.inherit = False
    if kind == MSO_SHAPE.ROUNDED_RECTANGLE and radius is not None:
        shape.adjustments[0] = min(0.5, radius / max(0.01, min(w, h)))
    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
        if alpha is not None:
            set_shape_alpha(shape, alpha)
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(line_width)
    if rotation:
        shape.rotation = rotation
    return shape


def add_line(slide, x1, y1, x2, y2, color=LINE, width=1.0, dash=None):
    line = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    line.line.color.rgb = color
    line.line.width = Pt(width)
    if dash:
        line.line.dash_style = dash
    return line


def add_circle(slide, x, y, d, fill, line=None, line_width=0.8):
    return add_shape(slide, MSO_SHAPE.OVAL, x, y, d, d, fill=fill, line=line, line_width=line_width)


def add_number(slide, x, y, d, n, fill=GREEN, color=CREAM, size=10):
    add_circle(slide, x, y, d, fill)
    add_text(slide, str(n).zfill(2), x, y + d * 0.02, d, d * 0.95, size=size, color=color,
             bold=True, font=LATIN, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def add_pill(slide, text, x, y, w, h, fill, color=INK, line=None, size=8.5, bold=True):
    add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fill=fill, line=line, radius=h / 2)
    add_text(slide, text, x, y + 0.01, w, h - 0.02, size=size, color=color, bold=bold,
             font=BODY, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def add_picture_fit(slide, path, x, y, max_w, max_h):
    img = Image.open(path)
    ratio = img.width / img.height
    if max_w / max_h > ratio:
        h = max_h
        w = h * ratio
    else:
        w = max_w
        h = w / ratio
    left = x + (max_w - w) / 2
    top = y + (max_h - h) / 2
    return slide.shapes.add_picture(str(path), Inches(left), Inches(top), Inches(w), Inches(h)), (left, top, w, h)


def add_flower_motif(slide, cx, cy, size, color=GOLD, alpha=0.15, line_alpha=0.4, fill=False):
    # eight petals, same center, rotated evenly
    pw = size * 0.22
    ph = size * 0.62
    for angle in range(0, 360, 45):
        petal = add_shape(
            slide, MSO_SHAPE.OVAL, cx - pw / 2, cy - ph / 2, pw, ph,
            fill=color if fill else None,
            line=color, line_width=0.9, alpha=alpha if fill else None,
            rotation=angle
        )
        if fill:
            # line alpha not exposed through helper; keep line light via color choice
            pass
    ring = add_shape(slide, MSO_SHAPE.OVAL, cx - size * 0.28, cy - size * 0.28, size * 0.56, size * 0.56,
                     fill=None, line=color, line_width=0.65)
    ring2 = add_shape(slide, MSO_SHAPE.OVAL, cx - size * 0.47, cy - size * 0.47, size * 0.94, size * 0.94,
                      fill=None, line=color, line_width=0.45)
    add_circle(slide, cx - 0.055, cy - 0.055, 0.11, color if not fill else GOLD_SOFT)
    return petal, ring, ring2


def add_header(slide, section, title, subtitle=None, dark=False):
    ink = CREAM if dark else INK
    muted = RGBColor(0xB8, 0xC8, 0xBC) if dark else MUTED
    line = RGBColor(0x39, 0x64, 0x53) if dark else LINE
    add_line(slide, 0.68, 0.42, 1.02, 0.42, GOLD if not dark else GOLD, 1.4)
    add_text(slide, section.upper(), 1.12, 0.33, 6.4, 0.22, size=8.5, color=GOLD if dark else GREEN_MID,
             bold=True, font=LATIN, letter_spacing=1.0)
    add_text(slide, f"{TEAM} / TEAM", 10.55, 0.33, 2.15, 0.22, size=7.5, color=muted,
             font=LATIN, align=PP_ALIGN.RIGHT, letter_spacing=0.9)
    add_text(slide, title, 0.68, 0.63, 11.95, 0.72, size=27, color=ink, bold=True,
             font=DISPLAY, line_spacing=1.03)
    if subtitle:
        add_text(slide, subtitle, 0.69, 1.30, 11.85, 0.25, size=9.5, color=muted, font=BODY)
    return ink, muted, line


def add_footer(slide, dark=False, note="花间集 · 花卉经营数字化工作台"):
    line = RGBColor(0x35, 0x61, 0x50) if dark else LINE
    muted = RGBColor(0x9F, 0xB8, 0xA9) if dark else MUTED_LIGHT
    add_line(slide, 0.68, 7.03, 12.65, 7.03, line, 0.7)
    add_text(slide, note, 0.68, 7.12, 8.5, 0.18, size=7.2, color=muted, font=BODY)
    add_text(slide, f"{len(prs.slides):02d}", 12.24, 7.08, 0.42, 0.22, size=8, color=muted,
             font=LATIN, align=PP_ALIGN.RIGHT)


def content_slide(section, title, subtitle=None, dark=False, note=None):
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    set_bg(slide, DARK if dark else CREAM)
    add_header(slide, section, title, subtitle, dark=dark)
    default_note = "花间集 · 创新创业项目路演" if dark else "花间集 · 花卉经营数字化工作台"
    add_footer(slide, dark=dark, note=note or default_note)
    return slide


def set_notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def add_card(slide, x, y, w, h, fill=PAPER, line=LINE, radius=0.16):
    return add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h, fill=fill, line=line, line_width=0.7, radius=radius)


def add_callout(slide, x, y, n, title, desc):
    add_number(slide, x, y + 0.02, 0.34, n, fill=GREEN, color=CREAM, size=9)
    add_text(slide, title, x + 0.48, y, 3.27, 0.25, size=11.5, color=INK, bold=True, font=BODY)
    add_text(slide, desc, x + 0.48, y + 0.25, 3.28, 0.5, size=9.1, color=MUTED, font=BODY, line_spacing=1.35)


# =========================================================
# 01 Cover
# =========================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, DARK)

# faint arcs and flower motif
add_shape(slide, MSO_SHAPE.OVAL, 9.2, -1.6, 6.4, 6.4, fill=None, line=RGBColor(0x4A, 0x79, 0x63), line_width=0.7)
add_shape(slide, MSO_SHAPE.OVAL, 9.82, -1.0, 5.2, 5.2, fill=None, line=RGBColor(0x35, 0x62, 0x51), line_width=0.5)
add_flower_motif(slide, 10.58, 3.33, 3.0, color=RGBColor(0x8E, 0x76, 0x43), alpha=0.08, fill=True)
add_flower_motif(slide, 10.58, 3.33, 3.0, color=GOLD, alpha=0.12, fill=False)

add_line(slide, 0.78, 1.07, 1.3, 1.07, GOLD, 1.8)
add_text(slide, "创新创业课程项目  /  2026", 0.78, 1.28, 5.6, 0.24, size=9.5, color=RGBColor(0xC9, 0xB7, 0x91), bold=True, font=LATIN, letter_spacing=1.2)
add_pill(slide, f"TEAM  /  {TEAM}", 0.78, 1.76, 2.5, 0.36, RGBColor(0x1B, 0x4D, 0x40), RGBColor(0xE7, 0xD2, 0xA7), RGBColor(0x38, 0x65, 0x52), size=8.7)

add_text(slide, "花间集", 0.75, 2.35, 7.0, 1.15, size=58, color=RGBColor(0xF8, 0xF3, 0xE5), bold=True, font=DISPLAY, letter_spacing=2)
add_text(slide, "花卉经营数字化工作台", 0.78, 3.52, 6.7, 0.55, size=25, color=RGBColor(0xE7, 0xD8, 0xB6), bold=False, font=DISPLAY, letter_spacing=1)
add_text(slide, "让每一枝花都有数，让每一笔生意都算得清。", 0.80, 4.28, 6.4, 0.35, size=13, color=RGBColor(0xC3, 0xD3, 0xC8), font=BODY)

add_line(slide, 0.80, 5.12, 5.8, 5.12, RGBColor(0x48, 0x75, 0x61), 0.8)
add_text(slide, "产品设计  /  商业验证  /  落地计划", 0.80, 5.36, 5.5, 0.24, size=9.5, color=RGBColor(0xBA, 0xCB, 0xBF), font=BODY, letter_spacing=0.4)
add_text(slide, "网页作品 · 单文件可离线运行 · 数据本地保存", 0.80, 5.70, 6.0, 0.24, size=9, color=RGBColor(0x8F, 0xA9, 0x9A), font=BODY)
add_text(slide, "跟党走就队  /  FLOWER ATELIER", 0.80, 6.45, 5.6, 0.24, size=8.5, color=RGBColor(0xB5, 0xA5, 0x7F), font=LATIN, letter_spacing=0.8)
add_text(slide, "WEB APP  /  LOCAL FIRST  /  FLOWER RETAIL", 8.85, 6.45, 3.8, 0.2, size=7.2, color=RGBColor(0x80, 0x9A, 0x8D), font=LATIN, align=PP_ALIGN.RIGHT, letter_spacing=0.8)

set_notes(slide, "各位老师、同学好，我们是跟党走就队。我们的项目叫花间集，是一个专门服务小微花店的花卉经营数字化工作台。我们希望用一套打开浏览器就能用的轻量工具，把花店从进货、库存、定价、开单到利润复盘串成一条连续的数据链。")

# =========================================================
# 02 Pain points
# =========================================================
slide = content_slide("01 / 项目洞察", "一束花背后的经营难题", "花店的日常经营，往往被四个看不见的断点拖住。")
# soft decorative circle
add_shape(slide, MSO_SHAPE.OVAL, 11.5, 1.2, 2.9, 2.9, fill=SAGE_PALE, line=None, alpha=0.55)

add_line(slide, 0.70, 1.78, 0.70, 5.12, GOLD, 1.4)
add_text(slide, "OUR OBSERVATION", 0.95, 1.68, 3.6, 0.22, size=8, color=GOLD_DARK, bold=True, font=LATIN, letter_spacing=1.0)
add_text(slide, "花店不缺\n会包花的人，\n缺的是一套\n看得懂、用得起的\n经营工具。", 0.95, 1.98, 4.15, 2.9, size=24, color=INK, bold=True, font=DISPLAY, line_spacing=1.28)
add_text(slide, "—— 项目组场景观察", 0.98, 4.72, 3.0, 0.22, size=8.5, color=MUTED, font=BODY)

pain = [
    ("01", "库存靠记忆", "还剩多少、放在哪里，常常要翻聊天记录和便签。", GOLD_SOFT, GOLD_DARK),
    ("02", "损耗看不见", "枯萎、折损没有归因，成本在不知不觉中流失。", PEACH_SOFT, RED),
    ("03", "定价凭感觉", "节庆涨价、平日促销，缺少可参考的历史价格。", SAGE_SOFT, GREEN_MID),
    ("04", "利润算不清", "有营业额却没有净利润，不知道哪种花真正赚钱。", GOLD_SOFT, GOLD_DARK),
]
for i, (num, title, desc, tint, accent) in enumerate(pain):
    col = i % 2
    row = i // 2
    x = 5.35 + col * 3.73
    y = 1.62 + row * 1.93
    add_card(slide, x, y, 3.53, 1.72, fill=PAPER, line=LINE, radius=0.14)
    add_text(slide, num, x + 0.18, y + 0.14, 0.55, 0.3, size=19, color=accent, bold=True, font=LATIN)
    add_text(slide, title, x + 0.80, y + 0.18, 2.45, 0.26, size=13.5, color=INK, bold=True, font=BODY)
    add_text(slide, desc, x + 0.80, y + 0.52, 2.48, 0.88, size=9.2, color=MUTED, line_spacing=1.45)

add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.68, 5.55, 11.95, 0.92, fill=DARK, line=None, radius=0.16)
add_text(slide, "不是没有数据，", 0.95, 5.76, 2.05, 0.28, size=11, color=RGBColor(0xCF, 0xDF, 0xD3), bold=True, font=BODY)
add_text(slide, "而是数据散落在纸笔、表格和聊天记录里。", 2.82, 5.72, 6.4, 0.3, size=15, color=CREAM, bold=True, font=DISPLAY)
add_pill(slide, "机会：让经营数据连成闭环", 9.98, 5.78, 2.38, 0.34, RGBColor(0x2A, 0x5E, 0x4D), RGBColor(0xE7, 0xD1, 0xA1), None, size=8.2)
set_notes(slide, "先讲我们看到的痛点。花店不缺手艺，缺的是把经营过程记录下来的工具。库存靠记忆，损耗没有归因，定价靠经验，最后只看到一个营业额，却不知道真正赚了多少。这四个问题不是四个独立功能能解决的，它们需要被同一套数据串联起来。")

# =========================================================
# 03 Journey
# =========================================================
slide = content_slide("01 / 项目洞察", "花店的一天，有四个数据断点", "从清晨进货到打烊复盘，每一环都在产生数据，也都可能丢失数据。")
stage_data = [
    ("07:00", "清晨 · 进货", "进货", "批次成本 / 库存数量", "数量靠手记，成本随行情波动，批次成本容易混在一起。", SAGE_SOFT, GREEN_MID),
    ("10:00", "白天 · 养护", "养护", "库龄 / 损耗", "哪些花放久了没人知道，损耗无法归因到品类与批次。", GOLD_SOFT, GOLD_DARK),
    ("15:00", "顾客到店", "成交", "改价 / 扣库存", "折扣与搭售凭经验，卖完才想起库存没有同步。", PEACH_SOFT, RED),
    ("21:00", "打烊之后", "复盘", "营收 / 净利", "只看到卖了多少，算不清减去成本与损耗后还剩多少。", SAGE_SOFT, GREEN_MID),
]
line_y = 2.16
add_line(slide, 0.92, line_y, 12.05, line_y, RGBColor(0xCF, 0xD8, 0xCC), 1.2)
for i, (time_label, stage, short, tags, pain_text, tint, accent) in enumerate(stage_data):
    x = 0.68 + i * 3.13
    add_circle(slide, x + 0.30, line_y - 0.115, 0.23, CREAM, line=GOLD, line_width=1.0)
    add_circle(slide, x + 0.345, line_y - 0.07, 0.14, GOLD)
    add_text(slide, time_label, x, 1.66, 0.9, 0.22, size=8.4, color=accent, bold=True, font=LATIN, letter_spacing=0.5)
    add_text(slide, stage, x, 1.92, 2.55, 0.25, size=10.5, color=INK_SOFT, bold=True, font=BODY)
    add_card(slide, x, 2.54, 2.82, 2.35, fill=PAPER, line=LINE, radius=0.13)
    add_text(slide, short, x + 0.18, 2.70, 2.42, 0.24, size=14, color=INK, bold=True, font=DISPLAY)
    add_text(slide, tags, x + 0.18, 3.00, 2.35, 0.22, size=8.5, color=accent, bold=True, font=BODY)
    add_text(slide, pain_text, x + 0.18, 3.38, 2.38, 1.05, size=9.1, color=MUTED, line_spacing=1.5)
    add_pill(slide, "数据断点", x + 0.18, 4.43, 0.78, 0.25, tint, accent, None, size=7.2)

add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.68, 5.32, 11.95, 0.90, fill=GOLD_SOFT, line=RGBColor(0xE7, 0xD8, 0xB8), radius=0.14)
add_text(slide, "经营闭环", 0.94, 5.55, 1.2, 0.26, size=10.5, color=GOLD_DARK, bold=True, font=BODY)
add_text(slide, "同一份数据，应该在进货、养护、成交和复盘之间连续流动。", 2.02, 5.50, 8.7, 0.34, size=17, color=INK, bold=True, font=DISPLAY)
add_text(slide, "数据断点 → 经营盲区", 10.48, 5.56, 1.95, 0.24, size=8.7, color=GOLD_DARK, bold=True, font=BODY, align=PP_ALIGN.RIGHT)
set_notes(slide, "把花店的一天拆开看，清晨进货、白天养护、顾客成交、晚上复盘，每个环节都产生数据，但数据没有连续流动。库存和销售脱节，损耗和利润脱节，最后只能凭感觉经营。我们的产品就是围绕这四个环节做一条数据闭环。")

# =========================================================
# 04 Solution
# =========================================================
slide = content_slide("02 / 解决方案", "一个页面，跑通「采—存—售—算」", "一次录入，贯穿经营全流程；不增加硬件、不改变原有做生意的方式。")
add_text(slide, "花间集把花材库存、售价、订单和利润放在同一套本地数据里。\n从一朵花进入店里开始，到它被卖出去、被复盘，都留在同一条记录上。", 0.70, 1.62, 5.85, 0.9, size=11.2, color=INK_SOFT, line_spacing=1.65)

steps = [
    ("01", "采", "建立花材档案", "成本、售价、供应商、位置、安全库存一次录入。", GREEN_MID),
    ("02", "存", "每次变动有流水", "补货、报损、盘点都有记录，库龄自动计算。", GOLD_DARK),
    ("03", "售", "多品开单与改价", "自动扣库存，同步生成订单和销售凭证。", GREEN_MID),
    ("04", "算", "利润实时汇总", "收入、成本、损耗、净利与经营提醒一屏掌握。", GOLD_DARK),
]
for i, (num, ch, title, desc, accent) in enumerate(steps):
    col = i % 2
    row = i // 2
    x = 0.68 + col * 3.02
    y = 2.72 + row * 1.40
    add_circle(slide, x, y, 0.42, SAGE_SOFT if i != 1 else GOLD_SOFT)
    add_text(slide, ch, x, y + 0.02, 0.42, 0.36, size=15, color=accent, bold=True, font=DISPLAY, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    add_text(slide, title, x + 0.58, y + 0.01, 2.25, 0.24, size=10.8, color=INK, bold=True, font=BODY)
    add_text(slide, desc, x + 0.58, y + 0.30, 2.24, 0.62, size=8.8, color=MUTED, line_spacing=1.45)
    add_text(slide, num, x + 0.08, y + 0.44, 0.30, 0.18, size=7.5, color=MUTED_LIGHT, font=LATIN)

chips = [("零部署", "浏览器打开即用"), ("离线可用", "不依赖网络"), ("本地优先", "数据不出电脑")]
for i, (a, b) in enumerate(chips):
    x = 0.68 + i * 2.0
    add_pill(slide, f"{a}  ·  {b}", x, 5.84, 1.86, 0.35, PAPER, INK_SOFT, LINE, size=8)
add_text(slide, "小微商户需要的不是复杂 ERP，而是一个今天就能用起来的工具。", 0.70, 6.39, 5.9, 0.25, size=9.8, color=GREEN_MID, bold=True, font=BODY)

add_picture_fit(slide, ASSETS / "dashboard-frame.png", 7.03, 1.50, 5.78, 4.72)
add_text(slide, "产品实机界面 · 经营总览", 7.06, 6.30, 4.4, 0.2, size=7.6, color=MUTED, font=BODY)
set_notes(slide, "针对四个断点，我们的方案是一个页面跑通采、存、售、算。采是建档，存是库存流水，售是开单，算是利润。所有数据本地保存，打开浏览器就能用，不需要部署服务器，也不需要改变花店原有的经营习惯。右侧是我们的实际界面。")

# =========================================================
# 05 Product map
# =========================================================
slide = content_slide("02 / 产品全景", "六个模块，覆盖花店经营全流程", "不是功能堆叠，而是围绕同一份经营数据的不同视角。")
add_text(slide, "6 MODULES  /  ONE DATA LOOP", 9.55, 1.55, 3.1, 0.22, size=8, color=GOLD_DARK, bold=True, font=LATIN, align=PP_ALIGN.RIGHT, letter_spacing=1.0)
modules = [
    ("01", "经营总览", "今日经营简报、关键指标、营收趋势与待办提醒。", "核心动作：看今日待办", SAGE_SOFT, GREEN_MID),
    ("02", "库存管理", "剩余数量、安全库存、库龄、智能补货与库存流水。", "核心动作：查库存、去补货", GOLD_SOFT, GOLD_DARK),
    ("03", "快速开单", "多品清单、现场改价、自动扣库、收款凭证。", "核心动作：选花、收款", PEACH_SOFT, RED),
    ("04", "价格行情", "售价成本曲线、调价记录、目标毛利与建议售价。", "核心动作：看曲线、改价", SAGE_SOFT, GREEN_MID),
    ("05", "销售记录", "订单流水、商品明细、整单退款与 CSV 导出。", "核心动作：查流水、退款", GOLD_SOFT, GOLD_DARK),
    ("06", "盈利分析", "净利、损耗、品类结构、单品排行与客户贡献。", "核心动作：看净利、找问题", PEACH_SOFT, RED),
]
for i, (num, title, desc, action, tint, accent) in enumerate(modules):
    col = i % 3
    row = i // 3
    x = 0.68 + col * 4.04
    y = 1.82 + row * 2.35
    add_card(slide, x, y, 3.80, 2.08, fill=PAPER, line=LINE, radius=0.15)
    add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, x + 0.18, y + 0.20, 0.47, 0.47, fill=tint, line=None, radius=0.10)
    add_text(slide, num, x + 0.18, y + 0.27, 0.47, 0.28, size=9.5, color=accent, bold=True, font=LATIN, align=PP_ALIGN.CENTER)
    add_text(slide, title, x + 0.80, y + 0.21, 2.70, 0.30, size=14.5, color=INK, bold=True, font=DISPLAY)
    add_text(slide, desc, x + 0.80, y + 0.65, 2.72, 0.85, size=9.2, color=MUTED, line_spacing=1.5)
    add_line(slide, x + 0.18, y + 1.70, x + 3.60, y + 1.70, LINE, 0.6)
    add_text(slide, action, x + 0.18, y + 1.80, 2.55, 0.18, size=7.5, color=accent, bold=True, font=BODY)

add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.68, 6.30, 11.95, 0.44, fill=SAGE_PALE, line=None, radius=0.10)
add_text(slide, "附加能力：智能补货  ·  库龄预警  ·  损耗归因  ·  退款回滚  ·  JSON / CSV 备份  ·  移动端适配", 0.92, 6.39, 11.3, 0.23, size=8.8, color=GREEN, bold=True, font=BODY)
set_notes(slide, "产品一共六个模块。经营总览负责看今天该做什么；库存管理解决数量、成本和库龄；快速开单负责成交；价格行情负责定价记录；销售记录负责可追溯；盈利分析负责看清净利润。它们不是六个独立工具，而是同一份数据的不同切面。")

# =========================================================
# 06-10 Feature screenshots
# =========================================================
def feature_slide(section_no, feature_no, title, subtitle, image_name, callouts, quote, note):
    slide = content_slide(f"03 / 功能演示 · {section_no:02d}", title, subtitle, note="花间集 · 产品实机界面（数据为示例）")
    add_pill(slide, f"FEATURE  {feature_no:02d}", 11.28, 1.53, 1.38, 0.28, DARK, RGBColor(0xE6, 0xD0, 0xA2), None, size=7.2)
    pic, box = add_picture_fit(slide, ASSETS / image_name, 0.58, 1.62, 8.03, 5.26)
    # callout label
    add_text(slide, "界面要点", 8.82, 1.58, 2.0, 0.22, size=8, color=GOLD_DARK, bold=True, font=LATIN, letter_spacing=1.0)
    for i, (ct, cd) in enumerate(callouts):
        add_callout(slide, 8.82, 1.91 + i * 1.07, i + 1, ct, cd)
        if i < 3:
            add_line(slide, 9.30, 2.80 + i * 1.07, 12.48, 2.80 + i * 1.07, RGBColor(0xEE, 0xEA, 0xDE), 0.6)
    add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 8.82, 6.20, 3.72, 0.65, fill=DARK, line=None, radius=0.12)
    add_text(slide, quote, 9.00, 6.28, 3.35, 0.42, size=9.3, color=CREAM, bold=True, font=DISPLAY, line_spacing=1.2)
    set_notes(slide, note)
    return slide

feature_slide(
    1, 1,
    "打开页面，先看今天该做什么",
    "经营总览不是报表堆砌，而是每天工作的起点。",
    "dashboard-frame.png",
    [
        ("经营指标", "本月营收、毛利、库存成本与在库量一屏掌握。"),
        ("趋势判断", "近 7 / 30 天营收与毛利走势，看见经营节奏。"),
        ("主动提醒", "低库存、超 7 天库龄、毛利偏薄自动预警。"),
        ("行动入口", "一键去开单、去补货，从看数到处理。"),
    ],
    "从“看数据”到“做动作”，只差一个提醒。",
    "第一张是经营总览。我们把花店每天最需要知道的四个数字放在最上面，再给出营收与毛利趋势。右侧经营提醒会自动识别低库存、滞销和毛利偏薄的花，补货建议直接给出建议数量。页面不是让用户研究报表，而是直接告诉他今天该做什么。"
)

feature_slide(
    2, 2,
    "每一枝花，都知道剩多少、值多少、放了多久",
    "库存不是一串数字，而是会变老的资产。",
    "inventory-frame.png",
    [
        ("库存水位", "剩余数量 × 安全库存，进度条一眼判断风险。"),
        ("库龄管理", "3 / 5 / 7 天分级，优先处理易损耗花材。"),
        ("智能补货", "按近 7 日销量与 5 日覆盖估算补货量。"),
        ("三种调整", "补货、报损、盘点修正，全部留下流水。"),
    ],
    "库存不是一串数字，而是会变老的资产。",
    "库存管理解决三个问题：还剩多少、值多少钱、放了多久。每枝花都有安全库存和库龄，超过 7 天会被标记为滞销风险。补货建议不是拍脑袋，而是根据近 7 天销量和 5 天覆盖目标估算。手动调整分为补货、报损、盘点三种，每一次都生成流水，保证成本可追溯。"
)

feature_slide(
    3, 3,
    "把开单变成三步：选花、改价、收款",
    "把一次成交，变成一条可追溯的数据。",
    "sales-frame.png",
    [
        ("多品清单", "选花加入清单，数量与单价现场可改。"),
        ("自动联动", "收款即扣库存，成本与毛利同步落账。"),
        ("订单凭证", "客户、收款方式、备注完整留痕。"),
        ("移动开单", "摊位与外出场景，用手机也能完成整单。"),
    ],
    "把一次成交，变成一条可追溯的数据。",
    "快速开单把现场交易变成一个结构化订单。左侧选花，右侧实时计算件数、成本、毛利和应收；单价可以按现场折扣修改，收款后自动扣减库存并生成凭证。它支持多品清单，也支持移动端。对花店来说，这一步越简单，数据才越可能被完整记录。"
)

feature_slide(
    4, 4,
    "价格不是拍脑袋，是一条能回看的曲线",
    "售价与成本同图呈现，让每一次调价都有依据。",
    "pricing-frame.png",
    [
        ("双线走势", "售价与成本同图对比，价格变化看得见。"),
        ("调价留痕", "原价、新价、幅度与原因，一条不落。"),
        ("目标毛利", "售价 = 成本 ÷（1 − 目标毛利率），倒推建议价。"),
        ("多品切换", "每种花独立价格曲线，按品类精细管理。"),
    ],
    "定价从经验判断，变成可以复盘的决策。",
    "价格行情把售价和成本画在同一张图上，每次调价都会记录原价、新价、幅度和原因。右侧还能按目标毛利率倒推建议售价。对花店来说，价格不是固定参数，而是随季节、品质和供应变化的管理动作，这张曲线让动作有据可查。"
)

feature_slide(
    5, 5,
    "不只看卖了多少，更看最后赚了多少",
    "收入、成本、损耗和净利，才是完整的经营结果。",
    "finance-frame.png",
    [
        ("净利口径", "营业收入 − 商品成本 − 损耗成本，利润不注水。"),
        ("品类结构", "钱从哪些花来，占比一目了然。"),
        ("单品排行", "销量、营收、毛利、毛利率四维比较。"),
        ("经营诊断", "客户贡献与低毛利商品自动提示。"),
    ],
    "不只看卖了多少，更看最后留下多少。",
    "盈利分析把营业收入、商品成本、毛利和损耗放在一起。这里最重要的不是营业额，而是扣除采购成本和报损后的净利润。品类收入结构能看出钱从哪些花来，单品排行能看出哪些花真正赚钱，客户贡献则帮助花店识别复购价值。"
)

# =========================================================
# 11 Details
# =========================================================
slide = content_slide("03 / 功能演示 · 06", "细节，决定它能不能真的用起来", "录入、凭证、移动端，三个容易被忽略但决定体验的环节。", note="花间集 · 产品实机界面（数据为示例）")
detail_items = [
    ("01", "INPUT / 录入", "花卉录入", "档案、成本、售价、安全库存一次建立。", "add-flower-frame.png", False),
    ("02", "RECEIPT / 凭证", "收款凭证", "每笔订单都可查看明细、毛利与退款入口。", "order-success-frame.png", False),
    ("03", "MOBILE / 移动端", "移动开单", "手机上也能完成选花、改价、收款全流程。", "mobile-checkout-frame.png", True),
]
for i, (num, tag, title, desc, img, phone) in enumerate(detail_items):
    x = 0.62 + i * 4.06
    add_text(slide, tag, x, 1.55, 2.8, 0.20, size=7.8, color=GOLD_DARK, bold=True, font=LATIN, letter_spacing=1.0)
    if phone:
        add_picture_fit(slide, ASSETS / img, x + 0.60, 1.82, 2.3, 3.18)
    else:
        add_picture_fit(slide, ASSETS / img, x, 1.82, 3.72, 2.62)
    add_text(slide, title, x, 5.17, 3.52, 0.28, size=14, color=INK, bold=True, font=DISPLAY)
    add_text(slide, desc, x, 5.55, 3.50, 0.60, size=9.2, color=MUTED, line_spacing=1.4)
    add_text(slide, num, x, 6.20, 0.40, 0.22, size=8.5, color=GOLD_DARK, bold=True, font=LATIN)

add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.68, 6.45, 11.95, 0.40, fill=SAGE_PALE, line=None, radius=0.10)
add_text(slide, "从新建一枝花，到收到一笔钱，再到手机上复盘——每一步都不跳出同一个工作台。", 0.92, 6.53, 11.4, 0.22, size=8.8, color=GREEN, bold=True, font=BODY)
set_notes(slide, "这一页补充三个容易被忽略的细节：花卉录入把所有关键信息一次建档；收款凭证让每笔交易有据可查；移动端让花店在摊位或外出场景也能开单。产品不是只做电脑端的大屏，而是适配真实经营场景。")

# =========================================================
# 12 Tech / innovation
# =========================================================
slide = content_slide("04 / 技术与创新", "轻，但不简单", "用最低的使用门槛，承载完整的经营数据闭环。", dark=True)
add_flower_motif(slide, 12.1, 1.3, 2.1, color=RGBColor(0x5D, 0x82, 0x6E), alpha=0.06, fill=True)

add_text(slide, "产品架构", 0.68, 1.59, 2.2, 0.22, size=8, color=GOLD, bold=True, font=LATIN, letter_spacing=1.0)
layers = [
    ("01", "体验层", "响应式单页 / SVG 图表 / 表单与弹窗 / 移动端适配", SAGE_SOFT),
    ("02", "业务层", "库存流水 / 加权成本 / 退款回滚 / 毛利核算 / 补货建议", GREEN_MID),
    ("03", "数据层", "LocalStorage / JSON 备份 / CSV 导出 / 本地优先", RGBColor(0x2A, 0x5D, 0x4B)),
]
for i, (num, title, desc, fill) in enumerate(layers):
    y = 1.92 + i * 1.40
    add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.68, y, 6.15, 1.10, fill=fill, line=RGBColor(0x3F, 0x70, 0x5B), radius=0.14)
    add_text(slide, num, 0.88, y + 0.18, 0.42, 0.22, size=8, color=GOLD, bold=True, font=LATIN)
    add_text(slide, title, 1.40, y + 0.14, 1.45, 0.25, size=12.5, color=CREAM if i > 0 else INK, bold=True, font=DISPLAY)
    add_text(slide, desc, 1.40, y + 0.46, 4.95, 0.42, size=8.6, color=RGBColor(0xD5, 0xE2, 0xD9) if i > 0 else INK_SOFT, line_spacing=1.35)
    if i < 2:
        add_line(slide, 3.75, y + 1.10, 3.75, y + 1.40, RGBColor(0x7C, 0x9E, 0x89), 1.0, MSO_LINE_DASH_STYLE.DASH)

add_text(slide, "五个创新点", 7.38, 1.59, 2.4, 0.22, size=8, color=GOLD, bold=True, font=LATIN, letter_spacing=1.0)
innovations = [
    ("01", "从记账到决策", "补货建议、库龄预警、毛利诊断，告诉用户下一步做什么。"),
    ("02", "从单点到闭环", "库存、价格、订单、利润共用一份数据，退款自动回滚。"),
    ("03", "从高门槛到零部署", "浏览器打开即用，不增加硬件、账号和培训负担。"),
    ("04", "从营收幻觉到净利", "把损耗与退款纳入核算口径，利润不注水。"),
    ("05", "从电脑到移动端", "移动开单，适应摊位、外出和临时销售场景。"),
]
for i, (num, title, desc) in enumerate(innovations):
    y = 1.92 + i * 0.92
    add_number(slide, 7.38, y + 0.03, 0.30, i + 1, fill=RGBColor(0x2B, 0x5E, 0x4C), color=RGBColor(0xE3, 0xC6, 0x91), size=8)
    add_text(slide, title, 7.82, y, 2.25, 0.23, size=10.3, color=CREAM, bold=True, font=BODY)
    add_text(slide, desc, 7.82, y + 0.27, 4.65, 0.48, size=8.3, color=RGBColor(0xB8, 0xCA, 0xBE), line_spacing=1.42)

chips = ["纯前端", "零依赖", "离线可用", "本地数据"]
for i, chip in enumerate(chips):
    add_pill(slide, chip, 0.68 + i * 1.31, 6.40, 1.18, 0.32, RGBColor(0x1C, 0x4A, 0x3D), RGBColor(0xD8, 0xE4, 0xDA), RGBColor(0x35, 0x63, 0x50), size=8)
add_text(slide, "HTML / CSS / JavaScript · 无外部服务依赖", 6.02, 6.46, 5.6, 0.20, size=8, color=RGBColor(0x91, 0xA9, 0x9C), font=LATIN, align=PP_ALIGN.RIGHT, letter_spacing=0.6)
set_notes(slide, "技术上我们刻意选择了轻。前端单页、无外部依赖、本地存储，好处是零部署、离线可用、数据不出电脑。业务层则完整实现库存流水、加权成本、退款回滚、毛利核算。轻不是功能少，而是把复杂度留给自己，把简单留给用户。")

# =========================================================
# 13 Business model
# =========================================================
slide = content_slide("05 / 商业模式", "轻量工具，也能长成一门生意", "先服务好一家花店，再服务一片花店；先把工具卖出去，再把服务做深。")
# customer segments
add_text(slide, "目标客户", 0.68, 1.57, 2.2, 0.22, size=8, color=GOLD_DARK, bold=True, font=LATIN, letter_spacing=1.0)
segments = [("独立花店", "主力客群"), ("花艺工作室", "项目制客户"), ("校园花摊", "轻量试用"), ("小型花艺电商", "多端需求")]
for i, (name, tag) in enumerate(segments):
    x = 0.68
    y = 1.88 + i * 0.95
    add_circle(slide, x, y + 0.04, 0.15, GOLD if i == 0 else SAGE)
    add_text(slide, name, x + 0.28, y, 1.85, 0.23, size=10.8, color=INK, bold=True, font=BODY)
    add_text(slide, tag, x + 0.28, y + 0.27, 1.8, 0.18, size=8, color=MUTED, font=BODY)

# revenue cards
add_text(slide, "收入结构", 3.42, 1.57, 2.2, 0.22, size=8, color=GOLD_DARK, bold=True, font=LATIN, letter_spacing=1.0)
tiers = [
    ("免费本地版", "¥0", "基础库存 · 开单 · 利润看板", "降低试用门槛，建立口碑", SAGE_SOFT),
    ("专业版（规划）", "¥29 / 月 / 店", "云同步 · 多端协作 · 跨店数据", "主要订阅收入", GOLD_SOFT),
    ("定制服务", "项目制", "建站 · 供应链 · 私域运营", "提升客单与粘性", PEACH_SOFT),
]
for i, (name, price, desc, value, tint) in enumerate(tiers):
    y = 1.88 + i * 1.32
    add_card(slide, 3.42, y, 4.68, 1.14, fill=PAPER, line=LINE, radius=0.12)
    add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 3.56, y + 0.16, 0.10, 0.80, fill=tint, line=None, radius=0.05)
    add_text(slide, name, 3.80, y + 0.15, 1.80, 0.23, size=10.5, color=INK, bold=True, font=BODY)
    add_text(slide, price, 5.55, y + 0.13, 1.65, 0.30, size=15, color=GREEN if i != 1 else GOLD_DARK, bold=True, font=LATIN, align=PP_ALIGN.RIGHT)
    add_text(slide, desc, 3.80, y + 0.45, 3.95, 0.22, size=8.1, color=MUTED, font=BODY)
    add_text(slide, value, 3.80, y + 0.75, 3.95, 0.20, size=8.1, color=GREEN_MID, bold=True, font=BODY)

# unit model
add_text(slide, "情景测算（假设，非预测）", 8.62, 1.57, 3.4, 0.22, size=8, color=GOLD_DARK, bold=True, font=LATIN, letter_spacing=0.8)
add_card(slide, 8.62, 1.88, 3.95, 3.92, fill=DARK, line=None, radius=0.16)
add_text(slide, "如果先跑通 100 家店", 8.86, 2.10, 3.45, 0.28, size=10.5, color=RGBColor(0xD8, 0xE4, 0xDA), bold=True, font=BODY)
add_text(slide, "¥34,800", 8.86, 2.45, 3.35, 0.58, size=31, color=RGBColor(0xF2, 0xDE, 0xB4), bold=True, font=LATIN)
add_text(slide, "年订阅收入 = 100 家 × ¥29 × 12", 8.88, 3.05, 3.30, 0.22, size=8.2, color=RGBColor(0xB5, 0xC8, 0xBB), font=BODY)
add_line(slide, 8.88, 3.34, 12.28, 3.34, RGBColor(0x3C, 0x68, 0x55), 0.7)
unit_rows = [("软件毛利率", "> 80%"), ("目标获客成本", "< ¥50 / 店"), ("边际交付成本", "接近 0")]
for i, (label, value) in enumerate(unit_rows):
    y = 3.50 + i * 0.42
    add_text(slide, label, 8.88, y, 1.8, 0.22, size=8.4, color=RGBColor(0xA8, 0xBE, 0xB0), font=BODY)
    add_text(slide, value, 10.50, y - 0.02, 1.70, 0.26, size=10.8, color=CREAM, bold=True, font=LATIN, align=PP_ALIGN.RIGHT)
    if i < 2:
        add_line(slide, 8.88, y + 0.34, 12.28, y + 0.34, RGBColor(0x2E, 0x59, 0x48), 0.5)
add_text(slide, "轻量、本地优先的架构，使软件具备良好的规模复制能力。", 8.88, 4.86, 3.40, 0.55, size=8.3, color=RGBColor(0xBD, 0xCF, 0xC2), line_spacing=1.5)
add_pill(slide, "初步商业假设，待门店验证", 8.88, 5.30, 2.35, 0.28, RGBColor(0x29, 0x58, 0x48), RGBColor(0xE8, 0xD2, 0xA5), None, size=7.5)

add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.68, 5.98, 7.45, 0.50, fill=SAGE_PALE, line=None, radius=0.10)
add_text(slide, "冷启动：校园周边 3 公里  →  花材供应商  →  花艺社群", 0.90, 6.09, 6.95, 0.24, size=9.3, color=GREEN, bold=True, font=BODY)
add_text(slide, "先做深一个区域，再做宽一类人群。", 0.70, 6.70, 5.6, 0.20, size=8.5, color=MUTED, font=BODY)
set_notes(slide, "商业模式上，我们采用免费本地版获客，专业版订阅收费，定制服务提升客单。初步按 100 家店、每月 29 元做情景测算，年订阅收入约 3.48 万元。这个数字不是预测，而是帮助我们理解商业模型的假设。冷启动先从校园周边三公里开始，通过花材供应商和花艺社群触达门店。")

# =========================================================
# 14 Roadmap / team
# =========================================================
slide = content_slide("05 / 落地计划", "小步快跑，先把10家店跑通", "创业不是先做大，而是先证明这套工具真的能改善一家店的经营。")
phases = [
    ("0–3 个月", "验证期", "10 家种子门店", "验证开单频次、库存损耗率与 7 日留存。", SAGE_SOFT, GREEN_MID),
    ("3–6 个月", "产品化", "30 家付费门店", "上线云同步、多端协作与跨店数据。", GOLD_SOFT, GOLD_DARK),
    ("6–12 个月", "区域复制", "100 家门店", "加入供应链价格参考与经营数据服务。", PEACH_SOFT, RED),
]
add_line(slide, 0.88, 2.05, 12.30, 2.05, RGBColor(0xD0, 0xD8, 0xCB), 1.1)
for i, (period, phase, target, desc, tint, accent) in enumerate(phases):
    x = 0.68 + i * 4.05
    add_circle(slide, x + 0.36, 1.93, 0.24, CREAM, line=GOLD, line_width=1.0)
    add_circle(slide, x + 0.405, 1.975, 0.15, GOLD)
    add_text(slide, period, x, 1.54, 1.5, 0.24, size=9, color=accent, bold=True, font=LATIN, letter_spacing=0.5)
    add_card(slide, x, 2.34, 3.80, 1.83, fill=PAPER, line=LINE, radius=0.13)
    add_text(slide, phase, x + 0.20, 2.51, 1.4, 0.26, size=13, color=INK, bold=True, font=DISPLAY)
    add_pill(slide, target, x + 0.20, 2.88, 1.75, 0.30, tint, accent, None, size=7.7)
    add_text(slide, desc, x + 0.20, 3.36, 3.32, 0.60, size=8.8, color=MUTED, line_spacing=1.45)

# current progress
add_text(slide, "当前进度", 0.68, 4.52, 2.0, 0.24, size=8, color=GOLD_DARK, bold=True, font=LATIN, letter_spacing=1.0)
progress = ["MVP 已完成，单文件可离线运行", "库存、开单、价格、利润闭环已经跑通", "JSON / CSV 导入导出具备交付能力", "下一步：真实门店验证与云同步"]
for i, text in enumerate(progress):
    y = 4.82 + i * 0.36
    add_circle(slide, 0.70, y + 0.06, 0.12, GREEN if i < 3 else GOLD)
    add_text(slide, text, 0.94, y, 4.75, 0.22, size=8.8, color=INK_SOFT if i < 3 else GOLD_DARK, bold=i >= 3, font=BODY)

# team
add_text(slide, "团队分工", 6.12, 4.52, 2.0, 0.24, size=8, color=GOLD_DARK, bold=True, font=LATIN, letter_spacing=1.0)
add_pill(slide, f"TEAM  /  {TEAM}", 10.00, 4.48, 2.62, 0.36, DARK, RGBColor(0xE6, 0xD0, 0xA2), None, size=8.2)
roles = [("产品与调研", "需求、场景、验证"), ("交互与视觉", "界面、原型、体验"), ("数据与商业", "指标、模型、测算"), ("运营与宣讲", "内容、渠道、表达")]
for i, (role, desc) in enumerate(roles):
    col = i % 2
    row = i // 2
    x = 6.12 + col * 3.20
    y = 4.88 + row * 0.82
    add_card(slide, x, y, 2.94, 0.66, fill=SAGE_PALE, line=None, radius=0.10)
    add_text(slide, role, x + 0.16, y + 0.10, 2.55, 0.22, size=9.5, color=INK, bold=True, font=BODY)
    add_text(slide, desc, x + 0.16, y + 0.34, 2.55, 0.18, size=7.7, color=MUTED, font=BODY)

add_shape(slide, MSO_SHAPE.ROUNDED_RECTANGLE, 0.68, 6.57, 11.95, 0.34, fill=GOLD_SOFT, line=None, radius=0.08)
add_text(slide, "团队文化：跟党走就队  ·  把认真调研、踏实做产品的作风，落到每一页界面和每一次验证里。", 0.90, 6.64, 11.4, 0.20, size=8.4, color=GOLD_DARK, bold=True, font=BODY)
set_notes(slide, "落地计划分三步：0 到 3 个月先找 10 家种子门店验证，3 到 6 个月做云同步和多端协作，6 到 12 个月做区域复制。当前 MVP 已经完成，单文件可离线运行，但还没有真实门店的大规模验证，这是我们下一步最重要的工作。团队按产品调研、交互视觉、数据商业和运营宣讲分工，团队名是跟党走就队。")

# =========================================================
# 15 Closing
# =========================================================
slide = prs.slides.add_slide(prs.slide_layouts[6])
set_bg(slide, DARK)
add_flower_motif(slide, 10.9, 3.35, 3.6, color=RGBColor(0x74, 0x97, 0x7D), alpha=0.06, fill=True)
add_flower_motif(slide, 10.9, 3.35, 3.6, color=GOLD, alpha=0.10, fill=False)
add_shape(slide, MSO_SHAPE.OVAL, -1.4, 4.9, 3.6, 3.6, fill=None, line=RGBColor(0x45, 0x70, 0x5D), line_width=0.6)

add_line(slide, 0.80, 1.22, 1.45, 1.22, GOLD, 1.8)
add_text(slide, "花间集  /  FLOWER ATELIER", 0.80, 1.48, 5.8, 0.24, size=9, color=RGBColor(0xBF, 0xCF, 0xC3), bold=True, font=LATIN, letter_spacing=1.1)
add_text(slide, "让每一家小花店，\n都有一套用得起的\n数字经营系统。", 0.76, 2.12, 8.2, 2.52, size=37, color=RGBColor(0xF8, 0xF3, 0xE5), bold=True, font=DISPLAY, line_spacing=1.32)
add_text(slide, "从一朵花的进货，到一笔订单的利润；\n让经营数据真正帮上忙。", 0.82, 4.80, 6.6, 0.75, size=13, color=RGBColor(0xC1, 0xD2, 0xC6), font=BODY, line_spacing=1.65)

add_line(slide, 0.82, 5.98, 5.9, 5.98, RGBColor(0x43, 0x70, 0x5C), 0.8)
add_text(slide, "感谢聆听  ·  欢迎批评指正", 0.82, 6.17, 5.0, 0.30, size=13, color=RGBColor(0xE8, 0xD3, 0xAA), bold=True, font=DISPLAY)
add_text(slide, f"{TEAM}  ·  创新创业课程项目", 0.84, 6.57, 5.0, 0.22, size=8.5, color=RGBColor(0x9D, 0xB4, 0xA6), font=BODY, letter_spacing=0.2)
add_pill(slide, "现场演示：花间集网页版", 9.54, 6.55, 2.90, 0.36, RGBColor(0x1D, 0x4A, 0x3D), RGBColor(0xE5, 0xD0, 0xA4), RGBColor(0x3A, 0x66, 0x53), size=8.2)
set_notes(slide, "最后一句话：让每一家小花店，都有一套用得起的数字经营系统。我们相信，数字化不应该只属于大连锁，也应该成为街角花店经营的一份底气。感谢聆听，欢迎老师和同学批评指正。")

# core properties
prs.core_properties.title = "花间集 · 花卉经营数字化工作台"
prs.core_properties.subject = "创新创业课程项目路演"
prs.core_properties.author = TEAM
prs.core_properties.keywords = "花店, 花卉管理, 创新创业, SaaS, 本地优先"
prs.core_properties.comments = "花间集产品介绍与商业计划演示文稿"

prs.save(OUT)
print("SAVED", OUT)
print("SLIDES", len(prs.slides))
