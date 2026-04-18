use reqwest::header::CONTENT_TYPE;
use scraper::{Html, Selector};
use serde_json::Value;
use serde::Serialize;
use std::time::Duration;
use url::Url;

const MAX_HTML_BYTES: usize = 512_000;

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
    endpoint.query_pairs_mut().append_pair("url", page_url.as_str());
    Some(endpoint)
}

async fn fetch_provider_oembed_preview(
    client: &reqwest::Client,
    page_url: &Url,
) -> Option<BookmarkPreview> {
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

    let response = client.get(endpoint).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }

    let json = response.json::<Value>().await.ok()?;
    let title = non_empty_json_string(&json, "title").unwrap_or_else(|| fallback_title(page_url));
    let provider_name =
        non_empty_json_string(&json, "provider_name").unwrap_or_else(|| provider_site_name(page_url));
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

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(8))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36")
        .brotli(true)
        .gzip(true)
        .deflate(true)
        .build()
        .map_err(|err| format!("Could not create HTTP client: {err}"))?;

    if let Some(provider_preview) = fetch_provider_oembed_preview(&client, &parsed).await {
        return Ok(provider_preview);
    }

    let response = client
        .get(parsed.clone())
        .send()
        .await
        .map_err(|err| format!("Failed to fetch URL: {err}"))?;

    let final_url = response.url().clone();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_lowercase();

    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("Failed to read response body: {err}"))?;
    let slice = if bytes.len() > MAX_HTML_BYTES {
        &bytes[..MAX_HTML_BYTES]
    } else {
        &bytes[..]
    };
    let html = String::from_utf8_lossy(slice).to_string();

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
