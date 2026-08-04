#!/bin/bash
set -euo pipefail

# build-appimage.sh — Podman version (best for EndeavourOS)

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="x86_64-unknown-linux-gnu"
OUTPUT_DIR="$REPO_DIR/src-tauri/target/$TARGET/release/bundle/appimage"

echo "🔨 Building Folium AppImage using Podman..."

# Build the Docker image (Podman uses the same Dockerfile)
podman build -t folium-tauri-builder -f Dockerfile .

# Run the build inside the container
podman run --rm \
  -v "$REPO_DIR:/app:z" \
  folium-tauri-builder \
  sh -c "cd /app && pnpm install --frozen-lockfile && cargo tauri build --target $TARGET --bundles appimage"

APPIMAGE="$(find "$OUTPUT_DIR" -maxdepth 1 -type f -name '*.AppImage' -print -quit)"
if [[ -z "$APPIMAGE" ]]; then
  echo "❌ Build completed but no AppImage was found in $OUTPUT_DIR" >&2
  exit 1
fi

echo "✅ Build finished: $APPIMAGE"
