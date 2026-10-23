use reqwest::header::{CONTENT_TYPE, LOCATION};
use reqwest::{Client, Response, StatusCode};
use scraper::{Html, Selector};
use serde::Serialize;
use serde_json::Value;
use std::net::IpAddr;
use std::time::Duration;
use tokio::net::lookup_host;
use url::{Host, Url};

const MAX_HTML_BYTES: usize = 512_000;
const MAX_JSON_BYTES: usize = 128_000;
const MAX_REDIRECTS: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkPreview {
    url: String,
    title: String,
    description: String,
    image_url: Option<String>,
    site_name: String,
}

fn normalize_bookmark_url(input: &str) -> Result<Url, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("URL is empty".to_string());
    }

    let normalized = if trimmed.starts_with("www.") {
        format!("https://{trimmed}")
    } else {
        trimmed.to_string()
    };

    let parsed = Url::parse(&normalized).map_err(|_| "Invalid URL".to_string())?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        _ => Err("Only http(s) URLs are supported".to_string()),
    }
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            let carrier_grade_nat = octets[0] == 100 && (64..=127).contains(&octets[1]);
            let protocol_assignment = octets[0] == 192 && octets[1] == 0 && octets[2] == 0;
            let benchmarking = octets[0] == 198 && (octets[1] == 18 || octets[1] == 19);
            let documentation = (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
                || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
                || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113);
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_multicast()
                || ip.is_unspecified()
                || octets[0] == 0
                || octets[0] >= 240
                || carrier_grade_nat
                || protocol_assignment
                || benchmarking
                || documentation)
        }
        IpAddr::V6(ip) => {
            if let Some(mapped) = ip.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(mapped));
            }
            let octets = ip.octets();
            let unique_local = octets[0] & 0xfe == 0xfc;
            let link_local = octets[0] == 0xfe && octets[1] & 0xc0 == 0x80;
            let site_local = octets[0] == 0xfe && octets[1] & 0xc0 == 0xc0;
            let documentation = octets[0..4] == [0x20, 0x01, 0x0d, 0xb8];
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || unique_local
                || link_local
                || site_local
                || documentation)
        }
    }
}

async fn validate_public_destination(url: &Url) -> Result<Vec<std::net::SocketAddr>, String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Only http(s) URLs are supported".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URLs containing credentials are not supported".to_string());
    }

    let port = url
        .port_or_known_default()
        .ok_or_else(|| "URL has no usable port".to_string())?;
    match url.host() {
        Some(Host::Ipv4(ip)) if is_public_ip(IpAddr::V4(ip)) => {
            Ok(vec![std::net::SocketAddr::new(IpAddr::V4(ip), port)])
        }
        Some(Host::Ipv6(ip)) if is_public_ip(IpAddr::V6(ip)) => {
            Ok(vec![std::net::SocketAddr::new(IpAddr::V6(ip), port)])
        }
        Some(Host::Ipv4(_)) | Some(Host::Ipv6(_)) => {
            Err("Local and private network addresses are blocked".to_string())
        }
        Some(Host::Domain(host)) => {
            let lowered = host.to_ascii_lowercase();
            if lowered == "localhost"
                || lowered.ends_with(".localhost")
                || lowered.ends_with(".local")
            {
                return Err("Local network hostnames are blocked".to_string());
            }
            let addresses: Vec<_> = lookup_host((host, port))
                .await
                .map_err(|err| format!("Could not resolve URL host: {err}"))?
                .collect();
            if addresses.is_empty() || addresses.iter().any(|address| !is_public_ip(address.ip())) {
                return Err("URL resolves to a local or private network address".to_string());
            }
            Ok(addresses)
        }
        None => Err("URL has no host".to_string()),
    }
}

fn build_pinned_client(url: &Url, addresses: &[std::net::SocketAddr]) -> Result<Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36")
        .brotli(true)
        .gzip(true)
        .deflate(true)
        .no_proxy();
    if let Some(Host::Domain(host)) = url.host() {
        builder = builder.resolve_to_addrs(host, addresses);
    }
    builder
        .build()
        .map_err(|err| format!("Could not create HTTP client: {err}"))
}

