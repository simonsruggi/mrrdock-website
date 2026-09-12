#!/usr/bin/env python3
"""Genera public/og.png (1280x640), l'anteprima social della landing page.

Usa i font di sistema macOS (SFNS.ttf) e l'icona dell'app: va rilanciato a mano
solo se cambia il claim o l'icona.

    python3 scripts/make-og.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = "/System/Library/Fonts/SFNS.ttf"
W, H = 1280, 640
BG = (11, 12, 14)
TEXT = (240, 243, 247)
GREEN = (125, 211, 160)
MUTED = (148, 157, 170)


def font(size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(FONT, size)
    f.set_variation_by_name(weight)
    return f


def main() -> None:
    img = Image.new("RGB", (W, H), BG)

    # Alone verde sfumato in alto: un gradiente radiale sfocato, non un cerchio netto.
    mask = Image.new("L", (W, H), 0)
    md = ImageDraw.Draw(mask)
    for i in range(60):
        r = 760 - i * 12
        md.ellipse([W // 2 - r, -40 - r // 2, W // 2 + r, -40 + r // 2], fill=int(i * 1.6))
    mask = mask.filter(ImageFilter.GaussianBlur(90)).point(lambda v: min(v, 110))
    img = Image.composite(Image.new("RGB", (W, H), (30, 120, 58)), img, mask)

    d = ImageDraw.Draw(img)
    icon = Image.open(ROOT / "public/icon.png").convert("RGBA").resize((132, 132), Image.LANCZOS)
    img.paste(icon, (90, 96), icon)

    d.text((90, 268), "MRRDock", font=font(92, "Bold"), fill=TEXT)
    d.text((92, 382), "MRR tracker for the macOS menu bar", font=font(46, "Semibold"), fill=GREEN)
    d.text((92, 466), "Stripe · RevenueCat · Paddle · Lemon Squeezy", font=font(29), fill=MUTED)
    d.text((92, 506), "Polar · Dodo Payments · Gumroad · custom endpoint", font=font(29), fill=MUTED)
    d.text((92, 556), "Free and open source — your keys stay in the Keychain",
           font=font(29, "Medium"), fill=(110, 119, 132))

    # Finto elemento di menu bar, in alto a destra.
    x0, y0, x1, y1 = 800, 112, 1190, 190
    d.rounded_rectangle([x0, y0, x1, y1], radius=18, fill=(24, 27, 32), outline=(44, 49, 57), width=2)
    bx, by = x0 + 30, y1 - 26
    for i, h in enumerate((14, 24, 34, 46)):
        d.rounded_rectangle([bx + i * 13, by - h, bx + i * 13 + 8, by], radius=2, fill=GREEN)
    d.text((x0 + 96, y0 + 16), "€2,191", font=font(44, "Semibold"), fill=TEXT)
    d.text((x0 + 256, y0 + 24), "+8%", font=font(34, "Medium"), fill=GREEN)

    out = ROOT / "public/og.png"
    img.save(out)
    print(f"scritto {out} ({W}x{H})")


if __name__ == "__main__":
    main()
