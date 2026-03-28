use std::sync::LazyLock;

use regex::Regex;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn extract_bearer_token(header: &str) -> Option<String> {
    let trimmed = header.trim();
    let prefix = "Bearer ";
    if trimmed.len() >= prefix.len() && trimmed[..prefix.len()].eq_ignore_ascii_case(prefix) {
        let token = trimmed[prefix.len()..].trim().to_string();
        if token.is_empty() {
            None
        } else {
            Some(token)
        }
    } else {
        None
    }
}

#[wasm_bindgen]
pub fn extract_sapisidhash(header: &str) -> Option<String> {
    if header.starts_with("SAPISIDHASH ") {
        Some(header.to_string())
    } else {
        None
    }
}

/// token=xoxc-xxxxx or &token=xoxc-xxxxx or ?token=xoxc-xxxxx
static XOXC_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[&\?]?token=(xoxc-[\w-]+)").unwrap());

/// token=xoxa-xxxxx etc.
static XOX_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[&\?]?token=(xox[a-z]-[\w-]+)").unwrap());

#[wasm_bindgen]
pub fn extract_xoxc_token(body: &str) -> Option<String> {
    extract_with_regex(&XOXC_REGEX, body).or_else(|| extract_with_regex(&XOX_REGEX, body))
}

fn extract_with_regex(rx: &Regex, body: &str) -> Option<String> {
    let caps = rx.captures(body)?;
    // PS port: prefer capture group 1 (token without "token=" prefix), fall back to group 0
    caps.get(1)
        .or_else(|| caps.get(0))
        .map(|m| m.as_str().to_string())
}