async fn get_with_safe_redirects(start: Url) -> Result<Response, String> {
    let mut current = start;
    for redirect_count in 0..=MAX_REDIRECTS {
        let addresses = validate_public_destination(&current).await?;
        let client = build_pinned_client(&current, &addresses)?;
        let response = client
            .get(current.clone())
            .send()
            .await
            .map_err(|err| format!("Failed to fetch URL: {err}"))?;
        if !response.status().is_redirection() {
            return Ok(response);
        }
        if redirect_count == MAX_REDIRECTS {
            return Err("Too many redirects".to_string());
        }
        let location = response
            .headers()
            .get(LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| "Redirect response has no valid Location header".to_string())?;
        current = current
            .join(location)
            .map_err(|_| "Invalid redirect URL".to_string())?;
    }
    Err("Too many redirects".to_string())
}

async fn read_bounded_body(mut response: Response, limit: usize) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err("Remote response exceeds the preview size limit".to_string());
    }
    let mut output = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|err| format!("Failed to read response body: {err}"))?
    {
        if output.len() + chunk.len() > limit {
            return Err("Remote response exceeds the preview size limit".to_string());
        }
        output.extend_from_slice(&chunk);
    }
    Ok(output)
}

fn normalize_whitespace(input: &str) -> String {
    input
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn decode_basic_entities(input: &str) -> String {
    input
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn extract_title(document: &Html) -> Option<String> {
    let selector = Selector::parse("title").ok()?;
    let title = document
        .select(&selector)
        .next()
        .map(|node| node.text().collect::<String>())
        .unwrap_or_default();
    let cleaned = normalize_whitespace(&decode_basic_entities(&title));
    if cleaned.is_empty() {
        return None;
    }
    Some(cleaned)
}

fn extract_meta(document: &Html, attr: &str, value: &str) -> Option<String> {
    let selector = Selector::parse(&format!("meta[{attr}]")).ok()?;
    for node in document.select(&selector) {
        let attr_value = node.value().attr(attr).unwrap_or_default();
        if !attr_value.eq_ignore_ascii_case(value) {
            continue;
        }
        let content = node.value().attr("content").unwrap_or_default();
        let cleaned = normalize_whitespace(&decode_basic_entities(content));
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    None
}

fn extract_favicon(document: &Html, base: &Url) -> Option<String> {
    let selector = Selector::parse("link[rel]").ok()?;
    for node in document.select(&selector) {
        let rel = node.value().attr("rel").unwrap_or_default().to_lowercase();
        if !rel.contains("icon") {
            continue;
        }
        let href = node.value().attr("href").unwrap_or_default().trim();
        if href.is_empty() {
            continue;
        }
        if let Some(absolute) = to_absolute_url(base, href) {
            return Some(absolute);
        }
    }
    None
}

fn to_absolute_url(base: &Url, value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.starts_with("data:") {
        return None;
    }

    if trimmed.starts_with("//") {
        return Some(format!("{}:{trimmed}", base.scheme()));
    }

    if let Ok(parsed) = Url::parse(trimmed) {
        return Some(parsed.to_string());
    }

    base.join(trimmed).ok().map(|joined| joined.to_string())
}

fn fallback_title(url: &Url) -> String {
    url.host_str()
        .map(|host| host.trim_start_matches("www.").to_string())
        .filter(|host| !host.is_empty())
        .unwrap_or_else(|| url.to_string())
}

fn provider_site_name(url: &Url) -> String {
    url.host_str()
        .map(|host| host.trim_start_matches("www.").to_string())
        .filter(|host| !host.is_empty())
        .unwrap_or_else(|| fallback_title(url))
}

fn is_youtube_host(host: &str) -> bool {
    host == "youtube.com"
        || host == "www.youtube.com"
        || host == "m.youtube.com"
        || host == "youtu.be"
}

fn is_reddit_host(host: &str) -> bool {
    host == "reddit.com"
        || host == "www.reddit.com"
        || host == "old.reddit.com"
        || host == "redd.it"
}

fn non_empty_json_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|field| field.as_str())
        .map(normalize_whitespace)
        .filter(|text| !text.is_empty())
}

fn build_oembed_endpoint(base: &str, page_url: &Url) -> Option<Url> {
    let mut endpoint = Url::parse(base).ok()?;
    endpoint
        .query_pairs_mut()
        .append_pair("url", page_url.as_str());
    Some(endpoint)
}

async fn fetch_provider_oembed_preview(page_url: &Url) -> Option<BookmarkPreview> {
    let host = page_url.host_str()?.to_lowercase();
    let mut endpoint = if is_youtube_host(&host) {
        let mut url = build_oembed_endpoint("https://www.youtube.com/oembed", page_url)?;
        url.query_pairs_mut().append_pair("format", "json");
        url
    } else if is_reddit_host(&host) {
        build_oembed_endpoint("https://www.reddit.com/oembed", page_url)?
    } else {
        return None;
    };

    // Ensure deterministic query ordering across providers.
    endpoint
        .query_pairs_mut()
        .append_pair("maxwidth", "640")
        .append_pair("maxheight", "360");

    let response = get_with_safe_redirects(endpoint).await.ok()?;
    if !response.status().is_success() {
        return None;
    }

    let body = read_bounded_body(response, MAX_JSON_BYTES).await.ok()?;
    let json = serde_json::from_slice::<Value>(&body).ok()?;
    let title = non_empty_json_string(&json, "title").unwrap_or_else(|| fallback_title(page_url));
    let provider_name = non_empty_json_string(&json, "provider_name")
        .unwrap_or_else(|| provider_site_name(page_url));
    let author_name = non_empty_json_string(&json, "author_name");
    let description = author_name
        .map(|name| format!("By {name}"))
        .unwrap_or_default();
    let image_url = non_empty_json_string(&json, "thumbnail_url")
        .and_then(|value| to_absolute_url(page_url, &value));

    Some(BookmarkPreview {
        url: page_url.to_string(),
        title,
        description,
        image_url,
        site_name: provider_name,
    })
}

#[tauri::command]
pub async fn fetch_bookmark_preview(url: String) -> Result<BookmarkPreview, String> {
    let parsed = normalize_bookmark_url(&url)?;
    let _validated_addresses = validate_public_destination(&parsed).await?;

    if let Some(provider_preview) = fetch_provider_oembed_preview(&parsed).await {
        return Ok(provider_preview);
    }

    let response = get_with_safe_redirects(parsed.clone()).await?;

    if response.status() != StatusCode::OK {
        return Err(format!(
            "Preview request returned HTTP {}",
            response.status()
        ));
    }

    let final_url = response.url().clone();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_lowercase();

    let bytes = read_bounded_body(response, MAX_HTML_BYTES).await?;
    let html = String::from_utf8_lossy(&bytes).to_string();

    if !content_type.contains("text/html") && !html.contains("<html") {
        return Ok(BookmarkPreview {
            url: final_url.to_string(),
            title: fallback_title(&final_url),
            description: String::new(),
            image_url: None,
            site_name: provider_site_name(&final_url),
        });
    }

    let document = Html::parse_document(&html);

    let title = extract_meta(&document, "property", "og:title")
        .or_else(|| extract_meta(&document, "name", "twitter:title"))
        .or_else(|| extract_title(&document))
        .unwrap_or_else(|| fallback_title(&final_url));

    let description = extract_meta(&document, "property", "og:description")
        .or_else(|| extract_meta(&document, "name", "description"))
        .or_else(|| extract_meta(&document, "name", "twitter:description"))
        .unwrap_or_default();

    let image_url = extract_meta(&document, "property", "og:image")
        .or_else(|| extract_meta(&document, "name", "twitter:image"))
        .and_then(|value| to_absolute_url(&final_url, &value));

    let site_name = extract_meta(&document, "property", "og:site_name")
        .unwrap_or_else(|| provider_site_name(&final_url));

    let image_url = image_url.or_else(|| extract_favicon(&document, &final_url));

    Ok(BookmarkPreview {
        url: final_url.to_string(),
        title,
        description,
        image_url,
        site_name,
    })
}

#[cfg(test)]
mod tests {
    use super::is_public_ip;
    use std::net::IpAddr;

    #[test]
    fn blocks_local_reserved_and_mapped_network_addresses() {
        for address in [
            "127.0.0.1",
            "10.0.0.1",
            "169.254.1.1",
            "100.64.0.1",
            "192.0.2.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "::ffff:127.0.0.1",
        ] {
            let ip = address.parse::<IpAddr>().expect("valid test IP address");
            assert!(!is_public_ip(ip), "{address} should be blocked");
        }
    }

    #[test]
    fn permits_public_network_addresses() {
        for address in ["1.1.1.1", "2606:4700:4700::1111"] {
            let ip = address.parse::<IpAddr>().expect("valid test IP address");
            assert!(is_public_ip(ip), "{address} should be allowed");
        }
    }
}
