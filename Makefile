# Ferrite repository tasks.
#
# Command examples:
#   make verify    # typecheck the Electron app, build renderer, and check/test Rust crates
#   make dev       # build the debug sidecar and start the Electron app
#   make build     # build renderer and release sidecar, then stage it for packaging
#   make package   # create a standalone desktop package with Electron Builder
#   make clean     # remove generated desktop/package artifacts
#
# Configuration examples:
#   make dev MCP_PORT=26260    # MCP URL: http://127.0.0.1:26260/mcp
#
# Output locations:
#   app/out/          Electron/Vite production output
#   app/build/bin/    release sidecar staged for Electron packaging
#   app/dist/         Electron Builder packages and installers
#   target/debug/     Rust debug binaries used by make dev
#   target/release/   Rust release binaries used by make build/package

.DEFAULT_GOAL := help

APP_DIR := app
DEV_DATA_DIR := .ferrite-data
DEV_DB_FILE := $(abspath $(DEV_DATA_DIR))/ferrite.db
APP_BIN_DIR := $(APP_DIR)/build/bin
MCP_PORT ?= 26260

ifeq ($(OS),Windows_NT)
EXE_EXT := .exe
DEV_ENV := set "FERRITE_DB_FILE=$(DEV_DB_FILE)"&& set "FERRITE_MCP_PORT=$(MCP_PORT)"&&
BUILD_ENV := set "FERRITE_MCP_PORT=$(MCP_PORT)"&&
define STAGE_SIDECAR
	powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath '$(APP_BIN_DIR)' -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory -Path '$(APP_BIN_DIR)' -Force | Out-Null; Copy-Item -LiteralPath '$(RELEASE_SIDECAR)' -Destination '$(PACKAGED_SIDECAR)' -Force"
endef
define ENSURE_DEV_DATA_DIR
	powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -ItemType Directory -Path '$(DEV_DATA_DIR)' -Force | Out-Null"
endef
define CLEAN_GENERATED
	powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item -LiteralPath '$(APP_DIR)/out','$(APP_BIN_DIR)','$(APP_DIR)/dist','$(DEV_DATA_DIR)' -Recurse -Force -ErrorAction SilentlyContinue"
endef
else
EXE_EXT :=
DEV_ENV := FERRITE_DB_FILE="$(DEV_DB_FILE)" FERRITE_MCP_PORT="$(MCP_PORT)"
BUILD_ENV := FERRITE_MCP_PORT="$(MCP_PORT)"
define STAGE_SIDECAR
	rm -rf "$(APP_BIN_DIR)"
	mkdir -p "$(APP_BIN_DIR)"
	cp "$(RELEASE_SIDECAR)" "$(PACKAGED_SIDECAR)"
endef
define ENSURE_DEV_DATA_DIR
	mkdir -p "$(DEV_DATA_DIR)"
endef
define CLEAN_GENERATED
	rm -rf "$(APP_DIR)/out" "$(APP_BIN_DIR)" "$(APP_DIR)/dist" "$(DEV_DATA_DIR)"
endef
endif

DEBUG_SIDECAR := target/debug/ferrite$(EXE_EXT)
RELEASE_SIDECAR := target/release/ferrite$(EXE_EXT)
PACKAGED_SIDECAR := $(APP_BIN_DIR)/ferrite$(EXE_EXT)

.PHONY: help verify verify-app verify-crates dev build build-app build-sidecar stage-sidecar package clean

help:
	@echo "Ferrite tasks:"
	@echo "  make verify   - typecheck app, build renderer, and check/test Rust crates"
	@echo "  make dev      - build debug sidecar and start Electron"
	@echo "  make build    - build renderer and stage release sidecar in app/build/bin"
	@echo "  make package  - write desktop package output to app/dist"
	@echo "  make clean    - remove app/out, app/build/bin, app/dist, and .ferrite-data"
	@echo "  MCP_PORT=$(MCP_PORT) -> http://127.0.0.1:$(MCP_PORT)/mcp during make dev"

verify: verify-app verify-crates

verify-app:
	cd "$(APP_DIR)" && npm run verify
	cd "$(APP_DIR)" && $(BUILD_ENV) npm run build

verify-crates:
	cargo fmt --all --check
	cargo check --workspace
	cargo test --workspace

dev:
	cargo build -p ferrite-server
	$(ENSURE_DEV_DATA_DIR)
	cd "$(APP_DIR)" && $(DEV_ENV) npm run dev

build: build-app build-sidecar stage-sidecar

build-app:
	cd "$(APP_DIR)" && $(BUILD_ENV) npm run build

build-sidecar:
	cargo build --release -p ferrite-server

stage-sidecar:
	$(STAGE_SIDECAR)

package: build
	cd "$(APP_DIR)" && npm run package

clean:
	$(CLEAN_GENERATED)
