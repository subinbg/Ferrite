#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Store dev data inside the repo (gitignored)
export FERRITE_DATA_DIR="$REPO_ROOT/.ferrite-data"
mkdir -p "$FERRITE_DATA_DIR"

# Build the Rust sidecar in debug mode
echo "Building Rust sidecar..."
cargo build -p ferrite-server

# Start the Electron dev server
echo "Starting Electron dev server..."
echo "Data dir: $FERRITE_DATA_DIR"
cd "$REPO_ROOT/app" && npm run dev
