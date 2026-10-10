#!/usr/bin/env python3
"""Build the monorepo's complete ToldLife project into an isolated upload folder."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import urllib.request
from xml.sax.saxutils import escape
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
REGISTRY = json.loads((ROOT / "service-registry.json").read_text(encoding="utf-8"))
PORTAL = ROOT / "apps/toldlife-portal"
BRAND = ROOT / "apps/company-site/assets"
SITE_ORIGIN = "https://toldlife.duvridge.com"
FIREBASE_KEYS = ("VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID")


def service_environment(source, base, github_vars):
    env = os.environ.copy()
    if github_vars:
        result = subprocess.run(
            ["gh", "variable", "list", "--json", "name,value"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        )
        settings = {item["name"]: item["value"] for item in json.loads(result.stdout)}
        missing = [key for key in FIREBASE_KEYS if not settings.get(key)]
        if missing:
            raise ValueError(f"Monorepo: missing Firebase repository variables: {', '.join(missing)}")
        env.update({key: settings[key] for key in FIREBASE_KEYS})
        print(f"{base}: loaded the four public Firebase settings from GitHub repository variables.", flush=True)
    env.update(SITE_BASE=base, SITE_ORIGIN=SITE_ORIGIN, VITE_USE_FIREBASE_EMULATORS="false")
    return env


def check_build(dist, base):
    if not (dist / "index.html").is_file():
        raise ValueError(f"No built home page at {dist}")
    source = (dist / "index.html").read_text(encoding="utf-8")
    expected = f'<link rel="canonical" href="{SITE_ORIGIN}/">'
    if expected not in source:
        raise ValueError(f"{base}: build has the wrong canonical URL; build with SITE_BASE and SITE_ORIGIN.")
    service = next(service for service in REGISTRY["services"] if service["siteBase"] == base and service["deployGroup"] == "toldlife")
    for required in service.get("requiredFiles", []):
        if not (dist / required).is_file():
            raise ValueError(f"{base}: missing {required}; refusing an incomplete project snapshot.")
    for file in dist.rglob("*"):
        if file.is_file() and (file.name.startswith(".env") or file.name in {"package.json", "package-lock.json"}):
            raise ValueError(f"Source/config file cannot be published: {file}")
        if file.is_file() and file.stat().st_size > 25 * 1024 * 1024:
            raise ValueError(f"Asset exceeds Cloudflare Pages' 25 MiB limit: {file}")


PORTAL_TABS = {"audiobooks": "novels"}


def redirect_rules(staged, services):
    rules = {}
    for base, dist in services:
        # The audiobook has no tab of its own; it lives inside the original series.
        tab = PORTAL_TABS.get(base.strip("/"), base.strip("/"))
        for source in (base, base.rstrip("/"), base + "index.html"):
            rules[source] = "/?tab=" + tab
        manifest = dist / "moved-pages.json"
        if not manifest.is_file():
            raise ValueError(f"{base}: missing moved-pages.json")
        moved = json.loads(manifest.read_text(encoding="utf-8"))
        if moved.get("version") != 1 or not isinstance(moved.get("pages"), list):
            raise ValueError("Invalid moved-pages manifest")
        for row in moved["pages"]:
            source, target = row["from"], row["to"]
            if source in rules and rules[source] != target:
                raise ValueError(f"Conflicting redirect: {source}")
            rules[source] = target
    if len(rules) > 2000:
        raise ValueError("Too many static Pages redirects")
    for source, target in rules.items():
        if not source.startswith("/") or not target.startswith("/") or any(char.isspace() for char in source + target) or len(source + target) > 990:
            raise ValueError(f"Unsafe redirect: {source}")
        destination = urlsplit(target).path
        if destination in rules:
            raise ValueError(f"Redirect chain: {source} -> {target}")
        file = staged / destination.lstrip("/")
        exists = (file / "index.html").is_file() if destination.endswith("/") else file.with_suffix(".html").is_file()
        if not exists:
            raise ValueError(f"Redirect target is missing: {source} -> {target}")
    return [{"from": source, "to": target, "status": 301} for source, target in sorted(rules.items())]


def video_manifests(books=ROOT / "content/books"):
    """Each book's published videos: the list, with its book ID, from content/books/<book>/video/media.json."""
    for manifest in sorted(Path(books).glob("*/video/media.json")):
        book = json.loads((manifest.parent.parent / "book.json").read_text(encoding="utf-8"))["id"]
        yield book, json.loads(manifest.read_text(encoding="utf-8"))


