#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Step 1: Build Rust binary (release) ==="
cargo build --release -p ferrite-server

echo ""
echo "=== Step 2: Build Electron frontend ==="
cd app
npm ci --prefer-offline 2>/dev/null || npm install
npx electron-vite build

echo ""
echo "=== Build complete ==="
echo "Rust binary: target/release/ferrite"
echo "Frontend:    app/out/renderer/"
echo ""
echo "To run standalone: ./target/release/ferrite --standalone"
echo "To package Electron: cd app && npx electron-builder"
