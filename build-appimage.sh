#!/bin/bash
# build-appimage.sh — Podman version (best for EndeavourOS)

echo "🔨 Building Folium AppImage using Podman..."

# Build the Docker image (Podman uses the same Dockerfile)
podman build -t folium-tauri-builder -f Dockerfile .

# Run the build inside the container
podman run --rm \
  -v "$(pwd):/app:z" \
  folium-tauri-builder \
  sh -c "cd /app && pnpm install && cargo tauri build --target x86_64-unknown-linux-gnu"

echo "✅ Build finished! AppImage should be in src-tauri/target/release/bundle/appimage/"