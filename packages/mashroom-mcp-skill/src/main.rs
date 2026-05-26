mod auth;
mod cli;
mod client;
mod tool_call;

use clap::Parser;
use rmcp::{
    ServiceExt,
    model::{CallToolRequestParams, ClientCapabilities, ClientInfo, Implementation},
    transport::{
        StreamableHttpClientTransport,
        streamable_http_client::StreamableHttpClientTransportConfig,
    },
};

use cli::Cli;
use tool_call::build_tool_call;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing subscriber (default: INFO, override with RUST_LOG)
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .without_time()
        .init();

    let cli = Cli::parse();

    // Build transport config with the chosen auth method.
    // Priority: --auth-token (Bearer) > --username/--password (login form)
    let config = StreamableHttpClientTransportConfig::with_uri(cli.url.as_str());
    let config = auth::apply_auth(
        config,
        cli.auth_token.as_deref(),
        cli.username.as_deref(),
        cli.password.as_deref(),
    ).await?;

    let transport = StreamableHttpClientTransport::from_config(config);

    // Client identity for the initialize handshake
    let client_info = ClientInfo::new(
        ClientCapabilities::default(),
        Implementation::new("mcp-skill", "0.1.0"),
    );

    // Connect and initialize the MCP session
    print!("Initializing MCP session... ");
    std::io::Write::flush(&mut std::io::stdout()).ok();
    let client = client_info.serve(transport).await?;
    println!("OK");

    // Special built-in command: list-tools
    if cli.tool_name == "list-tools" {
        print!("Listing available tools... ");
        std::io::Write::flush(&mut std::io::stdout()).ok();
        let tools = client.peer().list_all_tools().await?;
        println!("OK");

        if tools.is_empty() {
            println!("No tools available.");
        } else {
            println!("Available tools ({}):\n", tools.len());
            for tool in &tools {
                println!("  {}", tool.name);
                if let Some(ref desc) = tool.description {
                    println!("    {}", desc);
                }
                // Print input schema if available
                let schema = tool.input_schema.as_ref();
                if let Some(props) = schema.get("properties")
                    && let Some(obj) = props.as_object()
                {
                    if obj.is_empty() {
                        println!("    (no parameters)");
                    } else {
                        for (key, val) in obj {
                            let required = schema
                                .get("required")
                                .and_then(|r| r.as_array())
                                .map(|arr| arr.iter().any(|v| v.as_str() == Some(key)))
                                .unwrap_or(false);
                            let req_str = if required { " (required)" } else { "" };
                            let typ = val.get("type").and_then(|t| t.as_str()).unwrap_or("any");
                            let desc = val.get("description").and_then(|d| d.as_str()).unwrap_or("");
                            println!("    - {}{}: {} — {}", key, req_str, typ, desc);
                        }
                    }
                }
                println!();
            }
        }
    } else {
        // Build tool call from universal CLI args
        let (tool_name, arguments) = build_tool_call(&cli);

        // Call the tool via the rmcp client
        print!("Calling tool \"{}\"... ", tool_name);
        std::io::Write::flush(&mut std::io::stdout()).ok();
        let result = client
            .call_tool(
                CallToolRequestParams::new(tool_name.clone())
                    .with_arguments(arguments),
            )
            .await?;
        println!("OK");

        // Extract and print the text output
        println!("{}", client::extract_tool_text(&result));
    }

    // Clean up the session
    client.cancel().await?;

    Ok(())
}