#[wasm_bindgen]
pub fn detect_platform(hostname: &str) -> String {
    if hostname.contains("google") {
        "gmail".to_string()
    } else if hostname.contains("outlook") {
        "outlook".to_string()
    } else if hostname.contains("slack") {
        "slack".to_string()
    } else if hostname.contains("microsoftonline") {
        "outlook".to_string()
    } else {
        "unknown".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bearer_standard() {
        assert_eq!(
            extract_bearer_token("Bearer abc123"),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn bearer_lowercase() {
        assert_eq!(extract_bearer_token("bearer abc"), Some("abc".to_string()));
    }

    #[test]
    fn bearer_mixed_case() {
        assert_eq!(
            extract_bearer_token("BEARER token-value"),
            Some("token-value".to_string())
        );
    }

    #[test]
    fn bearer_with_leading_whitespace() {
        assert_eq!(
            extract_bearer_token("  Bearer abc123"),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn bearer_with_trailing_whitespace_in_token() {
        assert_eq!(
            extract_bearer_token("Bearer   abc123   "),
            Some("abc123".to_string())
        );
    }

    #[test]
    fn bearer_empty_token() {
        assert_eq!(extract_bearer_token("Bearer  "), None);
    }

    #[test]
    fn bearer_only_prefix() {
        assert_eq!(extract_bearer_token("Bearer"), None);
    }

    #[test]
    fn bearer_basic_auth_rejected() {
        assert_eq!(extract_bearer_token("Basic xyz"), None);
    }

    #[test]
    fn bearer_empty_string() {
        assert_eq!(extract_bearer_token(""), None);
    }

    #[test]
    fn bearer_whitespace_only() {
        assert_eq!(extract_bearer_token("   "), None);
    }

    #[test]
    fn bearer_token_with_dashes_and_dots() {
        assert_eq!(
            extract_bearer_token("Bearer ya29.a0AfH6SMB..."),
            Some("ya29.a0AfH6SMB...".to_string())
        );
    }

    #[test]
    fn sapisidhash_standard() {
        assert_eq!(
            extract_sapisidhash("SAPISIDHASH 1234_5678"),
            Some("SAPISIDHASH 1234_5678".to_string())
        );
    }

    #[test]
    fn sapisidhash_full_header() {
        let full = "SAPISIDHASH 160874_1234567890";
        assert_eq!(extract_sapisidhash(full), Some(full.to_string()));
    }

    #[test]
    fn sapisidhash_case_sensitive_rejects_lowercase() {
        assert_eq!(extract_sapisidhash("sapisidhash 1234_5678"), None);
    }

    #[test]
    fn sapisidhash_wrong_prefix() {
        assert_eq!(extract_sapisidhash("X-SAPISIDHASH 1234_5678"), None);
    }

    #[test]
    fn sapisidhash_empty_string() {
        assert_eq!(extract_sapisidhash(""), None);
    }

    #[test]
    fn sapisidhash_bearer_rejected() {
        assert_eq!(extract_sapisidhash("Bearer abc123"), None);
    }

    #[test]
    fn xoxc_in_query_string() {
        assert_eq!(
            extract_xoxc_token("?token=xoxc-abc123def"),
            Some("xoxc-abc123def".to_string())
        );
    }

    #[test]
    fn xoxc_with_ampersand() {
        assert_eq!(
            extract_xoxc_token("&token=xoxc-abc123def"),
            Some("xoxc-abc123def".to_string())
        );
    }

    #[test]
    fn xoxc_plain() {
        assert_eq!(
            extract_xoxc_token("token=xoxc-abc123def"),
            Some("xoxc-abc123def".to_string())
        );
    }

    #[test]
    fn xoxc_in_body_text() {
        let body = "user=U123&token=xoxc-abc123def&channel=C456";
        assert_eq!(extract_xoxc_token(body), Some("xoxc-abc123def".to_string()));
    }

    #[test]
    fn xoxa_fallback() {
        assert_eq!(
            extract_xoxc_token("token=xoxa-abc123"),
            Some("xoxa-abc123".to_string())
        );
    }

    #[test]
    fn xoxp_fallback() {
        assert_eq!(
            extract_xoxc_token("token=xoxp-xyz456"),
            Some("xoxp-xyz456".to_string())
        );
    }

    #[test]
    fn xoxc_preferred_over_xoxa() {
        let body = "token=xoxa-fallback&token=xoxc-primary";
        assert_eq!(extract_xoxc_token(body), Some("xoxc-primary".to_string()));
    }

    #[test]
    fn xoxc_no_token() {
        assert_eq!(extract_xoxc_token("no tokens here"), None);
    }

    #[test]
    fn xoxc_empty_string() {
        assert_eq!(extract_xoxc_token(""), None);
    }

    #[test]
    fn xoxc_with_underscores_and_dashes() {
        assert_eq!(
            extract_xoxc_token("token=xoxc-a_b-c_d123"),
            Some("xoxc-a_b-c_d123".to_string())
        );
    }

    #[test]
    fn platform_google() {
        assert_eq!(detect_platform("mail.google.com"), "gmail");
    }

    #[test]
    fn platform_google_subdomain() {
        assert_eq!(detect_platform("accounts.google.com"), "gmail");
    }

    #[test]
    fn platform_slack() {
        assert_eq!(detect_platform("slack.com"), "slack");
    }

    #[test]
    fn platform_slack_subdomain() {
        assert_eq!(detect_platform("workspace.slack.com"), "slack");
    }

    #[test]
    fn platform_outlook() {
        assert_eq!(detect_platform("outlook.live.com"), "outlook");
    }

    #[test]
    fn platform_outlook_office() {
        assert_eq!(detect_platform("outlook.office.com"), "outlook");
    }

    #[test]
    fn platform_microsoftonline() {
        assert_eq!(detect_platform("login.microsoftonline.com"), "outlook");
    }

    #[test]
    fn platform_unknown() {
        assert_eq!(detect_platform("example.com"), "unknown");
    }

    #[test]
    fn platform_empty_string() {
        assert_eq!(detect_platform(""), "unknown");
    }

    #[test]
    fn platform_github_unknown() {
        assert_eq!(detect_platform("github.com"), "unknown");
    }
}
