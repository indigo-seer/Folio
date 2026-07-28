# Folium Sync — Implementation PRD
**Version:** 2.0  
**Status:** Draft  
**Branch:** `feature/sync-crdt-syncthing`  
**Platforms in scope:** Desktop (Mac/Windows/Linux), Android  
**Platforms deferred:** iOS (separate PRD)

---

## 1. Executive Summary

Folium is a local-first markdown note-taking app. This PRD defines the complete architecture, user experience, and implementation plan for seamless multi-device sync — with zero cloud dependency, zero subscriptions, and zero exposure of underlying infrastructure to the user.

The sync layer is built on two complementary technologies working as distinct layers:

- **Yjs (CRDTs)** — the intelligence layer. Handles merging, conflict resolution, version history, and compaction. Makes conflicts mathematically impossible.
- **Syncthing** — the transport layer. Handles peer discovery, encrypted file transfer, and cross-network connectivity. Bundled inside Folium on all platforms. The user never knows it exists.

Syncthing is fully embedded inside Folium on both desktop and Android. No separate download, no separate app, no separate configuration. It is a silent internal engine, like a database driver.

---

## 2. Goals & Non-Goals

### Goals
- Zero-conflict sync across Mac, Windows, Linux, and Android
- Syncthing bundled inside the app binary on all platforms — zero user installation
- Device pairing through Folium UI only — QR code or typed pairing code
- Background sync on desktop and Android without user management
- 30-day version history with automatic compaction
- Graceful degradation when devices are offline for extended periods
- Vault file structure designed to accommodate future E2E encryption without migration
- No cloud, no external APIs, no subscriptions

### Non-Goals
- iOS background sync (deferred to iOS PRD)
- Real-time collaborative editing between different user accounts
- Any Syncthing UI, config, or terminology exposed to the user
- Cloud backup or remote access without a peer device online
- E2E encryption implementation (architecture stub included, implementation deferred)

---

## 3. Branch Strategy & Development Safety

### 3.1 Branch Structure
```
main                                     ← stable production, never broken
└── feature/sync-crdt-syncthing          ← integration branch, all sync work
    ├── feature/sync-yjs-core            ← CRDT layer, Yjs document model
    ├── feature/sync-syncthing-desktop   ← desktop binary bundling + sidecar
    ├── feature/sync-syncthing-android   ← Android JNI/AAR bundling
    ├── feature/sync-pairing-ui          ← all pairing screens and flows
    ├── feature/sync-heartbeat           ← heartbeat + staleness system
    └── feature/sync-compaction          ← compaction scheduler
```

Sub-branches merge into `feature/sync-crdt-syncthing` only after their own tests pass. `feature/sync-crdt-syncthing` merges to `main` only after the full E2E test suite passes.

### 3.2 Core Safety Rules
- `main` must always build and run with sync completely absent
- Sync is gated behind a feature flag `FOLIUM_SYNC_ENABLED` — defaults to `false` until GA
- All sync code lives exclusively in `/src/sync/` — zero imports from sync into any other module
- The core editor (`/src/editor/`) has no knowledge of sync. It emits file save events. Sync listens. That is the only coupling.
- CI enforces: every PR to the integration branch must pass the full existing test suite with `FOLIUM_SYNC_ENABLED=false` before it can be reviewed
- A second CI pass runs with `FOLIUM_SYNC_ENABLED=true` — any regression in core functionality blocks merge regardless of sync test status

### 3.3 Feature Flag Behaviour
```typescript
// config/flags.ts
export const FLAGS = {
  FOLIUM_SYNC_ENABLED: process.env.FOLIUM_SYNC_ENABLED === 'true'
    || localConfig.get('sync.enabled') === true,
}

// In app bootstrap
if (FLAGS.FOLIUM_SYNC_ENABLED) {
  await SyncManager.initialize(vaultPath)
}
// If flag is off, SyncManager is never imported, never instantiated
// Zero performance impact, zero risk
```

### 3.4 Rollback Plan
Post-release rollback does not require a new app version. Folium reads a local config file on startup:
```
~/.folium/flags.json
{ "sync.enabled": false }
```
Setting this to false and restarting disables all sync. No data is deleted. The vault remains intact. This file can be written by a support script without the user needing to uninstall.

---

## 4. Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                       Folium App                         │
│                                                          │
│  ┌──────────────┐              ┌────────────────────┐    │
│  │    Editor    │  save event  │    Sync Module     │    │
│  │  (sync-      │─────────────►│                    │    │
│  │   unaware)   │              │  ┌──────────────┐  │    │
│  └──────────────┘              │  │  Yjs Layer   │  │    │
│                                │  │  - Y.Doc     │  │    │
│  ┌──────────────┐              │  │  - Merge     │  │    │
│  │   Sync UI    │◄────────────►│  │  - Compact   │  │    │
│  │  - Settings  │  status/     │  └──────┬───────┘  │    │
│  │  - Pairing   │  events      │         │           │    │
│  │  - Staleness │              │  ┌──────▼───────┐  │    │
│  │  - Toasts    │              │  │  Syncthing   │  │    │
│  └──────────────┘              │  │  Bridge      │  │    │
│                                │  │  - Config    │  │    │
│                                │  │  - REST API  │  │    │
│                                │  │  - Process   │  │    │
│                                │  └──────┬───────┘  │    │
└──────────────────────────────────────────┼───────────┘    
                                           │
                              ┌────────────▼────────────┐
                              │   Vault on Filesystem   │
                              │   ~/Folium/             │
                              │   ├── Note.md           │
                              │   ├── Note.yjs          │
                              │   └── .vault-sync/      │
                              └────────────┬────────────┘
                                           │
                              ┌────────────▼────────────┐
                              │  Syncthing (embedded)   │
                              │  Silent sidecar process │
                              │  Managed entirely by    │
                              │  Folium. No UI exposed. │
                              └─────────────────────────┘
                                           │
                              ┌────────────▼────────────┐
                              │    Peer Devices         │
                              │  (same or diff network) │
                              └─────────────────────────┘
