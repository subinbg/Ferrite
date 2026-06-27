# Ferrite

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
[![Rust](https://img.shields.io/badge/Rust-2024-informational?logo=rust&logoColor=white&style=flat)](https://www.rust-lang.org/)
[![Electron](https://img.shields.io/badge/Electron-React-informational?logo=electron&logoColor=white&style=flat)](https://www.electronjs.org/)
[![Databases](https://img.shields.io/badge/Databases-PostgreSQL%20%C2%B7%20SQLite-informational?logo=postgresql&logoColor=white&style=flat)](#)

Ferrite is a simple database studio: a desktop app (Electron + React) backed by a Rust sidecar, with a built-in read-only MCP server so AI agents can explore databases safely. All data stays on the local machine.

## Features

- **Connections**: manage database connections; credentials are encrypted at rest behind a master-password vault.
- **Query editor**: schema-aware autocomplete, `:name` bind variables, and `EXPLAIN`.
- **Results & export**: paginated result grid with one-click JSON export.
- **History & saved queries**: every run is logged; save queries as named, versioned snapshots with full-text search.
- **AI access (MCP)**: a read-only Model Context Protocol server exposes schema introspection and queries to agents.

## Architecture

An Electron + React renderer is the UI; a Rust sidecar (`ferrite-server`, an `axum` HTTP API bound to `127.0.0.1`) holds the core logic. All local state lives in a single SQLite file.

| Crate | Responsibility |
| --- | --- |
| `ferrite-server` | HTTP API, token auth, app wiring, JSON export |
| `ferrite-db` | driver abstraction, query execution, schema introspection, read-only SQL validation |
| `ferrite-store` | local SQLite store — connections, history, saved queries, activity log |
| `ferrite-crypto` | master-password vault (Argon2 + AES-GCM) |
| `ferrite-mcp` | read-only MCP server |

## Getting started

Requires a Rust toolchain (2024 edition) and Node.js + npm.

```sh
make dev       # build the debug sidecar and launch the Electron app
make build     # build the renderer and stage the release sidecar
make package   # produce a desktop package (electron-builder)
make verify    # typecheck the app and check/test the Rust crates
```

`make package` writes the desktop build to `app/dist/`: a `.zip` on macOS, a portable `.exe` on Windows, and an `AppImage` on Linux. On macOS, unzip the archive to reveal `Ferrite.app`, then run it. The Windows `.exe` and Linux `AppImage` run directly.

On first launch, create or open a database file and set a master password to unlock the vault. On later launches, the last-opened file is loaded; use the **File** menu to switch databases.

## AI access (MCP)

The MCP server is enabled by default and listens on `http://127.0.0.1:26260/mcp`; the port is set by `MCP_PORT` in the `Makefile`. Toggle the server from the **File** menu. It exposes `list_connections`, `list_tables`, `list_columns`, `execute_readonly_query`, and `explain_query`. The vault must be unlocked and a database connected.

Point an MCP client at the bundled config. For Claude Code:

```sh
claude --mcp-config ./ferrite-mcp.json
```

## Security

- The sidecar binds to `127.0.0.1` only; every request carries a per-session bearer token.
- Connection passwords are encrypted with AES-GCM under an Argon2-derived key; the vault unlocks per session and is never persisted.
- MCP is strictly read-only: only single `SELECT`/`WITH`/`EXPLAIN` statements pass validation. Mutations, multiple statements, data-modifying CTEs, row-locking clauses, and dangerous functions are blocked.
