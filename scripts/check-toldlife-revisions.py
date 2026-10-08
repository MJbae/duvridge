#!/usr/bin/env python3
"""Tell CI whether all three checked-out projects still match their main branches."""

import argparse
import os
from pathlib import Path
import subprocess


def git(directory, *arguments):
    return subprocess.check_output(["git", "-C", str(directory), *arguments], text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--portal", type=Path, required=True)
    parser.add_argument("--novels", type=Path, required=True)
    parser.add_argument("--audiobooks", type=Path, required=True)
    args = parser.parse_args()
    current = True
    for name, directory in [("portal", args.portal), ("novels", args.novels), ("audiobooks", args.audiobooks)]:
        built = git(directory, "rev-parse", "HEAD")
        latest = git(directory, "ls-remote", "origin", "refs/heads/main").split()[0]
        matches = built == latest
        current = current and matches
        print(f"{name}: built {built[:12]}, main {latest[:12]}, {'current' if matches else 'superseded'}")
    result = "true" if current else "false"
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write(f"current={result}\n")
    print(f"All source revisions current: {result}")


if __name__ == "__main__":
    main()
