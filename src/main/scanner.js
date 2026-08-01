'use strict';

const fs = require('fs');
const path = require('path');
const { computeExactHash, computePerceptualHash, hammingDistance, arePerceptuallySimilar } = require('./hasher');
const { IMAGE_EXTENSIONS } = require('./fileManager');

/**
 * Gets all image files in a folder (non-recursive, top-level only).
 * @param {string} folderPath - Absolute path to the folder
 * @returns {string[]} Array of absolute file paths, sorted alphabetically
 */
function getImageFiles(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  return entries
    .filter((entry) => {
      if (!entry.isFile()) return false;
      const ext = path.extname(entry.name).toLowerCase();
      return IMAGE_EXTENSIONS.includes(ext);
    })
    .map((entry) => path.join(folderPath, entry.name))
    .sort();
}

/**
 * Checks if a folder contains any subdirectories.
 * @param {string} folderPath - Absolute path to the folder
 * @returns {boolean} true if subdirectories exist
 */
function checkForSubfolders(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  return entries.some((entry) => entry.isDirectory());
}

/**
 * Scans a folder for duplicate images using exact and/or perceptual hashing.
 *
 * Workflow for 'both' mode:
 *   1. Compute SHA-256 for every image → group by hash → mark duplicates
 *   2. Remove exact duplicates from the candidate pool
 *   3. Compute dHash for remaining images → find clusters within threshold → mark duplicates
 *
 * For each duplicate group the first file alphabetically is kept; the rest are duplicates.
 *
 * @param {string} folderPath - Absolute path to the folder to scan
 * @param {Object} options
 * @param {'exact'|'perceptual'|'both'} options.mode - Scanning mode
 * @param {number} options.threshold - Hamming distance threshold for perceptual comparison
 * @param {Function} [progressCallback] - Called with { current, total, currentFile, phase }
 * @returns {Promise<{exactDuplicates: Array, perceptualDuplicates: Array, totalFiles: number}>}
 */
async function scanFolder(folderPath, options, progressCallback) {
  const { mode = 'both', threshold = 10 } = options || {};
  const imageFiles = getImageFiles(folderPath);
  const totalFiles = imageFiles.length;

  const exactDuplicates = [];
  const perceptualDuplicates = [];
  const exactDuplicateSet = new Set(); // tracks files marked as exact dupes

  // ── Phase 1: Exact duplicate detection ───────────────────────────────
  if (mode === 'exact' || mode === 'both') {
    const hashMap = new Map(); // SHA-256 hash → [filePaths]

    for (let i = 0; i < imageFiles.length; i++) {
      const filePath = imageFiles[i];
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: totalFiles,
          currentFile: path.basename(filePath),
          phase: 'exact',
        });
      }

      try {
        const hash = await computeExactHash(filePath);
        if (!hashMap.has(hash)) {
          hashMap.set(hash, []);
        }
        hashMap.get(hash).push(filePath);
      } catch (err) {
        console.warn(`Skipping file (exact hash error): ${filePath} — ${err.message}`);
      }
    }

    // For each hash group with >1 file, keep the first alphabetically
    for (const [hash, files] of hashMap) {
      if (files.length > 1) {
        const sorted = [...files].sort();
        const kept = sorted[0];
        for (let i = 1; i < sorted.length; i++) {
          exactDuplicates.push({
            filePath: sorted[i],
            hash,
            keptFile: kept,
          });
          exactDuplicateSet.add(sorted[i]);
        }
      }
    }
  }

  // ── Phase 2: Perceptual duplicate detection ──────────────────────────
  if (mode === 'perceptual' || mode === 'both') {
    // Exclude files already flagged as exact duplicates
    const filesToCheck = imageFiles.filter((f) => !exactDuplicateSet.has(f));
    const perceptualHashes = []; // { filePath, hash }

    for (let i = 0; i < filesToCheck.length; i++) {
      const filePath = filesToCheck[i];
      if (progressCallback) {
        progressCallback({
          current: i + 1,
          total: filesToCheck.length,
          currentFile: path.basename(filePath),
          phase: 'perceptual',
        });
      }

      try {
        const hash = await computePerceptualHash(filePath);
        perceptualHashes.push({ filePath, hash });
      } catch (err) {
        console.warn(`Skipping file (perceptual hash error): ${filePath} — ${err.message}`);
      }
    }

    // Pairwise comparison — seed-based grouping
    const perceptualDuplicateSet = new Set();

    for (let i = 0; i < perceptualHashes.length; i++) {
      if (perceptualDuplicateSet.has(perceptualHashes[i].filePath)) continue;

      const group = [perceptualHashes[i]];

      for (let j = i + 1; j < perceptualHashes.length; j++) {
        if (perceptualDuplicateSet.has(perceptualHashes[j].filePath)) continue;

        if (arePerceptuallySimilar(perceptualHashes[i].hash, perceptualHashes[j].hash, threshold)) {
          group.push(perceptualHashes[j]);
        }
      }

      if (group.length > 1) {
        // Keep first alphabetically, mark rest as perceptual duplicates
        group.sort((a, b) => a.filePath.localeCompare(b.filePath));
        const kept = group[0];
        for (let k = 1; k < group.length; k++) {
          perceptualDuplicates.push({
            filePath: group[k].filePath,
            hash: group[k].hash,
            keptFile: kept.filePath,
            distance: hammingDistance(kept.hash, group[k].hash),
          });
          perceptualDuplicateSet.add(group[k].filePath);
        }
      }
    }
  }

  return {
    exactDuplicates,
    perceptualDuplicates,
    totalFiles,
  };
}

module.exports = {
  scanFolder,
  getImageFiles,
  checkForSubfolders,
};