def check_video(path, video):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1 << 20), b""):
            digest.update(chunk)
    if path.stat().st_size != video["bytes"] or digest.hexdigest() != video["sha256"]:
        raise ValueError(f"Video differs from its published list: {path.name}")


def add_video_media(staged, source, books=ROOT / "content/books"):
    """Videos are published apart from Git. Copy them from a folder, or fetch them from the release the
    book's video list names, and accept each only when its size and SHA-256 match that list."""
    if not source or source == "none":
        return 0
    added = 0
    for book, manifest in video_manifests(books):
        release = manifest.get("release", {})
        for episode, video in manifest.get("videos", {}).items():
            target = staged / "videos/works" / book / "media" / video["file"]
            target.parent.mkdir(parents=True, exist_ok=True)
            if source == "release":
                url = f"https://github.com/{release['repository']}/releases/download/{release['tag']}/{video['file']}"
                for attempt in range(3):
                    try:
                        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "duvridge-deploy/1.0"}), timeout=120) as response, open(target, "wb") as stream:
                            shutil.copyfileobj(response, stream, 1 << 20)
                        check_video(target, video)
                        break
                    except Exception:
                        if attempt == 2:
                            raise
                        time.sleep(5)
            else:
                folder = Path(source)
                found = next((candidate for candidate in (folder / video["file"], folder / f"{episode}.mp4") if candidate.is_file()), None)
                if not found:
                    raise ValueError(f"Video file missing for {book}/{episode}: {video['file']}")
                shutil.copyfile(found, target)
                check_video(target, video)
            added += 1
    return added


