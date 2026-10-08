#!/usr/bin/env python3
"""Render share cards and icons from the supplied logos using HTML/CSS."""

import base64
from pathlib import Path
import shutil
import unicodedata
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]


def main():
    logos = {unicodedata.normalize("NFC", file.name): file for file in ROOT.glob("*.png")}
    wordmark = logos["기본로고.png"]
    symbol = logos["심볼로그.png"]
    brand = ROOT / "assets/brand"
    social = ROOT / "assets/social"
    brand.mkdir(parents=True, exist_ok=True)
    social.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(wordmark, brand / "wordmark.png")
    shutil.copyfile(symbol, brand / "symbol.png")
    image = lambda file: "data:image/png;base64," + base64.b64encode(file.read_bytes()).decode()
    font = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;600&amp;display=swap">'
    style = "body{margin:0;background:#0D1326;color:#F2EBDD;font-family:'Noto Sans KR',sans-serif}*{box-sizing:border-box}.card{position:relative;width:1200px;height:630px;overflow:hidden}.url{position:absolute;bottom:48px;left:70px;color:#AFB7C9;font-size:25px;letter-spacing:.02em}"
    cards = {
        "duvridge": f'<img src="{image(wordmark)}" style="position:absolute;width:1080px;height:360px;object-fit:contain;left:60px;top:85px"><p style="position:absolute;top:440px;left:0;right:0;text-align:center;font:italic 36px Georgia,serif;margin:0">A life, written to last.</p><span class="url">www.duvridge.com</span>',
        "toldlife": f'<img src="{image(symbol)}" style="position:absolute;left:70px;top:55px;width:96px;height:96px;border-radius:14px"><span style="position:absolute;left:188px;top:84px;font:30px Georgia,serif">duvridge</span><h1 style="position:absolute;left:70px;top:195px;font:500 136px Georgia,serif;letter-spacing:-.04em;margin:0">ToldLife.</h1><p style="position:absolute;left:76px;top:367px;font-size:38px;margin:0">한 사람의 삶을 담은 이야기</p><p style="position:absolute;right:70px;bottom:45px;color:#AFB7C9;font-size:25px;margin:0">웹소설 · 오디오북</p><span class="url">toldlife.duvridge.com</span>',
    }
    with sync_playwright() as runtime:
        browser = runtime.chromium.launch()
        page = browser.new_page(viewport={"width": 1200, "height": 630}, device_scale_factor=1)
        for name, body in cards.items():
            page.set_content(f'<!doctype html><html lang="ko"><head><meta charset="utf-8">{font}<style>{style}</style></head><body><div class="card">{body}</div></body></html>', wait_until="load")
            page.evaluate("document.fonts.ready")
            page.screenshot(path=str(social / f"{name}.png"))
        for size, name in [(32, "favicon-32.png"), (180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
            page.set_viewport_size({"width": size, "height": size})
            page.set_content(f'<html><body style="margin:0"><img src="{image(symbol)}" width="{size}" height="{size}"></body></html>', wait_until="load")
            page.screenshot(path=str(brand / name))
        browser.close()
    print("Rendered two 1200×630 share cards and four brand icons from the provided logos.")


if __name__ == "__main__":
    main()
