/// Collect `Set-Cookie` header values from a response into a cookie jar.
///
/// Only the `name=value` portion (before the first `;`) is kept.
pub fn collect_cookies<'a>(headers: impl Iterator<Item = (&'a http::HeaderName, &'a http::HeaderValue)>) -> Vec<String> {
    headers
        .filter(|(name, _)| name.as_str().eq_ignore_ascii_case("set-cookie"))
        .filter_map(|(_, value)| value.to_str().ok())
        .filter_map(|cookie| cookie.split(';').next().map(|s| s.trim().to_string()))
        .collect()
}

/// Merge `new_cookies` into `jar`, replacing any existing entry with the same key.
pub fn merge_cookies(jar: &mut Vec<String>, new_cookies: &[String]) {
    for new_cookie in new_cookies {
        let parts: Vec<&str> = new_cookie.splitn(2, '=').collect();
        if parts.len() == 2 {
            let key = parts[0];
            if let Some(pos) = jar.iter().position(|c| c.starts_with(&format!("{key}="))) {
                jar[pos] = new_cookie.clone();
            } else {
                jar.push(new_cookie.clone());
            }
        }
    }
}

/// Extract `csrfToken` from HTML (e.g. `action="?csrfToken=abc123"`).
pub fn extract_csrf_token(html: &str) -> Option<String> {
    for line in html.lines() {
        if let Some(pos) = line.find("csrfToken=") {
            let after_eq = &line[pos + 10..];
            let token: String = after_eq
                .chars()
                .take_while(|c| !matches!(c, '&' | '"' | '\'' | ' ' | '>' | ';'))
                .collect();
            if !token.is_empty() {
                tracing::trace!("csrfToken found in HTML");
                return Some(token);
            }
        }
    }
    tracing::trace!("no csrfToken found in HTML");
    None
}

/// Build the final `Cookie` header string from a jar.
pub fn cookie_header(jar: &[String]) -> String {
    jar.join("; ")
}
