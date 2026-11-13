from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(r"C:\Users\ASUS\Documents\deepseek-harness\default-workspace\qq-bridge-setup\qq-bridge\state\agents\flower-presentation")
SHOTS = ROOT / "shots"
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

FONT = r"C:\Windows\Fonts\msyhbd.ttc"
FONT_REG = r"C:\Windows\Fonts\msyh.ttc"


def rounded_mask(size, radius, top_square=True):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    if top_square:
        d.rectangle((0, 0, size[0], radius), fill=255)
    return mask


def drop_shadow(size, radius, blur=38, offset=(0, 18), alpha=80):
    pad = blur * 2
    canvas = Image.new("RGBA", (size[0] + pad * 2, size[1] + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    x = pad + offset[0]
    y = pad + offset[1]
    d.rounded_rectangle((x, y, x + size[0], y + size[1]), radius=radius, fill=(15, 39, 31, alpha))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(shadow)
    return canvas, pad


def browser_frame(src: Path, dst: Path, label):
    app = Image.open(src).convert("RGB")
    w, h = app.size
    bar = 72
    radius = 36
    win_w, win_h = w, h + bar
    window = Image.new("RGBA", (win_w, win_h), (0, 0, 0, 0))

    # subtle outer border / background
    d = ImageDraw.Draw(window)
    d.rounded_rectangle((0, 0, win_w - 1, win_h - 1), radius=radius, fill=(244, 241, 232, 255))

    # browser bar
    d.rounded_rectangle((0, 0, win_w - 1, bar + radius), radius=radius, fill=(247, 244, 236, 255))
    d.rectangle((0, bar - 1, win_w, bar), fill=(221, 216, 202, 255))
    for i, color in enumerate([(217, 149, 121), (193, 154, 86), (127, 167, 140)]):
        cx = 38 + i * 30
        d.ellipse((cx - 7, bar // 2 - 7, cx + 7, bar // 2 + 7), fill=color)
    try:
        f = ImageFont.truetype(FONT, 30)
    except Exception:
        f = ImageFont.load_default()
    tw = d.textlength(label, font=f)
    d.text(((win_w - tw) / 2, (bar - 34) / 2), label, font=f, fill=(117, 131, 123))
    try:
        f2 = ImageFont.truetype(FONT_REG, 19)
    except Exception:
        f2 = ImageFont.load_default()
    right = "LIVE PRODUCT"
    d.text((win_w - 142, (bar - 22) / 2), right, font=f2, fill=(177, 146, 91))

    # app screenshot with rounded bottom, square top
    app_rgba = app.convert("RGBA")
    app_mask = rounded_mask((w, h), radius, top_square=True)
    window.paste(app_rgba, (0, bar), app_mask)

    # outer rounded mask
    outer_mask = Image.new("L", (win_w, win_h), 0)
    ImageDraw.Draw(outer_mask).rounded_rectangle((0, 0, win_w - 1, win_h - 1), radius=radius, fill=255)
    window.putalpha(outer_mask)

    # border and shadow
    shadow_canvas, pad = drop_shadow((win_w, win_h), radius)
    shadow_canvas.alpha_composite(window, (pad, pad))
    final = Image.new("RGBA", shadow_canvas.size, (0, 0, 0, 0))
    final.alpha_composite(shadow_canvas)
    # fine border
    d2 = ImageDraw.Draw(final)
    d2.rounded_rectangle((pad, pad, pad + win_w - 1, pad + win_h - 1), radius=radius, outline=(218, 211, 195, 180), width=2)
    final.save(dst)


def phone_frame(src: Path, dst: Path):
    screen = Image.open(src).convert("RGB")
    # Trim the partly visible fixed cart bar at the bottom for a clean phone screen.
    screen = screen.crop((0, 0, screen.width, screen.height - 105))
    w, h = screen.size
    bezel = 26
    radius = 106
    win_w, win_h = w + bezel * 2, h + bezel * 2
    phone = Image.new("RGBA", (win_w, win_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(phone)
    d.rounded_rectangle((0, 0, win_w - 1, win_h - 1), radius=radius, fill=(18, 60, 50, 255))
    # inner metallic-ish edge
    d.rounded_rectangle((bezel - 4, bezel - 4, win_w - bezel + 3, win_h - bezel + 3), radius=90, outline=(70, 104, 91, 255), width=2)
    screen = screen.convert("RGBA")
    mask = rounded_mask((w, h), 84, top_square=False)
    phone.paste(screen, (bezel, bezel), mask)
    # small speaker slot
    d.rounded_rectangle((win_w / 2 - 34, 12, win_w / 2 + 34, 18), radius=3, fill=(58, 91, 79, 255))

    shadow_canvas, pad = drop_shadow((win_w, win_h), radius, blur=34, offset=(0, 20), alpha=95)
    shadow_canvas.alpha_composite(phone, (pad, pad))
    final = Image.new("RGBA", shadow_canvas.size, (0, 0, 0, 0))
    final.alpha_composite(shadow_canvas)
    final.save(dst)


mapping = {
    "dashboard.png": ("dashboard-frame.png", "花间集 · 经营总览"),
    "inventory.png": ("inventory-frame.png", "花间集 · 库存管理"),
    "sales-clean.png": ("sales-frame.png", "花间集 · 快速开单"),
    "pricing.png": ("pricing-frame.png", "花间集 · 价格行情"),
    "finance.png": ("finance-frame.png", "花间集 · 盈利分析"),
    "records.png": ("records-frame.png", "花间集 · 销售记录"),
    "add-flower.png": ("add-flower-frame.png", "花间集 · 新增花卉"),
    "order-success.png": ("order-success-frame.png", "花间集 · 收款凭证"),
}
for src_name, (dst_name, label) in mapping.items():
    browser_frame(SHOTS / src_name, ASSETS / dst_name, label)
    print("framed", dst_name)

phone_frame(SHOTS / "mobile-checkout-2.png", ASSETS / "mobile-checkout-frame.png")
print("framed mobile-checkout-frame.png")
