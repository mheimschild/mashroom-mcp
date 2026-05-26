use super::cookie::{collect_cookies, cookie_header, extract_csrf_token, merge_cookies};
use super::build_login_url;
use super::AuthError;

/// Login to the Mashroom server via its `/login` form and return the session
/// cookie string (suitable for a `Cookie` header).
pub async fn login(
    http: &reqwest::Client,
    base_url: &str,
    username: &str,
    password: &str,
) -> Result<String, AuthError> {
    let login_url = build_login_url(base_url);
    tracing::debug!(%login_url, "resolving login endpoint");

    // 1. GET /login — obtain CSRF token and initial session cookie
    tracing::debug!("sending GET to login page");
    let get_res = http.get(&login_url).send().await?;
    let get_status = get_res.status();
    tracing::debug!(%get_status, "GET /login response received");

    if !get_status.is_success() {
        return Err(AuthError::LoginFailed(format!(
            "GET /login returned {get_status}",
        )));
    }

    let mut jar = collect_cookies(get_res.headers().iter());
    tracing::debug!(cookie_count = jar.len(), "cookies from GET /login");
    for c in &jar {
        let key = c.split('=').next().unwrap_or(c);
        tracing::trace!(%key, "  cookie");
    }

    // Extract CSRF token from the HTML body
    let body = get_res.text().await?;
    let csrf_token = extract_csrf_token(&body);
    match &csrf_token {
        Some(token) => tracing::debug!(token_len = token.len(), "CSRF token extracted"),
        None => tracing::warn!("no CSRF token found in login page — POST may be rejected if the server requires it"),
    }

    // 2. POST /login with credentials (+ csrfToken in query if present)
    let mut post_url = login_url.clone();
    if let Some(csrf) = &csrf_token {
        post_url.push_str(&format!("?csrfToken={csrf}"));
    }
    tracing::debug!(%post_url, "sending POST to login endpoint");

    let headers = cookie_header(&jar);

    let mut builder = http.post(&post_url).form(&[
        ("_username", username),
        ("_password", password),
    ]);
    if !headers.is_empty() {
        builder = builder.header("Cookie", &headers);
    }

    let post_res = builder.send().await?;
    let status = post_res.status();
    tracing::debug!(%status, "POST /login response received");

    // Merge cookies from POST response into the jar
    let new_cookies = collect_cookies(post_res.headers().iter());
    if !new_cookies.is_empty() {
        tracing::debug!(cookie_count = new_cookies.len(), "cookies from POST /login");
        for c in &new_cookies {
            let key = c.split('=').next().unwrap_or(c);
            tracing::trace!(%key, "  cookie");
        }
    }
    merge_cookies(&mut jar, &new_cookies);

    if status.is_success() || status.as_u16() == 302 {
        let final_cookie = cookie_header(&jar);
        if final_cookie.is_empty() {
            tracing::error!("login succeeded but no session cookie was returned");
            return Err(AuthError::NoSessionCookie);
        }
        tracing::debug!(final_cookie_count = jar.len(), "login successful — session established");
        Ok(final_cookie)
    } else {
        let msg = format!("POST /login returned {status}");
        tracing::error!(%msg, "login failed");
        Err(AuthError::LoginFailed(msg))
    }
}
