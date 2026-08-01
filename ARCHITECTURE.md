# PhotoDeDuplicate — Architecture Document

## 1. Overview

PhotoDeDuplicate is a Windows desktop application that scans a user-selected
folder for duplicate images and moves them into an organized output directory.
It provides two complementary detection strategies — **exact** (byte-level)
and **perceptual** (visual similarity) — so it catches both perfect copies and
visually-identical variants (resized, recompressed, re-saved).

Files are **never deleted**; duplicates are moved to a timestamped subfolder,
preserving full traceability.

---

## 2. Technology Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Desktop framework | **Electron** | Chromium renderer for a polished UI + Node.js backend for filesystem access |
| Image processing | **sharp** (libvips) | Fastest Node.js image library; handles resize/grayscale for perceptual hashing |
| Exact hashing | Node.js **crypto** (SHA-256) | Built-in, zero dependencies, streaming to keep memory low |
| Perceptual hashing | Custom **dHash** via sharp | Difference hash — simple, fast, robust against resizing/recompression |
| Testing | **Jest** | Industry-standard JS test runner |
| Packaging | **electron-builder** (NSIS) | Produces a standard Windows `.exe` setup wizard |

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Electron Application                │
│                                                      │
│  ┌────────────────────┐    IPC     ┌───────────────┐ │
│  │  Renderer Process  │◄──bridge──►│ Main Process  │ │
│  │  (Chromium / UI)   │           │  (Node.js)    │ │
│  │                    │           │               │ │
│  │  index.html        │           │  main.js      │ │
│  │  styles.css        │           │  preload.js   │ │
│  │  renderer.js       │           │  scanner.js   │ │
│  │                    │           │  hasher.js    │ │
│  │                    │           │  fileManager  │ │
│  └────────────────────┘           └───────────────┘ │
└──────────────────────────────────────────────────────┘
```

### Process Separation

- **Main Process** (Node.js): Has full access to the filesystem, native
  dialogs, and the `sharp` image library. All scanning, hashing, and file
  operations run here.

- **Renderer Process** (Chromium): Displays the UI. Has **no** direct access
  to Node.js APIs — all communication goes through the preload bridge.

- **Preload Script**: A thin bridge that exposes a `window.api` object via
  `contextBridge`. Only whitelisted methods are exposed (see §5).

---

## 4. Module Descriptions

### 4.1 `hasher.js` — Hashing Engine

| Function | Description |
|----------|-------------|
| `computeExactHash(filePath)` | Streams the file through SHA-256 and returns the hex digest. |
| `computePerceptualHash(filePath)` | Resizes image to 9×8 grayscale via `sharp`, computes a 64-bit dHash. |
| `hammingDistance(hex1, hex2)` | XORs two hash buffers and counts set bits. |
| `arePerceptuallySimilar(h1, h2, threshold)` | Returns `true` when Hamming distance ≤ threshold. |

#### dHash Algorithm

1. Resize to **9 columns × 8 rows** (grayscale, `fit:'fill'`).
2. For each row, compare adjacent pixels: `left < right → 1, else 0`.
3. 8 comparisons/row × 8 rows = **64 bits**.
4. Encode as a 16-character hex string.

### 4.2 `scanner.js` — Scan Orchestrator

| Function | Description |
|----------|-------------|
| `getImageFiles(folderPath)` | Lists image files in a folder (non-recursive, sorted alphabetically). |
| `checkForSubfolders(folderPath)` | Returns `true` if the folder contains subdirectories. |
| `scanFolder(folderPath, options, progressCb)` | Main scan entry point — runs exact and/or perceptual passes. |

**Scan workflow (`mode: 'both'`)**:

```
  All image files
       │
       ▼
  ┌─────────────┐     SHA-256 hash
  │ Exact Pass  │────► group by hash ──► mark N-1 per group as exact dupes
  └─────────────┘
       │
       ▼  (remaining unique files)
  ┌─────────────────┐     dHash
  │ Perceptual Pass │────► pairwise Hamming ──► mark matches as perceptual dupes
  └─────────────────┘
```

### 4.3 `fileManager.js` — File Operations

| Function | Description |
|----------|-------------|
| `getTimestampedFolderName(date?)` | Returns `DuplicatescanMMDDHHMM`. |
| `createOutputFolder(basePath, date?)` | Creates the output folder with `Exact/` and `Perceptual/` subdirs. |
| `moveDuplicates(duplicates, outputFolder)` | Moves files, handles name collisions with `_N` suffix. |
| `getUniqueFilePath(destDir, fileName)` | Generates collision-free destination path. |

### 4.4 `main.js` — Electron Main Process

- Creates the `BrowserWindow` with secure settings (`contextIsolation: true`,
  `nodeIntegration: false`).
- Registers IPC handlers for folder selection, scan start, and shell operations.
- Sends progress and completion events back to the renderer.

### 4.5 `preload.js` — IPC Bridge

Exposes `window.api` with:

```
selectFolder()              → { folderPath, hasSubfolders }
startScan({ folderPath, mode, threshold })
openFolder(folderPath)
onProgress(callback)
onComplete(callback)
onError(callback)
removeAllListeners()
```

---

## 5. IPC Communication

| Channel | Direction | Payload |
|---------|-----------|---------|
| `dialog:select-folder` | Renderer → Main | — |
| `scan:start` | Renderer → Main | `{ folderPath, mode, threshold }` |
| `shell:open-folder` | Renderer → Main | `folderPath` |
| `scan:progress` | Main → Renderer | `{ current, total, currentFile, phase }` |
| `scan:complete` | Main → Renderer | `{ exactCount, perceptualCount, outputFolder, movedFiles, errors }` |
| `scan:error` | Main → Renderer | `{ message }` |

All renderer → main channels use `ipcRenderer.invoke()` / `ipcMain.handle()`
(request-response). Main → renderer channels use `webContents.send()` /
`ipcRenderer.on()` (event streaming).

---

## 6. Duplicate Selection Strategy

When a group of files shares the same exact or perceptual hash:

1. Files are sorted **alphabetically** by full path.
2. The **first** file is kept in place.
3. All remaining files in the group are moved to the output folder.

---

## 7. Output Folder Structure

```
SelectedFolder/
├── image_a.jpg           ← kept (original)
├── image_c.jpg           ← kept (original)
└── Duplicatescan07311530/
    ├── Exact/
    │   └── image_a_copy.jpg
    └── Perceptual/
        └── image_c_resized.jpg
```

---

## 8. Supported Image Formats

`.jpg` · `.jpeg` · `.png` · `.bmp` · `.tiff` · `.tif` · `.webp` · `.gif`

HEIC/HEIF is intentionally excluded.

---

## 9. Installer / Deployment

- **Packaging**: `electron-builder` with NSIS target.
- **Installer type**: Wizard-style (not one-click); user can choose install directory.
- **Native modules**: `sharp`'s native binaries are unpacked from the ASAR
  archive (`asarUnpack: ["**/node_modules/sharp/**"]`).

Build command:
```bash
npm run dist
```

Produces: `dist_electron/PhotoDeDuplicate Setup 1.0.0.exe`

---

## 10. Testing Strategy

| Suite | Covers |
|-------|--------|
| `hasher.test.js` | SHA-256 consistency, dHash computation, Hamming distance, similarity |
| `scanner.test.js` | File listing, subfolder detection, exact/perceptual/combined scan modes |
| `fileManager.test.js` | Folder naming, directory creation, file moving, conflict handling |

Tests generate images programmatically with `sharp` (gradient patterns) and
use OS temp directories for isolation.

```bash
npm test
```
