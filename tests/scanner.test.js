'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const { scanFolder, getImageFiles, checkForSubfolders } = require('../src/main/scanner');

describe('Scanner Module', () => {
  let testDir;

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'scanner-test-'));
  });

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  /** Helper: create a solid-colour image file. */
  async function createSolidImage(dir, name, r, g, b, width = 80, height = 80) {
    const buf = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      buf[i * 3]     = r;
      buf[i * 3 + 1] = g;
      buf[i * 3 + 2] = b;
    }
    const filePath = path.join(dir, name);
    await sharp(buf, { raw: { width, height, channels: 3 } }).png().toFile(filePath);
    return filePath;
  }

  /** Helper: create a gradient image file. */
  async function createGradientImage(dir, name, direction = 'horizontal', width = 100, height = 100) {
    const buf = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        const v = direction === 'horizontal'
          ? Math.floor((x / (width - 1)) * 255)
          : Math.floor((y / (height - 1)) * 255);
        buf[idx] = v;
        buf[idx + 1] = v;
        buf[idx + 2] = v;
      }
    }
    const filePath = path.join(dir, name);
    await sharp(buf, { raw: { width, height, channels: 3 } }).png().toFile(filePath);
    return filePath;
  }

  // ── getImageFiles ──────────────────────────────────────────────────

  describe('getImageFiles', () => {
    let imgDir;

    beforeAll(async () => {
      imgDir = path.join(testDir, 'img_files_test');
      await fs.promises.mkdir(imgDir, { recursive: true });

      await createSolidImage(imgDir, 'photo.png', 255, 0, 0);
      await createSolidImage(imgDir, 'image.jpg', 0, 255, 0);
      fs.writeFileSync(path.join(imgDir, 'readme.txt'), 'not an image');
      fs.writeFileSync(path.join(imgDir, 'data.json'), '{}');
    });

    test('returns only image files', () => {
      const files = getImageFiles(imgDir);
      expect(files.length).toBe(2);
      expect(files.every((f) => /\.(png|jpg)$/i.test(f))).toBe(true);
    });

    test('returns files sorted alphabetically', () => {
      const files = getImageFiles(imgDir);
      const names = files.map((f) => path.basename(f));
      expect(names).toEqual([...names].sort());
    });

    test('returns empty array for empty folder', async () => {
      const emptyDir = path.join(testDir, 'empty_dir');
      await fs.promises.mkdir(emptyDir, { recursive: true });
      expect(getImageFiles(emptyDir)).toEqual([]);
    });
  });

  // ── checkForSubfolders ─────────────────────────────────────────────

  describe('checkForSubfolders', () => {
    test('returns true when subfolders exist', async () => {
      const dir = path.join(testDir, 'has_subs');
      await fs.promises.mkdir(path.join(dir, 'child'), { recursive: true });
      expect(checkForSubfolders(dir)).toBe(true);
    });

    test('returns false when no subfolders', async () => {
      const dir = path.join(testDir, 'no_subs');
      await fs.promises.mkdir(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'file.txt'), 'hello');
      expect(checkForSubfolders(dir)).toBe(false);
    });
  });

  // ── scanFolder ─────────────────────────────────────────────────────

  describe('scanFolder', () => {
    let scanDir;

    beforeEach(async () => {
      scanDir = await fs.promises.mkdtemp(path.join(testDir, 'scan-'));
    });

    test('detects exact duplicates', async () => {
      const img = await createGradientImage(scanDir, 'a_original.png', 'horizontal');
      await fs.promises.copyFile(img, path.join(scanDir, 'b_copy.png'));

      const results = await scanFolder(scanDir, { mode: 'exact', threshold: 10 });

      expect(results.exactDuplicates.length).toBe(1);
      expect(path.basename(results.exactDuplicates[0].filePath)).toBe('b_copy.png');
      expect(path.basename(results.exactDuplicates[0].keptFile)).toBe('a_original.png');
      expect(results.perceptualDuplicates.length).toBe(0);
    });

    test('detects perceptual duplicates (resized)', async () => {
      const img = await createGradientImage(scanDir, 'a_original.png', 'horizontal');
      // Create a resized version (different file size = different exact hash)
      await sharp(img).resize(200, 200).toFile(path.join(scanDir, 'b_resized.png'));

      const results = await scanFolder(scanDir, { mode: 'perceptual', threshold: 10 });

      expect(results.perceptualDuplicates.length).toBe(1);
      expect(results.exactDuplicates.length).toBe(0);
    });

    test('combined mode finds exact first, then perceptual', async () => {
      // Create 3 images: original, exact copy, resized
      const img = await createGradientImage(scanDir, 'a_original.png', 'horizontal');
      await fs.promises.copyFile(img, path.join(scanDir, 'b_exact_copy.png'));
      await sharp(img).resize(200, 200).toFile(path.join(scanDir, 'c_resized.png'));

      const results = await scanFolder(scanDir, { mode: 'both', threshold: 10 });

      // b_exact_copy should be found as exact duplicate
      expect(results.exactDuplicates.length).toBe(1);
      expect(path.basename(results.exactDuplicates[0].filePath)).toBe('b_exact_copy.png');

      // c_resized should be found as perceptual duplicate (not exact)
      expect(results.perceptualDuplicates.length).toBe(1);
      expect(path.basename(results.perceptualDuplicates[0].filePath)).toBe('c_resized.png');
    });

    test('returns no duplicates for unique images', async () => {
      await createGradientImage(scanDir, 'a.png', 'horizontal');
      await createGradientImage(scanDir, 'b.png', 'vertical');

      const results = await scanFolder(scanDir, { mode: 'both', threshold: 5 });

      expect(results.exactDuplicates.length).toBe(0);
      expect(results.perceptualDuplicates.length).toBe(0);
    });

    test('reports correct totalFiles', async () => {
      await createSolidImage(scanDir, 'a.png', 10, 20, 30);
      await createSolidImage(scanDir, 'b.png', 40, 50, 60);
      fs.writeFileSync(path.join(scanDir, 'notes.txt'), 'not an image');

      const results = await scanFolder(scanDir, { mode: 'exact', threshold: 10 });
      expect(results.totalFiles).toBe(2);
    });

    test('calls progressCallback with expected shape', async () => {
      await createSolidImage(scanDir, 'a.png', 100, 100, 100);

      const progressCalls = [];
      await scanFolder(scanDir, { mode: 'exact', threshold: 10 }, (p) => progressCalls.push(p));

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[0]).toEqual(expect.objectContaining({
        current: expect.any(Number),
        total: expect.any(Number),
        currentFile: expect.any(String),
        phase: 'exact',
      }));
    });
  });
});
