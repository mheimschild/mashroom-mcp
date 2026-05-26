use rmcp::model::CallToolResult;

/// Extract human-readable text from a ``CallToolResult``.
pub fn extract_tool_text(result: &CallToolResult) -> String {
    let texts: Vec<String> = result
        .content
        .iter()
        .filter_map(|item| item.as_text().map(|t| t.text.clone()))
        .collect();

    if !texts.is_empty() {
        return texts.join("\n");
    }

    // Fallback: serialize the whole result
    serde_json::to_string_pretty(result).unwrap_or_else(|_| "(no output)".into())
}
