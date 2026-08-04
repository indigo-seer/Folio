fn main() {
    // Keep the local developer workflow convenient while allowing CI to pass
    // the key directly through the environment. `cargo:rerun-if-changed` is
    // important because the key is embedded at compile time.
    println!("cargo:rerun-if-env-changed=APTABASE_KEY");
    println!("cargo:rerun-if-changed=.env");

    if std::env::var_os("APTABASE_KEY").is_none() {
        let _ = dotenvy::from_filename(".env");
    }

    println!(
        "cargo:rustc-env=APTABASE_KEY={}",
        std::env::var("APTABASE_KEY").unwrap_or_default()
    );

    tauri_build::build()
}
