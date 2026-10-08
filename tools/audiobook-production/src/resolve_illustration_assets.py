"""Resolve approved scene artwork from the same public manifest used by the reader."""
import json
from pathlib import Path
from urllib.parse import urlparse


def resolve_illustration_asset(content_root, image_id):
    """No active scene uses a neutral frame; master basenames are not stable IDs."""
    if not image_id:
        return None
    root = Path(content_root).resolve()
    public = (root / "site/public").resolve()
    if image_id == "cover":
        asset = public / "images/bae-byunghee-hero-watercolor.png"
    else:
        manifest = json.loads((root / "content/episode-illustrations.json").read_text(encoding="utf-8"))
        matches = [image for image in manifest["images"] if image["id"] == image_id]
        if len(matches) != 1:
            raise ValueError(f"삽화 ID가 없거나 중복되었습니다: {image_id}")
        sources = matches[0].get("sources", [])
        if not sources:
            raise ValueError(f"승인된 JPEG 삽화가 없습니다: {image_id}")
        source = max(sources, key=lambda item: item["width"])
        url = urlparse(source["src"])
        if url.scheme or url.netloc or url.query or url.fragment or not url.path.startswith("/images/episodes/") or not url.path.lower().endswith((".jpg", ".jpeg")):
            raise ValueError(f"안전한 공개 JPEG 삽화 경로를 지정하세요: {image_id}")
        asset = (public / url.path.lstrip("/")).resolve()
    if not asset.is_relative_to(public) or not asset.is_file():
        raise ValueError(f"승인된 공개 삽화 파일이 없습니다: {image_id}")
    return asset
