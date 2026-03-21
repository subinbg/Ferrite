#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "Building Rust binary (release)..."
cargo build --release -p ferrite-server

BINARY="target/release/ferrite"
if [ ! -f "$BINARY" ]; then
  echo "ERROR: Binary not found at $BINARY"
  exit 1
fi

echo "Binary: $BINARY ($(du -h "$BINARY" | cut -f1))"
echo "Done."