def assemble(output, services, video_media=None):
    expected_bases = {service["siteBase"] for service in REGISTRY["services"]
                      if service["deployGroup"] == "toldlife" and service.get("artifactPath")}
    bases = [base for base, _ in services]
    if set(bases) != expected_bases or len(bases) != len(expected_bases):
        raise ValueError(f"ToldLife requires every service: {sorted(expected_bases)}; received {bases}")
    output = output.resolve()
    if output == ROOT or output in ROOT.parents or any(output == ROOT / folder or ROOT / folder in output.parents
                                                       for folder in ("apps", "packages", "scripts", "tests", ".github")):
        raise ValueError("Choose an isolated deployment directory, such as .deploy/toldlife.")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="toldlife-", dir=output.parent) as temporary:
        staged = Path(temporary)
        audio_dist = next(dist for base, dist in services if base == "/audiobooks/")
        portal = subprocess.check_output(["node", str(ROOT / "scripts/render-toldlife-portal.mjs"), str(audio_dist / "work-index.json")], text=True)
        (staged / "index.html").write_text(portal, encoding="utf-8")
        shutil.copyfile(PORTAL / "404.html", staged / "404.html")
        for folder in ("brand", "social"):
            shutil.copytree(BRAND / folder, staged / folder)
        urls = [SITE_ORIGIN + "/"]
        for base, dist in services:
            check_build(dist, base)
            shutil.copytree(dist, staged / base.strip("/"), ignore=shutil.ignore_patterns(".DS_Store"))
            for page in sorted(dist.rglob("*.html")):
                relative = page.relative_to(dist).as_posix()
                if page.name == "404.html" or 'http-equiv="refresh"' in page.read_text(encoding="utf-8"):
                    continue
                if relative == "index.html":
                    relative = ""
                elif relative.endswith("/index.html"):
                    relative = relative[:-10]
                else:
                    relative = relative.removesuffix(".html")
                urls.append(SITE_ORIGIN + base + relative)
        videos = add_video_media(staged, video_media)
        (staged / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_ORIGIN}/sitemap.xml\n")
        (staged / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "".join(f"  <url><loc>{escape(url)}</loc></url>\n" for url in urls) + "</urlset>\n",
            encoding="utf-8",
        )
        # Pages serves extensionless HTML and directory indexes automatically. A root 404
        # disables its SPA fallback so an unknown route cannot silently become the portal.
        redirects = redirect_rules(staged, services)
        (staged / "_redirects").write_text("".join(f"{row['from']} {row['to']} 301\n" for row in redirects), encoding="utf-8")
        (staged / "redirects.json").write_text(json.dumps(redirects, indent=2) + "\n", encoding="utf-8")
        (staged / "_headers").write_text(
            "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n",
            encoding="utf-8",
        )
        revision = os.environ.get("GITHUB_SHA") or subprocess.check_output(
            ["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
        (staged / "deployment.json").write_text(json.dumps({
            "schemaVersion": 1, "group": "toldlife", "sourceRevision": revision,
            "sourceDirty": bool(subprocess.check_output(["git", "-C", str(ROOT), "status", "--porcelain"], text=True).strip()),
            "services": [{"base": base, "files": sum(file.is_file() for file in dist.rglob("*"))}
                         for base, dist in services],
            "videos": videos,
        }, indent=2) + "\n", encoding="utf-8")
        files = [file for file in staged.rglob("*") if file.is_file()]
        if len(files) > 20000:
            raise ValueError(f"Upload contains {len(files)} files, above the Pages free-plan limit.")
        oversized = [file for file in files if file.stat().st_size > 25 * 1024 * 1024]
        if oversized:
            raise ValueError(f"Asset exceeds Cloudflare Pages' 25 MiB limit: {oversized[0]}")
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(staged, output)
    count = sum(file.is_file() for file in output.rglob("*"))
    print(f"Prepared {count} files in {output}; {len(urls)} sitemap URLs.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--novels-source", type=Path, default=ROOT / "apps/toldlife-novels")
    parser.add_argument("--audiobooks-source", type=Path, default=ROOT / "apps/toldlife-audiobooks")
    parser.add_argument("--videos-source", type=Path, default=ROOT / "apps/toldlife-videos")
    parser.add_argument("--github-vars", action="store_true", help="Load public Firebase settings from the monorepo's GitHub variables.")
    parser.add_argument("--skip-build", action="store_true", help="Assemble already-built and checked service outputs.")
    parser.add_argument("--output", type=Path, default=ROOT / REGISTRY["deployGroups"]["toldlife"]["output"])
    parser.add_argument("--video-media", default="none", help="Where the published videos come from: none, release, or a folder holding them.")
    args = parser.parse_args()
    services = []
    for service in REGISTRY["services"]:
        if service["deployGroup"] != "toldlife" or not service.get("artifactPath"):
            continue
        base = service["siteBase"]
        source = ({"toldlife-novels": args.novels_source, "toldlife-audiobooks": args.audiobooks_source, "toldlife-videos": args.videos_source}
                  .get(service["id"], ROOT / service["path"]))
        source = source.resolve()
        if not args.skip_build:
            env = service_environment(source, base, args.github_vars)
            for check in service["checks"]:
                command = ["npm", "run", check]
                subprocess.run(command, cwd=source, env=env, check=True)
        default_source = (ROOT / service["path"]).resolve()
        dist = (ROOT / service["artifactPath"] if source == default_source
                else source / Path(service["artifactPath"]).relative_to(service["path"]))
        services.append((base, dist))
    assemble(args.output, services, args.video_media)


if __name__ == "__main__":
    main()
