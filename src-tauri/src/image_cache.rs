use image::imageops::FilterType;
use image::GenericImageView;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

const MAX_LONGEST_EDGE: u32 = 2048;
const WEBP_QUALITY: f32 = 85.0;

#[derive(Serialize, Deserialize)]
struct CacheSourceMetadata {
    source_path: String,
}

fn to_hex(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

fn mtime_millis(path: &Path) -> Result<u128, String> {
    let modified = fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata for {}: {e}", path.display()))?
        .modified()
        .map_err(|e| format!("Failed to read mtime for {}: {e}", path.display()))?;

    modified
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Invalid mtime for {}: {e}", path.display()))
        .map(|duration| duration.as_millis())
}

fn cache_key_for_vault_file(vault_uid: &str, relative_path: &str, mtime_ms: u128) -> String {
    let normalized_relative = relative_path.replace('\\', "/");
    let mut hasher = Sha256::new();
    hasher.update(vault_uid.as_bytes());
    hasher.update(b":");
    hasher.update(normalized_relative.as_bytes());
    hasher.update(b":");
    hasher.update(mtime_ms.to_string().as_bytes());
    to_hex(&hasher.finalize())
}

fn cache_images_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Failed resolving app cache dir: {e}"))?
        .join("images");

    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed creating image cache dir {}: {e}", dir.display()))?;

    app.asset_protocol_scope()
        .allow_directory(&dir, true)
        .map_err(|e| format!("Failed to allow image cache dir in asset scope {}: {e}", dir.display()))?;

    Ok(dir)
}

fn cache_webp_path(cache_dir: &Path, cache_key: &str) -> PathBuf {
    cache_dir.join(format!("{cache_key}.webp"))
}

fn allow_asset_file(app: &AppHandle, file_path: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_file(file_path)
        .map_err(|e| format!("Failed to allow file in asset scope {}: {e}", file_path.display()))
}

fn log_cache_event(action: &str, source_path: &Path, relative_path: &str, cache_path: &Path) {
    println!(
        "[Folium Image Cache] {action} | source={} | relative={} | cache={}",
        source_path.display(),
        relative_path,
        cache_path.display()
    );
}

fn cache_meta_path(cache_dir: &Path, cache_key: &str) -> PathBuf {
    cache_dir.join(format!("{cache_key}.json"))
}

