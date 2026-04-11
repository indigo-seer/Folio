# Syncthing Binaries

Drop platform binaries in this folder before packaging desktop builds.

Expected filenames:

- `syncthing-darwin-arm64`
- `syncthing-darwin-amd64`
- `syncthing-windows-amd64.exe`
- `syncthing-linux-amd64`
- `syncthing-linux-arm64`

Notes:

- These are runtime-managed sidecar binaries used by Folium sync.
- Keep binary versions aligned across platforms.
- Ensure executable permissions on Unix binaries.
