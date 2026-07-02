#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT_DIR/src/native/pasteboard-monitor.swift"
OUT_DIR="$ROOT_DIR/src/native/bin"
OUT="$OUT_DIR/pasteboard-monitor"
ARCH="$(uname -m)"

if [[ "$(uname)" != "Darwin" ]]; then
  exit 0
fi

mkdir -p "$OUT_DIR"
swiftc -target "${ARCH}-apple-macosx11.0" "$SRC" -framework AppKit -o "$OUT"
