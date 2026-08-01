# PhotoDeDuplicate

> Scan a folder for duplicate images and organize them — files are **moved**, never deleted.

![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078D4)
![Built with Electron](https://img.shields.io/badge/built%20with-Electron-47848F)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

## Features

- **Exact duplicate detection** — SHA-256 hash comparison finds byte-for-byte identical files
- **Perceptual duplicate detection** — dHash algorithm finds visually similar images (resized, recompressed, etc.)
- **Non-destructive** — duplicates are moved to a timestamped output folder, never deleted
- **Adjustable sensitivity** — advanced settings slider lets you tune perceptual matching strictness
- **Clean output structure** — duplicates are organized into `Exact/` and `Perceptual/` subfolders
- **Modern dark UI** — polished interface with progress tracking

## Supported Image Formats

`.jpg` · `.jpeg` · `.png` · `.bmp` · `.tiff` · `.tif` · `.webp` · `.gif`

## Installation

### From Installer

Download the latest `PhotoDeDuplicate Setup x.x.x.exe` from
[Releases](https://github.com/gavinfischer-keenan/photoDeDuplicate/releases)
and run the setup wizard.

### From Source

```bash
# Clone the repository
git clone https://github.com/gavinfischer-keenan/photoDeDuplicate.git
cd photoDeDuplicate

# Install dependencies
npm install

# Run the application
npm start
```

## Usage

1. **Select a folder** — Click "Browse Folder" to choose a folder to scan.
   - If the folder contains subfolders, you'll see a warning that subfolders will not be scanned.

2. **Choose scan mode**:
   - **Exact + Perceptual** (default) — finds byte-identical copies first, then visually similar images
   - **Exact Only** — only finds byte-for-byte identical files
   - **Perceptual Only** — only finds visually similar images

3. **Adjust sensitivity** (optional) — Open "Advanced Settings" to tune the perceptual similarity threshold with a slider.

4. **Start Scan** — The app scans your images and moves duplicates to a timestamped subfolder:
   ```
   YourFolder/
   └── Duplicatescan07311530/
       ├── Exact/        ← byte-identical copies
       └── Perceptual/   ← visually similar images
   ```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- npm

### Running Tests

```bash
npm test
```

### Building the Installer

```bash
npm run dist
```

This produces a Windows NSIS installer in `dist_electron/`.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for a detailed technical overview
including module descriptions, data flow, hashing algorithms, and IPC design.

## How It Works

### Exact Matching
Each image file is streamed through SHA-256 hashing. Files with identical
hashes are byte-for-byte copies. The first file (alphabetically) is kept;
the rest are moved to `Exact/`.

### Perceptual Matching
Each image is resized to 9×8 grayscale and a 64-bit difference hash (dHash)
is computed. Images whose hashes differ by fewer bits than the threshold are
considered visually similar. The first file (alphabetically) in each group
is kept; the rest are moved to `Perceptual/`.

## License

MIT
