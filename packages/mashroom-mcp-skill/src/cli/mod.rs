use clap::Parser;

// Sub-modules kept as placeholders for future category-specific logic if needed.
mod app_instance;
mod page;
mod plugin;
mod site;

// ── Universal CLI ──────────────────────────────────────────────────────
// Schema: mashroom-mcp-skill <tool_name> [-d key=value ...]
//
// - tool_name: the MCP tool name (e.g. "update_site", "get_page")
// - -d / --data: key=value pairs passed as tool arguments (repeatable)
//
// SKILL.md documents all available tools and their parameter schemas.

#[derive(Parser)]
#[command(name = "mcp-skill", about = "Universal CLI client for the Mashroom MCP server")]
pub struct Cli {
    /// Base URL of the MCP server endpoint (default: http://localhost:5051/mcp)
    #[arg(global = true, short, long, default_value = "http://localhost:5051/mcp")]
    pub url: String,

    /// Bearer token for authentication (or set MCP_AUTH_TOKEN env var)
    #[arg(global = true, short = 't', long, env = "MCP_AUTH_TOKEN")]
    pub auth_token: Option<String>,

    /// Username for login-form authentication (or set MCP_USERNAME env var)
    #[arg(global = true, long, env = "MCP_USERNAME")]
    pub username: Option<String>,

    /// Password for login-form authentication (or set MCP_PASSWORD env var)
    #[arg(global = true, long, env = "MCP_PASSWORD")]
    pub password: Option<String>,

    /// MCP tool name to call (e.g. "update_site", "get_page", "list_plugins")
    #[arg(required = true)]
    pub tool_name: String,

    /// Data parameter as key=value (repeatable). Passed directly to the MCP tool.
    /// Example: -d siteId=my-site -d title="My Site"
    #[arg(short = 'd', long = "data", value_parser = parse_key_value)]
    pub data: Vec<(String, String)>,
}

/// Parse a `key=value` argument into a tuple.
fn parse_key_value(s: &str) -> Result<(String, String), String> {
    let pos = s
        .find('=')
        .ok_or_else(|| format!("invalid DATA argument: {s} (expected key=value)"))?;
    Ok((s[..pos].to_string(), s[pos + 1..].to_string()))
}
