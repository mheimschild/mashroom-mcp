# mashroom-mcp-skill

Standalone Rust CLI client for the MCP protocol. Connects to the Mashroom MCP server and invokes tools from the command line.

## Purpose

Provides a terminal-based way to interact with MCP tools without requiring a browser, LLM agent, or web UI. Useful for scripting, CI/CD pipelines, and quick debugging.

## Files

| File | Purpose |
|------|---------|
| `Cargo.toml` | Project manifest. Dependencies: clap (CLI), rmcp (MCP client), serde (JSON), tokio (async runtime) |
| `src/main.rs` | Entry point. CLI argument parsing, MCP client initialization |
| `src/cli/` | CLI subcommand definitions |
| `src/client/mod.rs` | MCP client wrapper over the `rmcp` library |

## Dependencies

- **rmcp** 1.7 — Rust MCP SDK with Streamable HTTP transport support (via reqwest)
- **clap** 4 — Derive-based CLI argument parsing
- **tokio** 1 — Async runtime

## Build & Run

```bash
cargo build      # Compile
cargo run -- --help   # Show CLI help
cargo run -- call <tool-name> '{"arg": "value"}'   # Call a tool
```

The client connects to `http://localhost:5051/mcp` by default. Authentication and session management follow the MCP Streamable HTTP protocol (POST to initialize, then include `Mcp-Session-Id` header).
