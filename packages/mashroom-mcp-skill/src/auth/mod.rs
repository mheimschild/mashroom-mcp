mod cookie;
mod login;

use std::collections::HashMap;

use http::{HeaderName, HeaderValue};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;

/// Derive the login endpoint from the MCP URL.
/// e.g. `http://localhost:5051/mcp` → `http://localhost:5051/login`
pub(crate) fn build_login_url(mcp_url: &str) -> String {
    mcp_url
        .strip_suffix("/mcp")
        .map(|base| format!("{}/login", base.trim_end_matches('/')))
        .unwrap_or_else(|| {
            // fallback: just append /login if URL doesn't end with /mcp
            format!("{}/login", mcp_url.trim_end_matches('/'))
        })
}

/// Apply the chosen auth method to a transport config.
///
/// Priority: bearer token → login-form cookie → no auth.
pub async fn apply_auth(
    config: StreamableHttpClientTransportConfig,
    auth_token: Option<&str>,
    username: Option<&str>,
    password: Option<&str>,
) -> Result<StreamableHttpClientTransportConfig, AuthError> {
    if let Some(token) = auth_token {
        tracing::info!(auth_method = "bearer_token" , "applying bearer token authentication");
        return Ok(config.auth_header(token.to_string()));
    }

    if let (Some(user), Some(pass)) = (username, password) {
        tracing::info!(?user, auth_method = "login_form", "applying login-form authentication");
        print!("Logging in... ");
        std::io::Write::flush(&mut std::io::stdout()).ok();

        let http = reqwest::Client::new();
        let mcp_url = config.uri.to_string();
        let cookie = login::login(&http, &mcp_url, user, pass).await?;

        tracing::debug!(cookie_count = cookie.matches(';').count() + 1, "session cookies obtained");
        println!("OK");

        let mut headers = HashMap::new();
        headers.insert(
            HeaderName::from_static("cookie"),
            HeaderValue::from_str(&cookie).map_err(|e| AuthError::Header(e.to_string()))?,
        );
        return Ok(config.custom_headers(headers));
    }

    tracing::info!("no authentication credentials provided — connecting anonymously");
    Ok(config)
}

/// Errors produced during authentication.
#[derive(Debug)]
pub enum AuthError {
    /// The login form returned a non-success status.
    LoginFailed(String),
    /// No session cookie was returned after a successful login.
    NoSessionCookie,
    /// Invalid header value.
    Header(String),
    /// General I/O or HTTP error.
    Http(reqwest::Error),
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::LoginFailed(msg) => write!(f, "login failed: {msg}"),
            AuthError::NoSessionCookie => write!(f, "login succeeded but no session cookie was returned"),
            AuthError::Header(msg) => write!(f, "header error: {msg}"),
            AuthError::Http(e) => write!(f, "http error: {e}"),
        }
    }
}

impl std::error::Error for AuthError {}

impl From<reqwest::Error> for AuthError {
    fn from(err: reqwest::Error) -> Self {
        AuthError::Http(err)
    }
}

