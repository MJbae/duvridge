#!/usr/bin/env python3
"""Fail closed on remote errors and report whether the immutable CI SHA is current."""
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
built = os.environ.get("GITHUB_SHA") or subprocess.check_output(
    ["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
remote = subprocess.check_output(
    ["git", "-C", str(ROOT), "ls-remote", "origin", "refs/heads/main"], text=True).strip()
if not remote:
    raise RuntimeError("Cannot determine the current production source revision.")
latest = remote.split()[0]
current = "true" if built == latest else "false"
print(f"Built {built[:12]}, main {latest[:12]}: current={current}")
if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"current={current}\n")
