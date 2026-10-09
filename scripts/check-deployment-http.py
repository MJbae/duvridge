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
    registry = json.loads((ROOT / "service-registry.json").read_text())
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
    if group_id == "toldlife":
        # Every published video answers a range request with its listed size, as Safari needs to play it.
        for manifest in sorted((ROOT / "content/books").glob("*/video/media.json")):
            book = json.loads((manifest.parent.parent / "book.json").read_text())["id"]
            videos = json.loads(manifest.read_text())["videos"]
            for video in videos.values():
                path = f"/videos/works/{book}/media/{video['file']}"
                _, response_headers = fetch(path, {"Range": "bytes=0-1"}, limit=2)
                if response_headers.get("Content-Range") != f"bytes 0-1/{video['bytes']}":
                    raise ValueError(f"{path}: expected a ranged video of {video['bytes']} bytes")
            print(f"OK {len(videos)} ranged videos for {book}")
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(NoRedirect)
        manifest, _ = fetch("/redirects.json")
        redirects = json.loads(manifest)
        for row in redirects:
            req = urllib.request.Request(urljoin(origin + "/", row["from"]), headers=headers)
            try:
                opener.open(req, timeout=30)
                raise ValueError(f"{row['from']}: expected one 301")
            except urllib.error.HTTPError as response:
                expected = urljoin(origin + "/", row["to"])
                actual = urljoin(origin + "/", response.headers.get("Location", ""))
                if response.code != 301 or actual != expected:
                    raise ValueError(f"{row['from']}: HTTP {response.code}, Location {actual}; expected {expected}")
            destination = urllib.request.Request(urljoin(origin + "/", row["to"]), headers=headers)
            with opener.open(destination, timeout=30) as response:
                if response.status != 200:
                    raise ValueError(f"{row['to']}: expected 200 without another redirect")
        print(f"OK {len(redirects)} one-hop permanent redirects")
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