```

---

## 5. Vault File Structure

```
~/Folium/
├── Fruits.md                         ← Interoperability export, human readable
├── Fruits.yjs                        ← CRDT source of truth (binary)
├── Meeting Notes.md
├── Meeting Notes.yjs
└── .vault-sync/
    ├── devices/
    │   ├── device-a1b2c3d4.json      ← Heartbeat: MacBook
    │   └── device-e5f6a7b8.json      ← Heartbeat: Android
    ├── compaction/
    │   ├── last_compaction.json      ← When, how many files, bytes saved
    │   └── merge_log.jsonl           ← Append-only log of all merge events
    ├── conflicts/
    │   └── ...                       ← Failed auto-merges stored here safely
    ├── encryption/
    │   └── .keystore_stub            ← Reserved for E2E encryption (see §17)
    │                                    Empty file now. Presence signals vault
    │                                    is encryption-aware.
    └── config.json                   ← Device-local. Never synced.
```

### 5.1 Heartbeat File Schema
```json
{
  "deviceId": "folium-a1b2c3d4",
  "deviceName": "MacBook Pro",
  "platform": "macos",
  "appVersion": "1.2.0",
  "syncthing_version": "1.27.0",
  "lastSeen": 1704067200,
  "lastSeenISO": "2024-01-01T04:00:00Z",
  "status": "online"
}
```
`status` is `"online"` while the app is running, written as `"offline"` on clean app close. Lets peer devices distinguish "recently active and unreachable" from "gracefully closed".

### 5.2 Yjs File
Binary Yjs V2 update format. Contains:
- Compacted base state snapshot (full current document)
- Individual operations from the last 30 days

### 5.3 Markdown File
Written on every save. Always derived from Yjs state. Never used as sync source of truth. Exists so the vault works with Obsidian, iA Writer, or any text editor.

If an external editor modifies a `.md` file, Folium detects the change via file watcher and offers: *"This note was edited outside Folium. Import those changes?"* If accepted, the external content is diffed into the Yjs document as a new operation.

### 5.4 Config File (device-local, never synced)
```json
{
  "deviceId": "folium-a1b2c3d4",
  "deviceName": "MacBook Pro",
  "pairedDevices": [
    {
      "deviceId": "folium-e5f6a7b8",
      "deviceName": "Galaxy S24",
      "syncthing_id": "XXXXXX-XXXXXX-...",
      "pairedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "syncEnabled": true,
  "compactionIntervalDays": 7,
  "historyRetentionDays": 30
}
```

---

## 6. Syncthing Embedding — Desktop

### 6.1 Bundled Binaries
Syncthing is compiled and bundled inside Folium's application package at build time. The correct binary is selected at runtime based on platform and architecture.

```
Folium.app/Contents/Resources/bin/
├── syncthing-darwin-arm64      ← Apple Silicon Mac
├── syncthing-darwin-amd64      ← Intel Mac
├── syncthing-windows-amd64.exe ← Windows
├── syncthing-linux-amd64       ← Linux x86
└── syncthing-linux-arm64       ← Linux ARM (Raspberry Pi etc.)
```

Binary selection at runtime:
```typescript
function getSyncthingBinary(): string {
  const platform = process.platform   // 'darwin' | 'win32' | 'linux'
  const arch = process.arch           // 'arm64' | 'x64'
  const ext = platform === 'win32' ? '.exe' : ''
  return path.join(
    app.getPath('resources'),
    'bin',
    `syncthing-${platform}-${arch}${ext}`
  )
}
```

### 6.2 Process Lifecycle
```
Folium starts
  → Check binary exists and is executable
  → Generate Syncthing config if not present
  → Spawn Syncthing as child process, stdout/stderr piped to Folium logger
  → Syncthing binds REST API to 127.0.0.1:{random_port}
  → Folium polls REST /rest/system/ping until ready (max 10s timeout)
  → Sync module initializes

Folium closes
  → Send SIGTERM to Syncthing
  → Wait up to 3 seconds for graceful shutdown
  → SIGKILL if still running
  → Write offline heartbeat

Syncthing crashes unexpectedly
  → Process exit event fires
  → Log crash with exit code
  → Wait 2 seconds
  → Restart (max 3 automatic restarts within 10 minutes)
  → After 3 failures: show sync error badge, stop attempting
  → User can manually retry from Settings → Sync
```

### 6.3 Syncthing Configuration (Folium-generated, user never sees)
```xml
<configuration version="35">
  <gui enabled="false" tls="false">
    <!-- Web UI permanently disabled -->
  </gui>
  <options>
    <globalAnnounceEnabled>true</globalAnnounceEnabled>
    <localAnnounceEnabled>true</localAnnounceEnabled>
    <relaysEnabled>true</relaysEnabled>
    <startBrowser>false</startBrowser>
    <autoUpgradeIntervalH>0</autoUpgradeIntervalH>
    <!-- Folium controls upgrades via app updates, not Syncthing auto-update -->
    <urAccepted>-1</urAccepted>
    <!-- Usage reporting permanently declined -->
  </options>
  <folder id="folium-vault" path="~/Folium" type="sendreceive">
    <ignorePatterns>
      .DS_Store
      Thumbs.db
      *.tmp
      .vault-sync/config.json
    </ignorePatterns>
  </folder>
</configuration>
```

### 6.4 What Syncthing Syncs
| File | Synced | Reason |
|---|---|---|
| `*.yjs` | ✅ | CRDT source of truth |
| `*.md` | ✅ | External editor interoperability |
| `.vault-sync/devices/*.json` | ✅ | Heartbeats needed for staleness detection |
| `.vault-sync/compaction/merge_log.jsonl` | ✅ | Audit trail across devices |
| `.vault-sync/config.json` | ❌ | Device-local, contains local device ID |
| `*.tmp` | ❌ | Intermediate write files |
| `.DS_Store`, `Thumbs.db` | ❌ | OS metadata |

---

## 7. Syncthing Embedding — Android

### 7.1 The Problem
Android does not allow shipping arbitrary native binaries the way desktop does. You cannot copy a Syncthing binary into the APK and exec it. Android requires native code to be packaged as a shared library (`.so`) loaded via JNI, or run as a compiled Android service.

### 7.2 Solution — Syncthing as Native Library (AAR)
The Syncthing project maintains `syncthing-android`, a Gradle module that compiles the Syncthing Go binary into Android-compatible native shared libraries via the Go Android NDK toolchain.

Build pipeline:
```
1. Pull syncthing source at pinned version tag (e.g. v1.27.0)
2. Cross-compile via Go + Android NDK for target ABIs:
   - arm64-v8a    ← modern Android phones (primary)
   - armeabi-v7a  ← older Android phones
   - x86_64       ← Android emulators (CI testing)
3. Output: libsyncthing.so per ABI
4. Package into folium-sync.aar alongside JNI bridge
5. Include AAR in Folium Android Gradle dependencies
```

Result: Syncthing runs inside Folium's own process as a native library. No Play Store interaction. No separate APK. No separate app icon. Invisible to the user in every way.

```gradle
// app/build.gradle
dependencies {
    implementation files('../libs/folium-sync.aar')
    // Contains libsyncthing.so for all target ABIs
    // ABI splits configured to only package relevant .so per device
}
```

### 7.3 JNI Bridge
```kotlin
// SyncthingBridge.kt
class SyncthingBridge(private val context: Context) {

    external fun startSyncthing(configPath: String, dataPath: String): Int
    external fun stopSyncthing()
    external fun getSyncthingApiPort(): Int

    companion object {
        init {
            System.loadLibrary("syncthing")
        }
    }

    fun start() {
        val configDir = File(context.filesDir, ".vault-sync/syncthing")
        configDir.mkdirs()
        val port = startSyncthing(
            configDir.absolutePath,
            configDir.absolutePath
        )
        // Port is used for local REST API calls — same pattern as desktop
    }
}
```

### 7.4 Android Foreground Service
Background sync on Android requires a foreground service. This is the only Android-sanctioned way to keep a process alive without battery optimization killing it.

```kotlin
// SyncForegroundService.kt
class SyncForegroundService : Service() {

    private lateinit var syncthingBridge: SyncthingBridge
    private lateinit var heartbeatManager: HeartbeatManager

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = buildSyncNotification()
        startForeground(SYNC_NOTIFICATION_ID, notification)

        syncthingBridge.start()
        heartbeatManager.start()

        return START_STICKY  // Android restarts this service if killed
    }

    override fun onDestroy() {
        heartbeatManager.writeOfflineHeartbeat()
        syncthingBridge.stopSyncthing()
        super.onDestroy()
    }

    private fun buildSyncNotification(): Notification {
        return NotificationCompat.Builder(this, SYNC_CHANNEL_ID)
            .setContentTitle("Folium")
            .setContentText("Sync active")
            .setSmallIcon(R.drawable.ic_sync_minimal)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            // Lowest possible visual and auditory footprint
            .build()
    }
}
```

The persistent notification is required by Android OS and cannot be fully hidden. It is designed to be as unobtrusive as possible: no sound, no vibration, minimum priority, single short line, no action buttons.

### 7.5 Vault Storage on Android
```
/storage/emulated/0/Documents/Folium/
├── Note.md
├── Note.yjs
└── .vault-sync/
    ├── devices/
    ├── compaction/
    ├── conflicts/
    └── syncthing/          ← Syncthing internal data (config, db, certs)
```

Syncthing's config and database live inside `.vault-sync/syncthing/`. This means when a vault is backed up and restored, Syncthing's identity travels with it — no re-pairing required after a reinstall if the vault folder is preserved.

### 7.6 Android Permissions
```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>
<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE"/>
<!-- Required Android 11+ for Documents folder access -->

<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"/>
<uses-permission android:name="android.permission.CAMERA"/>
<!-- Camera for QR code scanning during pairing -->

<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
<!-- To restart sync service after device reboot -->
```

### 7.7 Post-Reboot Recovery
```kotlin
// BootReceiver.kt
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            if (SyncPreferences.isSyncEnabled(context)) {
                SyncForegroundService.start(context)
            }
        }
    }
}
```

Sync restarts automatically after device reboot. The user configures it once and it persists.

### 7.8 Manufacturer Battery Optimization Variance
Different Android manufacturers (Samsung One UI, OnePlus OxygenOS, Xiaomi MIUI) impose aggressive battery restrictions beyond the standard Android API. The test matrix in Phase 3 must include physical devices from these manufacturers. Known issues and workarounds are documented in `/docs/android-battery-compat.md` maintained alongside this PRD.

### 7.9 Battery Optimization Prompt
Shown once during first sync setup, never repeated unless the user revokes permission:
```
┌───────────────────────────────────────┐
│  Keep sync running in background?     │
│                                       │
│  Folium syncs your notes even when    │
│  the app is closed. To do this        │
│  reliably, allow it to run without    │
│  battery restrictions.                │
│                                       │
│  Battery impact is minimal — sync     │
│  only activates when files change.    │
│                                       │
│  [Allow — Recommended]  [Not now]     │
└───────────────────────────────────────┘
```

"Allow" deep-links directly to `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — one tap, system dialog, done. No manual navigation through Settings.

"Not now" is respected. Sync still works when the app is in the foreground. A persistent but subtle note appears in Settings → Sync:
> *"Background sync is limited. Tap to enable."*

---

## 8. CRDT Layer — Yjs Implementation

### 8.1 Document Model
Each note maps to exactly one `Y.Doc`:
```typescript
const ydoc = new Y.Doc()
const content = ydoc.getText('content')   // note body — Y.Text for concurrent edits
const meta = ydoc.getMap('meta')          // title, tags, created, modified
```

`Y.Text` handles concurrent character-level insertions from multiple devices without conflict. Two devices inserting at the same position both have their content preserved in a deterministic order.

### 8.2 Save Flow
```
User types in editor
  → Debounce 500ms (reset on each keystroke)
  → Apply changes to Y.Doc via Y.Text operations
  → Encode full Y.Doc state: Y.encodeStateAsUpdateV2(ydoc)
  → Atomic write to Note.yjs (see §14.1)
  → Serialize Y.Doc to markdown string
  → Atomic write to Note.md
  → Syncthing file watcher triggers, syncs both files to peers
```

### 8.3 Receive Flow
```
Syncthing delivers updated Note.yjs from peer
  → VaultWatcher fires on file change event
  → Deduplicate: ignore if change is our own write (match by inode + mtime)
  → Read new Note.yjs bytes from disk
  → Y.applyUpdateV2(localDoc, remoteBytes)
    → Yjs merges at operation level — all unique changes from both devices preserved
    → If note is open in editor: diff applied in-place, cursor position preserved
    → If note is not open: file updated silently
  → Write merged state back to Note.yjs (atomic)
  → Reserialize to Note.md (atomic)
  → Show "Updated from [Device Name]" toast (3s auto-dismiss)
  → Update note's last-synced timestamp in meta
```

### 8.4 Conflict File Interception
Syncthing may produce `Note.yjs.sync-conflict-YYYYMMDD-HHMMSS-DEVICEID` in edge case race conditions. Folium intercepts these before the user ever sees them:

```
VaultWatcher detects filename matching *.sync-conflict-*
  → Read conflict file bytes
  → Read current Note.yjs bytes
  → merged = Y.mergeUpdates([currentBytes, conflictBytes])
  → Sanity check 1: merged byte length > 0
  → Sanity check 2: merged content length >= max(current length, conflict length)
  → Sanity check 3: merged content contains no null/undefined
  → If all checks pass:
    → Atomic write merged result to Note.yjs
    → Delete conflict file
    → Append to merge_log.jsonl: { ts, file, outcome: "auto_merged" }
    → Show "Synced changes from [Device Name]" toast
  → If any check fails:
    → Keep current Note.yjs unchanged
    → Move conflict file to .vault-sync/conflicts/ with timestamp
    → Append to merge_log.jsonl: { ts, file, outcome: "failed_sanity", reason }
    → Show warning in Settings → Sync: "One note needs attention"
    → Never show raw conflict file in note list
```

### 8.5 Compaction

#### Schedule
Runs on a background thread (never blocks the UI or save path):
- Every 7 days (configurable in `.vault-sync/config.json`)
- Also triggered when total `.yjs` vault size exceeds 100MB
- On app launch if last compaction was more than 14 days ago

#### Algorithm
```typescript
async function compactVault(vaultPath: string, retentionDays: number = 30) {
  const yjsFiles = await glob(`${vaultPath}/**/*.yjs`)
  const results = { processed: 0, skipped: 0, bytesSaved: 0 }

  for (const file of yjsFiles) {
    const originalBytes = await fs.readFile(file)
    const originalSize = originalBytes.byteLength

    const doc = new Y.Doc()
    Y.applyUpdateV2(doc, originalBytes)

    // Encode state — Yjs discards ops beyond retention window internally
    const compacted = Y.encodeStateAsUpdateV2(doc)

    // VERIFICATION: compacted doc must produce identical content
    const verifyDoc = new Y.Doc()
    Y.applyUpdateV2(verifyDoc, compacted)

    const originalText = doc.getText('content').toString()
    const verifiedText = verifyDoc.getText('content').toString()

    if (originalText !== verifiedText) {
      log.error(`Compaction verification failed for ${file} — skipping`)
      results.skipped++
      continue
    }

    await atomicWrite(file, compacted)
    results.bytesSaved += originalSize - compacted.byteLength
    results.processed++
  }

  await writeCompactionMetadata(vaultPath, {
    lastRun: new Date().toISOString(),
    ...results,
    retentionDays,
  })
}
```

The content equality check is the safety net. If a compaction bug ever causes content divergence, the file is skipped — not corrupted.

### 8.6 Device Offline > 30 Days
When a long-absent device reconnects, Syncthing delivers stale `.yjs` files. Folium detects the shared history gap:

```
Merge attempt on stale .yjs from long-offline device
  → Check: does remote device's last Yjs clock predate local compaction timestamp?
  → If yes: cannot safely merge — shared history was pruned
  → Do not attempt merge
  → Show LongOfflineModal (see §11.10)
  → User selects "Update this device":
    → Copy current compacted vault state to device via Syncthing
    → Device overwrites stale local .yjs files with current versions
    → Any notes edited only on that device during the absent period are not preserved
    → This data loss is disclosed clearly and explicitly in the modal
  → User selects "Cancel":
    → Device marked as "needs attention" in status panel
    → No merge attempted, no data changed
```

---

## 9. Heartbeat System

### 9.1 Purpose
Heartbeats give each device visibility into the recent activity of its peers, enabling the staleness warning. This solves Scenario 1 — the silent case where a peer was active but offline and changes never arrived.

### 9.2 Write Interval
- Every 30 seconds while the app is open
- Written as `status: "offline"` on clean app exit
- Atomic write via `.tmp` rename (see §14.1)
- Syncthing syncs heartbeats to all peers within seconds of write

### 9.3 Staleness Detection Logic
Runs every time a note is opened or brought into focus:

```typescript
function checkStaleness(notePath: string): StalenessInfo | null {
  const yjsPath = notePath.replace('.md', '.yjs')
  const noteMtime = fs.statSync(yjsPath).mtimeMs
  const THRESHOLD_MS = 60_000  // 1 minute — avoids false positives from heartbeat lag

  const heartbeats = readAllDeviceHeartbeats(vaultPath)

  for (const device of heartbeats) {
    if (device.deviceId === localDeviceId) continue
    if (device.status === 'offline') continue  // Peer closed cleanly, no pending changes

    if (device.lastSeen > noteMtime + THRESHOLD_MS) {
      return {
        deviceName: device.deviceName,
        peerLastSeen: device.lastSeen,
        noteLastSynced: noteMtime,
      }
    }
  }
  return null
}
```

### 9.4 Staleness Resolution
The banner automatically disappears when:
- The note's `.yjs` file is updated from that peer device, OR
- The peer's heartbeat transitions to `status: "offline"`

User can also manually dismiss the banner — dismissed state is not persisted, reappears if note is closed and reopened with staleness still present.

---

## 10. Device Pairing

### 10.1 Philosophy
The user must never see a Syncthing device ID, IP address, port, or any technical identifier. Folium abstracts all of this behind a short-lived, human-friendly pairing code.

### 10.2 Pairing Code Design
```
Format:   XXXX-XXXX-XXXX
Example:  KXBT-M92P-HJ4R
Charset:  Uppercase alphanumeric excluding O, 0, I, 1 (visually ambiguous)
Length:   12 characters — short enough to type, sufficient entropy for 10-min window
Validity: 10 minutes from generation
Use:      Single-use — accepting a code invalidates it
```

The code encodes a signed payload:
```typescript
interface PairingPayload {
  deviceId: string        // Folium device ID (not Syncthing ID — never shown to user)
  syncthing_id: string    // Syncthing device ID (long, internal only)
  deviceName: string      // "MacBook Pro"
  platform: string        // "macos" | "windows" | "linux" | "android"
  vaultId: string         // Hash of vault contents — prevents wrong-vault pairing
  expires: number         // Unix ms timestamp
  hmac: string            // HMAC-SHA256 of all above fields using local device secret
}
```

### 10.3 Pairing Flow — Initiating Device (has vault)
```
Settings → Sync → Add Device
  → Generate PairingPayload with 10-min expiry
  → Render QR code (data URI: "folium://pair?code=KXBT-M92P-HJ4R")
  → Display manual code: "KXBT · M92P · HJ4R"
  → Show countdown: "Expires in 9:47"
  → Poll local Syncthing REST for incoming device connection

On peer connects:
  → Validate peer identity against pairing payload
  → Add peer to Syncthing config via REST API
  → Mark vault folder as shared with peer
  → Update local config.json with paired device entry
  → Begin initial vault transfer
  → Show: "Sending vault to Galaxy S24... 143 notes"
  → On complete: "Galaxy S24 is now syncing ✓"
```

### 10.4 Pairing Flow — Joining Device (no vault)
```
First launch → "Sync from existing device"
  OR
Settings → Sync → Add Device → "I have a code"

  → Show camera viewfinder (QR scan) with manual code field below
  → User scans QR or types KXBT-M92P-HJ4R

On code submission:
  → Decode payload
  → Validate HMAC signature (reject silently if tampered, show "Invalid code")
  → Validate expiry (reject if expired, show "Code expired — ask for a new one")
  → Validate vault ID matches (reject if different vault)
  → Extract syncthing_id, add to local Syncthing config as trusted peer
  → Send pairing confirmation back to initiating device
  → Show: "Connected to MacBook Pro. Receiving vault..."
  → Progress bar during initial sync
  → On complete: vault fully available, navigate to note list
```

### 10.5 Security Properties
- HMAC with device secret prevents code forgery
- 10-minute expiry prevents replay attacks
- Vault ID in payload prevents accidentally pairing to a different vault
- Codes are single-use — invalidated on acceptance
- All Syncthing traffic is TLS-encrypted in transit

---

## 11. User Experience — All Screens

### 11.1 Onboarding — First Launch
```
┌─────────────────────────────────────┐
│                                     │
│         Welcome to Folium           │
│                                     │
│   Where should your notes live?     │
│                                     │
│   ● ~/Documents/Folium              │
│     Recommended                     │
│                                     │
│   ○ Choose a folder                 │
│                                     │
│             [Get Started]           │
│                                     │
│   ─────────────────────────────     │
│   Already use Folium elsewhere?     │
│   [Sync from existing device →]     │
│                                     │
└─────────────────────────────────────┘
```

### 11.2 Settings → Sync (healthy)
```
┌────────────────────────────────────────────┐
│  Sync                           ● Active   │
│                                            │
│  My Devices                                │
│  ────────────────────────────────────────  │
│  ✓ MacBook Pro           This device       │
│  ✓ Desktop PC            Last seen: now    │
│  ✓ Galaxy S24            Last seen: 1h     │
│                                            │
│  [+ Add Device]    [Remove a device]       │
│                                            │
│  ────────────────────────────────────────  │
│  Vault                                     │
│  Notes:          143 files · 48 MB         │
│  Sync history:   12 MB  (30 days)          │
│  Last compacted: 3 days ago                │
│                                            │
│  [Compact now]                             │
└────────────────────────────────────────────┘
```

### 11.3 Settings → Sync (error)
```
┌────────────────────────────────────────────┐
│  Sync                        ⚠ Error       │
│                                            │
│  Sync stopped unexpectedly.                │
│  [Retry]  [View log]                       │
│                                            │
│  My Devices                                │
│  ✓ MacBook Pro           This device       │
│  ✗ Desktop PC            Unreachable       │
│  ✓ Galaxy S24            Last seen: 1h     │
└────────────────────────────────────────────┘
```

### 11.4 Add Device Screen
```
┌────────────────────────────────────────────┐
│  Add Device                           ×    │
│                                            │
│  Open Folium on your other device and      │
│  scan this code, or type it manually.      │
│                                            │
│  ┌──────────────────────────────────┐      │
│  │                                  │      │
│  │        [QR CODE RENDERED]        │      │
│  │                                  │      │
│  └──────────────────────────────────┘      │
│                                            │
│         KXBT  ·  M92P  ·  HJ4R             │
│                                            │
│  ⏱  Expires in  8:43                       │
│  [Generate new code]                       │
│                                            │
│  ────────────────────────────────────────  │
│  Waiting for other device...               │
│  ● ● ●                                     │
└────────────────────────────────────────────┘
```

### 11.5 Join from Existing Vault (new device)
```
┌────────────────────────────────────────────┐
│  Sync from another device             ×    │
│                                            │
│  On your existing device, go to            │
│  Settings → Sync → Add Device,             │
│  then scan the code shown there.           │
│                                            │
│  ┌──────────────────────────────────┐      │
│  │   [CAMERA VIEWFINDER ACTIVE]     │      │
│  └──────────────────────────────────┘      │
│                                            │
│  Or enter code manually:                   │
│  [____] · [____] · [____]  [Connect]       │
└────────────────────────────────────────────┘
```

### 11.6 Initial Vault Transfer
```
┌────────────────────────────────────────────┐
│                                            │
│  Sending vault to Galaxy S24               │
│                                            │
│  ████████████░░░░░░░░  67%                 │
│  89 of 143 notes                           │
│                                            │
│  Keep both devices on and nearby           │
│  for the fastest transfer.                 │
│                                            │
│  This only happens once.                   │
│                                            │
└────────────────────────────────────────────┘
```

### 11.7 Remove Device
```
┌────────────────────────────────────────────┐
│  Remove Device                        ×    │
│                                            │
│  ○  Desktop PC                             │
│  ○  Galaxy S24                             │
│                                            │
│  Removing a device stops sync.             │
│  Your notes stay on both devices.          │
│                                            │
│  [Remove Selected]         [Cancel]        │
└────────────────────────────────────────────┘
```

### 11.8 Staleness Banner (in note view)
Non-blocking, shown below note title, above body:
```
┌──────────────────────────────────────────────────────┐
│  ⚠  Desktop PC was active recently — this note may   │
│     have unsynced changes. Your edits are safe.      │
│                                            [Dismiss] │
└──────────────────────────────────────────────────────┘
```

### 11.9 Sync Toasts (bottom of screen, 3s auto-dismiss)
```
↑  Synced to Desktop PC                               ×
↓  Updated from Galaxy S24                            ×
```

### 11.10 Long-Offline Modal
```
┌────────────────────────────────────────────┐
│  Desktop PC was offline for 32 days        │
│                                            │
│  Sync history is kept for 30 days.         │
│  To sync this device, Folium will update   │
│  it to your current vault.                 │
│                                            │
│  Notes edited only on Desktop PC during    │
│  that time may not be preserved.           │
│                                            │
│  [Update this device]        [Cancel]      │
└────────────────────────────────────────────┘
```

### 11.11 External Edit Detected
```
┌────────────────────────────────────────────┐
│  Fruits.md was edited outside Folium       │
│                                            │
│  Another app modified this note.           │
│  Import those changes?                     │
│                                            │
│  [Import changes]            [Ignore]      │
└────────────────────────────────────────────┘
```

### 11.12 Failed Auto-Merge Warning (rare)
```
┌────────────────────────────────────────────┐
│  Settings → Sync            ⚠ 1 note       │
│                                            │
│  Folium could not automatically merge      │
│  a version of "Project Ideas". The         │
│  original has been preserved safely.       │
│                                            │
│  [Review in Finder]         [Dismiss]      │
└────────────────────────────────────────────┘
```

---

## 12. Sync Module — Code Structure

```
src/
└── sync/
    ├── index.ts                      ← ONLY file imported outside sync/
    ├── SyncManager.ts                ← Orchestrator: initializes all components
    │
    ├── yjs/
    │   ├── YjsDocument.ts            ← Single note Y.Doc lifecycle
    │   ├── YjsVault.ts               ← Vault-wide Yjs operations
    │   ├── Compaction.ts             ← Scheduler + compaction logic + verification
    │   └── ExternalEditImport.ts     ← Diff external .md edits into Yjs
    │
    ├── syncthing/
    │   ├── SyncthingProcess.ts       ← Spawn, monitor, restart, shutdown
    │   ├── SyncthingConfig.ts        ← Generate Syncthing XML config
    │   ├── SyncthingAPI.ts           ← REST API wrapper (peers, folders, status)
    │   └── BinaryResolver.ts         ← Select correct binary per platform/arch
    │
    ├── pairing/
    │   ├── PairingCode.ts            ← Generate, encode, decode, validate, invalidate
    │   ├── PairingSession.ts         ← Active pairing session lifecycle
    │   └── QRCode.ts                 ← QR rendering
    │
    ├── heartbeat/
    │   ├── HeartbeatWriter.ts        ← Write local heartbeat on 30s interval
    │   └── HeartbeatReader.ts        ← Read peer heartbeats, detect staleness
    │
    ├── watcher/
    │   └── VaultWatcher.ts           ← FS watcher → triggers receive and conflict flows
    │
    └── ui/
        ├── SyncStatusDot.tsx         ← Active / error in title bar or status bar
        ├── SyncSettings.tsx          ← Full settings panel
        ├── AddDeviceModal.tsx         ← QR + code display, session management
        ├── JoinVaultScreen.tsx        ← Camera viewfinder + manual code input
        ├── RemoveDeviceModal.tsx
        ├── VaultTransferProgress.tsx
        ├── StalenessBar.tsx
        ├── SyncToast.tsx
        ├── LongOfflineModal.tsx
        ├── ExternalEditModal.tsx
        └── FailedMergeWarning.tsx
```

### 12.1 Public API — index.ts
The only file any code outside `/src/sync/` ever imports:

```typescript
export interface SyncAPI {
  // Lifecycle
  initialize(vaultPath: string): Promise<void>
  dispose(): Promise<void>

  // Called by editor on every save — only coupling to core
  onNoteSaved(filePath: string): Promise<void>

  // Called by note list and note view
  getNoteState(filePath: string): NoteState
  // { isStale: boolean, staleDevice?: string, lastSynced: number }

  // Called by UI components
  getDeviceStatus(): DeviceStatus[]
  // { deviceId, deviceName, platform, lastSeen, status, isLocal }

  startPairing(): Promise<PairingSession>
  // { code, qrData, expiresAt, cancel() }

  acceptPairingCode(code: string): Promise<void>
  removeDevice(deviceId: string): Promise<void>
  runCompaction(): Promise<CompactionResult>

  // Event subscriptions
  on(event: 'sync:received', handler: (file: string, device: string) => void): void
  on(event: 'sync:sent', handler: (file: string, device: string) => void): void
  on(event: 'sync:error', handler: (error: SyncError) => void): void
  on(event: 'staleness:detected', handler: (file: string, device: string) => void): void
  on(event: 'conflict:resolved', handler: (file: string) => void): void
  on(event: 'conflict:failed', handler: (file: string) => void): void
  off(event: string, handler: Function): void
}
```

---

## 13. Testing Strategy

### 13.1 Unit Tests

**PairingCode**
- Generate → decode round-trip produces identical payload
- HMAC validation rejects tampered payload
- Expired code (> 10 min) rejected
- Wrong vault ID rejected
- Characters O, 0, I, 1 never appear in output
- Same code cannot be accepted twice (invalidation)

**YjsDocument**
- Two devices add different content offline → merge contains both, neither lost
- Two devices add content at same cursor position → both preserved, deterministic order
- Empty document merge produces empty document (not null/error)
- Merge of identical documents is idempotent (applying twice = same as once)
- Yjs meta fields (title, tags) merge correctly alongside content

**Compaction**
- Content before and after compaction is character-for-character identical
- Operations older than 30 days absent from compacted output
- Operations within 30 days present in compacted output
- File is smaller after compaction (or equal — never larger)
- Compaction failure (content mismatch) skips file without writing
- Compaction on already-compacted file is idempotent

**HeartbeatReader**
- Device online within threshold → staleness: false
- Device online after note last modified → staleness: true
- Device with status "offline" → staleness: false regardless of timestamp
- Multiple devices — only stalest peer triggers banner

**SyncthingConfig**
- Generated config has `gui enabled="false"`
- Generated config has `startBrowser=false`
- Generated config has `autoUpgradeIntervalH=0`
- Generated config has `urAccepted=-1`
- Folder path correctly written

**AtomicWrite**
- File exists and is correct after write
- Orphaned `.tmp` file is cleaned up on startup
- Original file unchanged if write throws mid-operation (simulated via mock)

### 13.2 Integration Tests

Two Folium instances pointing at temp directories, file exchange simulated without real Syncthing:

```
Test: Clean offline merge — different lines
  Given: Note "apple\nbanana"
  Device A offline → adds "grapes"
  Device B offline → adds "mango"
  When: Yjs files merged
  Then: Note contains all four items
  Then: Note.md reflects merged Yjs state exactly
  Then: No conflict file remains

Test: Clean offline merge — same line
  Given: Note "apple"
  Device A offline → types "s" at end → "apples"
  Device B offline → types "!" at end → "apple!"
  When: Yjs files merged
  Then: Both insertions preserved (e.g. "apples!" or "apple!s" — deterministic)
  Then: No content lost

Test: Conflict file auto-resolution
  Given: Syncthing creates Note.yjs.sync-conflict-...
  When: VaultWatcher detects file
  Then: Conflict file deleted within 1 second
  Then: Merged Note.yjs contains all content from both versions
  Then: merge_log.jsonl has entry with outcome "auto_merged"

Test: Failed sanity check does not corrupt
  Given: Conflict file is 0 bytes (corrupt)
  When: Merge attempted
  Then: Sanity check fails
  Then: Current Note.yjs is byte-identical to before merge attempt
  Then: Conflict file moved to .vault-sync/conflicts/
  Then: merge_log.jsonl has entry with outcome "failed_sanity"

Test: Compaction preserves content
  Given: 1000 save operations on a note over 60 days
  When: Compaction runs with 30-day retention
  Then: Note content identical before and after
  Then: .yjs file smaller after compaction
  Then: Last 30 days of ops present; ops from day 31+ absent

Test: Long-offline device detection and update
  Given: Vault compacted at T=0
  Given: Device B's Yjs state clock is T minus 35 days
  When: Device B reconnects and delivers stale .yjs
  Then: Folium detects pre-compaction state
  Then: No merge attempted
  Then: LongOfflineModal triggered
  When: User selects "Update this device"
  Then: Device B receives current compacted vault state
  Then: Device B's notes match current vault exactly

Test: External edit import
  Given: Note.md edited by external app (mtime updated, content changed)
  When: Folium opens note
  Then: ExternalEditModal shown
  When: User accepts import
  Then: Diff applied to Yjs doc as operations
  Then: Note.yjs updated
  Then: Sync propagates change to peers

Test: App crash during write leaves no corruption
  Given: Write in progress to Note.yjs.tmp
  When: Process killed (SIGKILL)
  Then: On next launch, Note.yjs.tmp cleaned up
  Then: Note.yjs is original pre-crash version, uncorrupted
```

### 13.3 E2E Tests

**Desktop — two instances**
- Full pairing flow via QR
- Write note on A → verify on B within 5 seconds
- Edit same note on both while network disconnected → reconnect → verify clean merge
- Remove device → verify sync stops, notes retained on both

**Desktop + Android emulator**
- Pairing: desktop generates QR, emulator scans via CameraX
- Note created on desktop → verified on emulator after sync
- App backgrounded on emulator → note edited on desktop → app foregrounded → verify update received

**Android reboot recovery**
- Foreground service running → device rebooted → service auto-restarts → sync resumes
- Verify no notes lost during reboot cycle

**Manufacturer battery optimization (physical devices)**
- Samsung Galaxy (One UI) — verify sync survives app background for 1 hour
- Google Pixel (stock Android) — verify sync survives app background for 1 hour
- OnePlus (OxygenOS) — verify sync survives app background for 1 hour

### 13.4 Regression Tests (block any PR that fails)

```bash
npm run test:core -- --sync=false    # All existing tests with sync disabled
npm run test:core -- --sync=true     # All existing tests with sync enabled
npm run test:startup                 # Startup time delta < 500ms
npm run test:memory                  # Memory delta < 50MB
npm run build:all                    # Clean build: mac, windows, linux, android
```

---

## 14. Failure Modes & Safeguards

| Failure | Detection | Response |
|---|---|---|
| Syncthing binary missing or not executable | Existence + permission check on startup | Show setup error, offer reinstall |
| Syncthing fails to start | REST ping timeout (10s) | Retry once; then show error badge |
| Syncthing crashes | Process exit event | Auto-restart × 3; then error badge, stop retrying |
| Syncthing web UI somehow enabled | Config validation on startup | Overwrite config, restart Syncthing |
| `.yjs` file corrupted / unparseable | Yjs parse throws | Fallback to `.md`, show warning in Settings |
| Merge produces empty document | Post-merge size check | Abort, keep original, move conflict to safe folder |
| Merge produces smaller-than-expected document | Post-merge length comparison | Abort, keep original, log to merge_log |
| Disk full during write | Write error on `.tmp` | Abort write, show "Disk full" toast, original unchanged |
| Pairing code expired | Timestamp validation | Show "Code expired — generate a new one" |
| Pairing code tampered | HMAC validation fails | Show "Invalid code", no further action |
| Pairing code used twice | Code invalidation on first use | Reject silently, show "This code has already been used" |
| Compaction content mismatch | Pre/post equality check | Skip file without writing, log, retry next scheduled run |
| Compaction interrupted (crash) | Atomic write — `.tmp` never promoted | On restart, clean up `.tmp`, original intact |
| Device offline > 30 days | Yjs clock vs compaction timestamp | LongOfflineModal — no merge until user confirms |
| Orphaned `.tmp` files from crash | Startup directory scan | Delete silently |
| Android foreground service killed by OS | START_STICKY + BootReceiver | Auto-restart, sync resumes |
| Android manufacturer kills battery-exempt app | Test matrix (§13.3) | Document known incompatibilities, prompt user for manufacturer-specific settings |

### 14.1 Atomic Write Pattern
Every write to `.yjs`, `.md`, and heartbeat files:

```typescript
async function atomicWrite(targetPath: string, data: Buffer): Promise<void> {
  const tmpPath = `${targetPath}.tmp`
  try {
    await fs.writeFile(tmpPath, data)
    await fs.fsync(tmpPath)              // Ensure bytes hit disk before rename
    await fs.rename(tmpPath, targetPath) // Atomic on POSIX, atomic on NTFS
  } catch (err) {
    // Clean up tmp if rename or fsync failed
    await fs.unlink(tmpPath).catch(() => {})
    throw err
  }
}
```

A crash at any point leaves the original file intact. The `.tmp` orphan is cleaned up on next startup.

---

## 15. Performance Targets

| Metric | Target | How Measured |
|---|---|---|
| Sync latency, local network | < 2s from save to peer | E2E test, LAN |
| Sync latency, cross-network relay | < 10s | E2E test, throttled network |
| Initial vault sync, 500 notes, LAN | < 60s | E2E timed test |
| Initial vault sync, 500 notes, relay | < 5 min | E2E timed test, throttled |
| Yjs merge, two diverged files | < 50ms | Unit benchmark |
| Conflict file resolution | < 1s from detection | E2E test |
| Compaction, 1000 notes | < 30s background | Integration benchmark |
| App startup overhead, sync enabled | < 500ms additional | CI startup delta test |
| Memory overhead, sync module | < 50MB additional | CI memory profiler |
| Heartbeat write | Every 30s | Unit test interval |
| Battery impact, Android foreground service | < 2% per day idle | Manual device test |

---

## 16. Rollout Plan

### Phase 1 — Internal (2 weeks)
- Desktop only (Mac + Windows)
- Feature flag on for team devices only
- Two-machine test of all 5 offline scenarios
- Hard kill (`kill -9`) tests for atomic write verification
- Compaction run against real internal vault — verify zero content loss

### Phase 2 — Desktop Beta (3 weeks)
- All desktop platforms via opt-in beta channel
- Local-only error logs — no external telemetry of any kind
- Monitor: `.yjs` corruption reports, conflict files surviving, staleness false positives
- Performance profiling on large vaults (1000+ notes)

### Phase 3 — Android Beta (3 weeks)
- Android added to beta channel
- Physical device test matrix: Samsung, Pixel, OnePlus (see §7.8)
- Android versions: 10, 11, 12, 13, 14
- Validate reboot recovery, battery optimization, foreground service persistence

### Phase 4 — GA
- Feature flag default `true` for all users
- Release notes include honest iOS statement:
  > *"Folium syncs seamlessly across Mac, Windows, Linux, and Android. iPhone support is in progress — for now, Folium on iPhone syncs when the app is open."*
- All documentation and marketing references "sync" — never "Syncthing"
- Internal support runbook documents Syncthing troubleshooting for edge cases — not user-facing

---

## 17. E2E Encryption — Architecture Stub

Encryption is not implemented in this version. The vault structure and sync architecture are designed today so encryption can be added later without a vault migration.

### Stub Marker
`.vault-sync/encryption/.keystore_stub` is created as an empty placeholder on vault initialization. Future Folium versions detect its presence to confirm the vault layout is encryption-compatible.

### File Structure Reserved
```
.vault-sync/encryption/
├── .keystore_stub        ← Empty now. Present to mark encryption-aware vault.
└── keystore.enc          ← Future: encrypted vault master key, per device
```

### Future Encryption Layer (for architecture planning only)
```
Where it slots in:
  Yjs encode → [ENCRYPT] → atomicWrite → disk → Syncthing → peer → [DECRYPT] → Yjs apply

What gets encrypted:
  → .yjs files (CRDT binary content)
  → .md files (markdown content)

What stays plaintext:
  → .vault-sync/devices/*.json (heartbeats — sync metadata, no note content)
  → Syncthing's own certificates and config (Syncthing manages its own TLS)

Proposed scheme (not final, requires cryptographic review):
  → XChaCha20-Poly1305 (authenticated encryption, no padding oracles)
  → Per-file nonce derived from: HKDF(vault_key, file_path + file_creation_ts)
  → Vault master key stored in OS keychain (Keychain/macOS, Credential Manager/Windows, Keystore/Android)
  → Key exchange during pairing: encrypted key transfer using peer's Syncthing TLS cert as recipient key

No sync architecture changes required when this is implemented.
The encrypt/decrypt calls are added in YjsVault.ts around the read/write calls.
Syncthing continues to transport opaque bytes it cannot read.
```

---

## 18. What Is Explicitly Out Of Scope

- iOS background sync (iOS PRD — separate document)
- E2E at-rest encryption implementation (Encryption PRD — separate document)
- Selective sync (sync specific folders or notes only)
- Shared vaults between different user accounts (collaborative use case)
- Version history browser UI — compaction preserves 30 days of data; UI for browsing it is a separate feature
- Any Syncthing UI, device ID, port number, or config file exposed to the user under any circumstances
- Manual conflict resolution UI — CRDT makes this unnecessary for all text content
- Syncthing auto-update (Folium controls Syncthing version via app updates)