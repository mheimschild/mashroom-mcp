use serde_json::json;

use crate::cli::Cli;

/// Convert CLI arguments into an `(mcp_tool_name, arguments_map)` pair.
///
/// In the universal schema, the tool name is passed directly and all
/// `-d key=value` pairs become the argument map.
pub fn build_tool_call(cli: &Cli) -> (String, serde_json::Map<String, serde_json::Value>) {
    let mut m = serde_json::Map::new();
    for (key, value) in &cli.data {
        m.insert(key.clone(), json!(value));
    }
    (cli.tool_name.clone(), m)
}
