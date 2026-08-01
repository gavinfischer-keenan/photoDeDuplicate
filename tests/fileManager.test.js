'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  IMAGE_EXTENSIONS,
  getTimestampedFolderName,
  createOutputFolder,
  moveDuplicates,
  getUniqueFilePath,
} = require('../src/main/fileManager');

describe('FileManager Module', () => {
  let testDir;

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'filemgr-test-'));
  });

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  // ── IMAGE_EXTENSIONS ───────────────────────────────────────────────

  describe('IMAGE_EXTENSIONS', () => {
    test('includes common image formats', () => {
      expect(IMAGE_EXTENSIONS).toContain('.jpg');
      expect(IMAGE_EXTENSIONS).toContain('.jpeg');
      expect(IMAGE_EXTENSIONS).toContain('.png');
      expect(IMAGE_EXTENSIONS).toContain('.gif');
      expect(IMAGE_EXTENSIONS).toContain('.bmp');
      expect(IMAGE_EXTENSIONS).toContain('.webp');
      expect(IMAGE_EXTENSIONS).toContain('.tiff');
      expect(IMAGE_EXTENSIONS).toContain('.tif');
    });

    test('does NOT include HEIC', () => {
      expect(IMAGE_EXTENSIONS).not.toContain('.heic');
      expect(IMAGE_EXTENSIONS).not.toContain('.heif');
    });
  });

  // ── getTimestampedFolderName ────────────────────────────────────────

  describe('getTimestampedFolderName', () => {
    test('returns correct format DuplicatescanMMDDHHMM', () => {
      const date = new Date(2026, 6, 31, 15, 30); // July 31, 2026 15:30
      const name = getTimestampedFolderName(date);
      expect(name).toBe('Duplicatescan07311530');
    });

    test('pads single-digit values with zeros', () => {
      const date = new Date(2026, 0, 5, 8, 3); // Jan 5, 2026 08:03
      const name = getTimestampedFolderName(date);
      expect(name).toBe('Duplicatescan01050803');
    });

    test('uses current date when none provided', () => {
      const name = getTimestampedFolderName();
      expect(name).toMatch(/^Duplicatescan\d{8}$/);
    });
  });

  // ── createOutputFolder ─────────────────────────────────────────────

  describe('createOutputFolder', () => {
    test('creates folder with Exact and Perceptual subdirectories', async () => {
      const date = new Date(2026, 6, 31, 12, 0);
      const outputFolder = await createOutputFolder(testDir, date);

      expect(fs.existsSync(outputFolder)).toBe(true);
      expect(fs.existsSync(path.join(outputFolder, 'Exact'))).toBe(true);
      expect(fs.existsSync(path.join(outputFolder, 'Perceptual'))).toBe(true);
    });

    test('returns the correct path', async () => {
      const date = new Date(2026, 0, 1, 0, 0);
      const outputFolder = await createOutputFolder(testDir, date);
      expect(outputFolder).toBe(path.join(testDir, 'Duplicatescan01010000'));
    });
  });

  // ── getUniqueFilePath ──────────────────────────────────────────────

  describe('getUniqueFilePath', () => {
    let uniqueDir;

    beforeAll(async () => {
      uniqueDir = path.join(testDir, 'unique_test');
      await fs.promises.mkdir(uniqueDir, { recursive: true });
    });

    test('returns original path when no conflict', () => {
      const result = getUniqueFilePath(uniqueDir, 'newfile.jpg');
      expect(result).toBe(path.join(uniqueDir, 'newfile.jpg'));
    });

    test('appends _1 when file already exists', async () => {
      const existing = path.join(uniqueDir, 'existing.jpg');
      fs.writeFileSync(existing, 'data');

      const result = getUniqueFilePath(uniqueDir, 'existing.jpg');
      expect(result).toBe(path.join(uniqueDir, 'existing_1.jpg'));
    });

    test('increments counter for multiple conflicts', async () => {
      const base = path.join(uniqueDir, 'multi.jpg');
      fs.writeFileSync(base, 'data');
      fs.writeFileSync(path.join(uniqueDir, 'multi_1.jpg'), 'data');

      const result = getUniqueFilePath(uniqueDir, 'multi.jpg');
      expect(result).toBe(path.join(uniqueDir, 'multi_2.jpg'));
    });
  });

  // ── moveDuplicates ─────────────────────────────────────────────────

  describe('moveDuplicates', () => {
    let moveDir, outputDir;

    beforeEach(async () => {
      moveDir = await fs.promises.mkdtemp(path.join(testDir, 'move-'));
      outputDir = path.join(moveDir, 'output');
      await fs.promises.mkdir(path.join(outputDir, 'Exact'), { recursive: true });
      await fs.promises.mkdir(path.join(outputDir, 'Perceptual'), { recursive: true });
    });

    test('moves exact duplicates to Exact/ folder', async () => {
      const src = path.join(moveDir, 'dup.jpg');
      fs.writeFileSync(src, 'duplicate content');

      const result = await moveDuplicates(
        [{ filePath: src, reason: 'exact' }],
        outputDir
      );

      expect(result.moved).toBe(1);
      expect(fs.existsSync(src)).toBe(false);
      expect(fs.existsSync(path.join(outputDir, 'Exact', 'dup.jpg'))).toBe(true);
    });

    test('moves perceptual duplicates to Perceptual/ folder', async () => {
      const src = path.join(moveDir, 'similar.png');
      fs.writeFileSync(src, 'similar content');

      const result = await moveDuplicates(
        [{ filePath: src, reason: 'perceptual' }],
        outputDir
      );

      expect(result.moved).toBe(1);
      expect(fs.existsSync(src)).toBe(false);
      expect(fs.existsSync(path.join(outputDir, 'Perceptual', 'similar.png'))).toBe(true);
    });

    test('handles filename conflicts during move', async () => {
      const src1 = path.join(moveDir, 'file1.jpg');
      const src2 = path.join(moveDir, 'file2.jpg');
      fs.writeFileSync(src1, 'content 1');
      fs.writeFileSync(src2, 'content 2');

      // Pre-create a file with the same name in the destination
      fs.writeFileSync(path.join(outputDir, 'Exact', 'file1.jpg'), 'existing');

      const result = await moveDuplicates(
        [
          { filePath: src1, reason: 'exact' },
          { filePath: src2, reason: 'exact' },
        ],
        outputDir
      );

      expect(result.moved).toBe(2);
      // file1 should get renamed to file1_1.jpg due to conflict
      expect(fs.existsSync(path.join(outputDir, 'Exact', 'file1_1.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'Exact', 'file2.jpg'))).toBe(true);
    });

    test('records moved file details', async () => {
      const src = path.join(moveDir, 'track.jpg');
      fs.writeFileSync(src, 'track content');

      const result = await moveDuplicates(
        [{ filePath: src, reason: 'exact' }],
        outputDir
      );

      expect(result.movedFiles.length).toBe(1);
      expect(result.movedFiles[0]).toEqual({
        original: src,
        destination: path.join(outputDir, 'Exact', 'track.jpg'),
        reason: 'exact',
      });
    });

    test('reports errors for missing source files', async () => {
      const result = await moveDuplicates(
        [{ filePath: path.join(moveDir, 'nonexistent.jpg'), reason: 'exact' }],
        outputDir
      );

      expect(result.moved).toBe(0);
      expect(result.errors.length).toBe(1);
    });
  });
});
