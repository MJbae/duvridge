#!/usr/bin/env python3
"""Build both ToldLife services into one isolated Cloudflare Pages upload folder."""

import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
SITE_ORIGIN = "https://toldlife.duvridge.com"
FIREBASE_KEYS = ("VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_PROJECT_ID", "VITE_FIREBASE_APP_ID")


def service_environment(source, base, github_vars):
    env = os.environ.copy()
    if github_vars:
        result = subprocess.run(
            ["gh", "variable", "list", "--json", "name,value"],
            cwd=source, capture_output=True, text=True, check=True,
        )
        settings = {item["name"]: item["value"] for item in json.loads(result.stdout)}
        missing = [key for key in FIREBASE_KEYS if not settings.get(key)]
        if missing:
            raise ValueError(f"{source}: missing Firebase repository variables: {', '.join(missing)}")
        env.update({key: settings[key] for key in FIREBASE_KEYS})
        print(f"{base}: loaded the four public Firebase settings from GitHub repository variables.", flush=True)
    env.update(SITE_BASE=base, SITE_ORIGIN=SITE_ORIGIN, VITE_USE_FIREBASE_EMULATORS="false")
    return env


def check_build(dist, base):
    if not (dist / "index.html").is_file():
        raise ValueError(f"No built home page at {dist}")
    source = (dist / "index.html").read_text(encoding="utf-8")
    expected = f'<link rel="canonical" href="{SITE_ORIGIN}{base}">'
    if expected not in source:
        raise ValueError(f"{base}: build has the wrong canonical URL; build with SITE_BASE and SITE_ORIGIN.")
    for file in dist.rglob("*"):
        if file.is_file() and file.stat().st_size > 25 * 1024 * 1024:
            raise ValueError(f"Asset exceeds Cloudflare Pages' 25 MiB limit: {file}")


def assemble(output, services):
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="toldlife-", dir=output.parent) as temporary:
        staged = Path(temporary)
        shutil.copyfile(ROOT / "toldlife/index.html", staged / "index.html")
        shutil.copyfile(ROOT / "toldlife/404.html", staged / "404.html")
        for folder in ("brand", "social"):
            shutil.copytree(ROOT / "assets" / folder, staged / folder)
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
        (staged / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE_ORIGIN}/sitemap.xml\n")
        (staged / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + "".join(f"  <url><loc>{escape(url)}</loc></url>\n" for url in urls) + "</urlset>\n",
            encoding="utf-8",
        )
        # Pages serves extensionless HTML and directory indexes automatically. A root 404
        # disables its SPA fallback so an unknown route cannot silently become the portal.
        (staged / "_redirects").write_text("/novels /novels/ 301\n/audiobooks /audiobooks/ 301\n")
        (staged / "_headers").write_text(
            "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n",
            encoding="utf-8",
        )
        if output.exists():
            shutil.rmtree(output)
        shutil.copytree(staged, output)
    count = sum(file.is_file() for file in output.rglob("*"))
    if count > 20000:
        raise ValueError(f"Upload contains {count} files, above the Pages free-plan limit.")
    print(f"Prepared {count} files in {output}; {len(urls)} sitemap URLs.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--novels-source", type=Path, default=Path.home() / "orca/projects/autobio-bae")
    parser.add_argument("--audiobooks-source", type=Path, default=Path.home() / "orca/projects/autobio-audiobook/web")
    parser.add_argument("--github-vars", action="store_true", help="Reuse each repository's public Firebase build settings.")
    parser.add_argument("--skip-build", action="store_true", help="Assemble already-built and checked service outputs.")
    args = parser.parse_args()
    services = []
    for base, source in [("/novels/", args.novels_source), ("/audiobooks/", args.audiobooks_source)]:
        source = source.resolve()
        if not args.skip_build:
            env = service_environment(source, base, args.github_vars)
            for command in [["npm", "test"], ["npm", "run", "build"], ["npm", "run", "test:sharing"], ["npm", "run", "typecheck"]]:
                subprocess.run(command, cwd=source, env=env, check=True)
        services.append((base, source / "site/.vitepress/dist"))
    assemble(ROOT / ".deploy/toldlife", services)


if __name__ == "__main__":
    main()