fn write_cache_metadata(cache_dir: &Path, cache_key: &str, source_path: &Path) -> Result<(), String> {
    let metadata = CacheSourceMetadata {
        source_path: source_path.to_string_lossy().to_string(),
    };

    let serialized = serde_json::to_vec(&metadata)
        .map_err(|e| format!("Failed serializing cache metadata: {e}"))?;
    fs::write(cache_meta_path(cache_dir, cache_key), serialized)
        .map_err(|e| format!("Failed writing cache metadata: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_cached_image(
    app: AppHandle,
    source_path: String,
    vault_uid: String,
    relative_path: String,
) -> Result<Option<String>, String> {
    let source = PathBuf::from(source_path);
    if !source.exists() {
        println!(
            "[Folium Image Cache] MISS_SOURCE_NOT_FOUND | source={} | relative={}",
            source.display(),
            relative_path
        );
        return Ok(None);
    }
    if vault_uid.trim().is_empty() || relative_path.trim().is_empty() {
        println!(
            "[Folium Image Cache] MISS_INVALID_KEY_INPUT | source={} | relative={} | vault_uid_present={}",
            source.display(),
            relative_path,
            !vault_uid.trim().is_empty()
        );
        return Ok(None);
    }

    let mtime_ms = mtime_millis(&source)?;
    let cache_key = cache_key_for_vault_file(&vault_uid, &relative_path, mtime_ms);
    let cache_dir = cache_images_dir(&app)?;
    let webp_path = cache_webp_path(&cache_dir, &cache_key);

    if webp_path.exists() {
        allow_asset_file(&app, &webp_path)?;
        let _ = write_cache_metadata(&cache_dir, &cache_key, &source);
        log_cache_event("HIT", &source, &relative_path, &webp_path);
        return Ok(Some(webp_path.to_string_lossy().to_string()));
    }

    println!(
        "[Folium Image Cache] MISS_NOT_CACHED | source={} | relative={} | expected_cache={}",
        source.display(),
        relative_path,
        webp_path.display()
    );
    Ok(None)
}

#[tauri::command]
pub fn generate_cached_image(
    app: AppHandle,
    source_path: String,
    vault_uid: String,
    relative_path: String,
) -> Result<String, String> {
    let generation_started_at = Instant::now();
    let source = PathBuf::from(source_path);
    if !source.exists() {
        return Err(format!("Source image does not exist: {}", source.display()));
    }
    if vault_uid.trim().is_empty() || relative_path.trim().is_empty() {
        return Err("Missing vault_uid or relative_path for cache generation".to_string());
    }

    let mtime_ms = mtime_millis(&source)?;
    let cache_key = cache_key_for_vault_file(&vault_uid, &relative_path, mtime_ms);
    let cache_dir = cache_images_dir(&app)?;
    let webp_path = cache_webp_path(&cache_dir, &cache_key);

    if webp_path.exists() {
        allow_asset_file(&app, &webp_path)?;
        let _ = write_cache_metadata(&cache_dir, &cache_key, &source);
        let elapsed_ms = generation_started_at.elapsed().as_millis();
        println!(
            "[Folium Image Cache] ALREADY_CACHED | source={} | relative={} | cache={} | elapsed_ms={}",
            source.display(),
            relative_path,
            webp_path.display(),
            elapsed_ms
        );
        return Ok(webp_path.to_string_lossy().to_string());
    }

    let image = image::open(&source)
        .map_err(|e| format!("Failed opening source image {}: {e}", source.display()))?;

    let (width, height) = image.dimensions();
    let longest_edge = width.max(height);
    let resized = if longest_edge > MAX_LONGEST_EDGE {
        let scale = MAX_LONGEST_EDGE as f32 / longest_edge as f32;
        let resized_width = ((width as f32 * scale).round() as u32).max(1);
        let resized_height = ((height as f32 * scale).round() as u32).max(1);
        image.resize(resized_width, resized_height, FilterType::Triangle)
    } else {
        image
    };

    let rgba = resized.to_rgba8();
    let (output_width, output_height) = rgba.dimensions();
    let encoder = webp::Encoder::from_rgba(rgba.as_raw(), output_width, output_height);
    let encoded = encoder.encode(WEBP_QUALITY);
    fs::write(&webp_path, &*encoded)
        .map_err(|e| format!("Failed writing WebP {}: {e}", webp_path.display()))?;
    allow_asset_file(&app, &webp_path)?;

    write_cache_metadata(&cache_dir, &cache_key, &source)?;
    let elapsed_ms = generation_started_at.elapsed().as_millis();
    println!(
        "[Folium Image Cache] GENERATED | source={} | relative={} | cache={} | in_px={}x{} | out_px={}x{} | elapsed_ms={}",
        source.display(),
        relative_path,
        webp_path.display(),
        width,
        height,
        output_width,
        output_height,
        elapsed_ms
    );
    Ok(webp_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn sweep_orphaned_cache(app: AppHandle) -> Result<u64, String> {
    let cache_dir = cache_images_dir(&app)?;
    let entries = fs::read_dir(&cache_dir)
        .map_err(|e| format!("Failed reading cache dir {}: {e}", cache_dir.display()))?;

    let mut removed = 0u64;

    for entry in entries {
        let path = entry
            .map_err(|e| format!("Failed iterating cache dir {}: {e}", cache_dir.display()))?
            .path();

        let extension = path.extension().and_then(|ext| ext.to_str());
        if extension != Some("json") {
            continue;
        }

        let metadata_bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => {
                let _ = fs::remove_file(&path);
                removed += 1;
                continue;
            }
        };

        let metadata: CacheSourceMetadata = match serde_json::from_slice(&metadata_bytes) {
            Ok(value) => value,
            Err(_) => {
                let _ = fs::remove_file(&path);
                removed += 1;
                continue;
            }
        };

        let source_exists = Path::new(&metadata.source_path).exists();
        if source_exists {
            continue;
        }

        let stem = match path.file_stem().and_then(|stem| stem.to_str()) {
            Some(value) => value,
            None => continue,
        };

        let webp = cache_webp_path(&cache_dir, stem);
        if fs::remove_file(&path).is_ok() {
            removed += 1;
        }
        if fs::remove_file(webp).is_ok() {
            removed += 1;
        }
    }

    Ok(removed)
}

#[tauri::command]
pub fn get_cache_size(app: AppHandle) -> Result<u64, String> {
    let cache_dir = cache_images_dir(&app)?;
    let entries = fs::read_dir(&cache_dir)
        .map_err(|e| format!("Failed reading cache dir {}: {e}", cache_dir.display()))?;

    let mut total_bytes = 0u64;

    for entry in entries {
        let path = entry
            .map_err(|e| format!("Failed iterating cache dir {}: {e}", cache_dir.display()))?
            .path();

        if !path.is_file() {
            continue;
        }

        let metadata = match fs::metadata(&path) {
            Ok(value) => value,
            Err(_) => continue,
        };
        total_bytes = total_bytes.saturating_add(metadata.len());
    }

    Ok(total_bytes)
}

#[tauri::command]
pub fn clear_cache(app: AppHandle) -> Result<(), String> {
    let cache_dir = cache_images_dir(&app)?;
    let entries = fs::read_dir(&cache_dir)
        .map_err(|e| format!("Failed reading cache dir {}: {e}", cache_dir.display()))?;

    for entry in entries {
        let path = entry
            .map_err(|e| format!("Failed iterating cache dir {}: {e}", cache_dir.display()))?
            .path();

        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed clearing cache directory {}: {e}", path.display()))?;
            continue;
        }

        fs::remove_file(&path)
            .map_err(|e| format!("Failed clearing cache file {}: {e}", path.display()))?;
    }

    Ok(())
}

#[tauri::command]
pub fn open_cache_folder(app: AppHandle) -> Result<(), String> {
    let cache_dir = cache_images_dir(&app)?;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&cache_dir)
            .spawn()
            .map_err(|e| format!("Failed opening cache folder in explorer {}: {e}", cache_dir.display()))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&cache_dir)
            .spawn()
            .map_err(|e| format!("Failed opening cache folder in Finder {}: {e}", cache_dir.display()))?;
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(&cache_dir)
            .spawn()
            .map_err(|e| format!("Failed opening cache folder via xdg-open {}: {e}", cache_dir.display()))?;
    }

    Ok(())
}
