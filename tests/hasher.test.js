'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');
const {
  computeExactHash,
  computePerceptualHash,
  hammingDistance,
  arePerceptuallySimilar,
} = require('../src/main/hasher');

describe('Hasher Module', () => {
  let testDir;
  let horizImage; // horizontal gradient
  let vertImage;  // vertical gradient
  let horizCopy;  // exact copy of horizImage
  let horizResized; // resized horizImage (perceptual duplicate)

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hasher-test-'));

    horizImage   = path.join(testDir, 'horiz.png');
    vertImage    = path.join(testDir, 'vert.png');
    horizCopy    = path.join(testDir, 'horiz_copy.png');
    horizResized = path.join(testDir, 'horiz_resized.png');

    // ── Create horizontal gradient (left=black → right=white) ──────
    const width = 100, height = 100, channels = 3;
    const horizBuf = Buffer.alloc(width * height * channels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const v = Math.floor((x / (width - 1)) * 255);
        horizBuf[idx] = v;
        horizBuf[idx + 1] = v;
        horizBuf[idx + 2] = v;
      }
    }
    await sharp(horizBuf, { raw: { width, height, channels } })
      .png()
      .toFile(horizImage);

    // ── Create vertical gradient (top=black → bottom=white) ────────
    const vertBuf = Buffer.alloc(width * height * channels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const v = Math.floor((y / (height - 1)) * 255);
        vertBuf[idx] = v;
        vertBuf[idx + 1] = v;
        vertBuf[idx + 2] = v;
      }
    }
    await sharp(vertBuf, { raw: { width, height, channels } })
      .png()
      .toFile(vertImage);

    // ── Exact copy ─────────────────────────────────────────────────
    await fs.promises.copyFile(horizImage, horizCopy);

    // ── Resized version (perceptual duplicate) ─────────────────────
    await sharp(horizImage).resize(200, 200).toFile(horizResized);
  });

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  // ── Exact Hashing ────────────────────────────────────────────────────

  describe('computeExactHash', () => {
    test('returns a 64-char hex string (SHA-256)', async () => {
      const hash = await computeExactHash(horizImage);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('returns the same hash for identical files', async () => {
      const hash1 = await computeExactHash(horizImage);
      const hash2 = await computeExactHash(horizCopy);
      expect(hash1).toBe(hash2);
    });

    test('returns different hashes for different files', async () => {
      const hash1 = await computeExactHash(horizImage);
      const hash2 = await computeExactHash(vertImage);
      expect(hash1).not.toBe(hash2);
    });

    test('returns different hash for resized image', async () => {
      const hash1 = await computeExactHash(horizImage);
      const hash2 = await computeExactHash(horizResized);
      expect(hash1).not.toBe(hash2);
    });
  });

  // ── Perceptual Hashing ───────────────────────────────────────────────

  describe('computePerceptualHash', () => {
    test('returns a 16-char hex string', async () => {
      const hash = await computePerceptualHash(horizImage);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    test('returns identical hash for exact copy', async () => {
      const hash1 = await computePerceptualHash(horizImage);
      const hash2 = await computePerceptualHash(horizCopy);
      expect(hash1).toBe(hash2);
    });

    test('returns similar hash for resized image', async () => {
      const hash1 = await computePerceptualHash(horizImage);
      const hash2 = await computePerceptualHash(horizResized);
      const dist = hammingDistance(hash1, hash2);
      expect(dist).toBeLessThanOrEqual(5);
    });

    test('returns different hash for visually different image', async () => {
      const hash1 = await computePerceptualHash(horizImage);
      const hash2 = await computePerceptualHash(vertImage);
      const dist = hammingDistance(hash1, hash2);
      expect(dist).toBeGreaterThan(10);
    });
  });

  // ── Hamming Distance ─────────────────────────────────────────────────

  describe('hammingDistance', () => {
    test('returns 0 for identical hashes', () => {
      expect(hammingDistance('abcdef0123456789', 'abcdef0123456789')).toBe(0);
    });

    test('returns correct count for known inputs', () => {
      // 0x00 vs 0x01 → 1 bit difference
      expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
    });

    test('returns 64 for fully inverted hashes', () => {
      expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
    });
  });

  // ── Perceptual Similarity ────────────────────────────────────────────

  describe('arePerceptuallySimilar', () => {
    test('returns true for identical hashes', () => {
      expect(arePerceptuallySimilar('abcdef0123456789', 'abcdef0123456789')).toBe(true);
    });

    test('returns true when within threshold', () => {
      // 1 bit difference, threshold 10
      expect(arePerceptuallySimilar('0000000000000000', '0000000000000001', 10)).toBe(true);
    });

    test('returns false when exceeding threshold', () => {
      // 64 bit difference, threshold 10
      expect(arePerceptuallySimilar('0000000000000000', 'ffffffffffffffff', 10)).toBe(false);
    });

    test('respects custom threshold', () => {
      // 1 bit difference, threshold 0
      expect(arePerceptuallySimilar('0000000000000000', '0000000000000001', 0)).toBe(false);
    });
  });
});
