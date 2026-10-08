#!/usr/bin/env python3
"""Verify the deployed project marker, each service route, assets, and audio range."""
import argparse
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import time
import urllib.request
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]


class Resources(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.urls = []
        self.feed(source)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        path = attrs.get("src") if tag in {"img", "script"} else attrs.get("href") if tag == "link" and attrs.get("rel") in {"stylesheet", "icon"} else None
        if path and not urlparse(path).scheme and not path.startswith("//"):
            self.urls.append(path)


def check(group_id, origin=None, revision=None):
    registry = json.loads((ROOT / "services.json").read_text())
    group = registry["deployGroups"][group_id]
    origin = (origin or group["origin"]).rstrip("/")
    headers = {"User-Agent": "duvridge-deployment-check/1.0", "Cache-Control": "no-cache"}

    def fetch(path, extra=None, limit=None):
        req = urllib.request.Request(urljoin(origin + "/", path), headers={**headers, **(extra or {})})
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status not in (200, 206):
                raise ValueError(f"{path}: HTTP {response.status}")
            return response.read(limit), response.headers

    marker, _ = fetch("/deployment.json" + (f"?revision={revision}" if revision else ""))
    deployed = json.loads(marker)
    if revision and deployed["sourceRevision"] != revision:
        raise ValueError(f"Wrong deployed source revision: {deployed['sourceRevision']}")
    if deployed.get("group") != group_id:
        raise ValueError("The project marker identifies a different deployment group.")
    for path in group["smokePaths"]:
        body, response_headers = fetch(path)
        if "text/html" not in response_headers.get("Content-Type", ""):
            raise ValueError(f"{path}: expected HTML")
        source = body.decode("utf-8")
        if "<html" not in source:
            raise ValueError(f"{path}: missing complete HTML")
        if not path.startswith("/guidebook/") and '<link rel="canonical"' not in source:
            raise ValueError(f"{path}: missing canonical metadata")
        for resource in list(dict.fromkeys(Resources(source).urls))[:4]:
            asset, _ = fetch(urljoin(path, resource), limit=2048)
            if not asset:
                raise ValueError(f"Empty resource: {resource}")
        print(f"OK {origin}{path}")
    for path in group.get("audioPaths", []):
        body, response_headers = fetch(path, {"Range": "bytes=0-1023"}, limit=1024)
        if not body or "text/html" in response_headers.get("Content-Type", ""):
            raise ValueError(f"{path}: missing audio data")
        print(f"OK audio {origin}{path}")
    return deployed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--group", required=True)
    parser.add_argument("--origin")
    parser.add_argument("--revision", default=os.environ.get("GITHUB_SHA"))
    args = parser.parse_args()
    for attempt in range(4):
        try:
            check(args.group, args.origin, args.revision)
            return
        except Exception:
            if attempt == 3:
                raise
            time.sleep(5)


if __name__ == "__main__":
    main()
