'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Supported image file extensions (lowercase, with leading dot).
 */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', '.gif'];

/**
 * Generates a timestamped folder name in the format 'DuplicatescanMMDDHHMM'.
 * MM = month (01-12), DD = day (01-31), HH = hour (00-23), MM = minute (00-59).
 * @param {Date} [date] - Optional date to use (defaults to current date/time)
 * @returns {string} Folder name string
 */
function getTimestampedFolderName(date = new Date()) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `Duplicatescan${mm}${dd}${hh}${min}`;
}

/**
 * Creates the output folder structure for duplicate files.
 * Structure: basePath/DuplicatescanMMDDHHMM/Exact/  and  .../Perceptual/
 * @param {string} basePath - Parent directory where the output folder will be created
 * @param {Date} [date] - Optional date for the folder name (useful for testing)
 * @returns {Promise<string>} Full path to the created output folder
 */
async function createOutputFolder(basePath, date) {
  const folderName = getTimestampedFolderName(date);
  const outputFolder = path.join(basePath, folderName);
  const exactFolder = path.join(outputFolder, 'Exact');
  const perceptualFolder = path.join(outputFolder, 'Perceptual');

  await fs.promises.mkdir(exactFolder, { recursive: true });
  await fs.promises.mkdir(perceptualFolder, { recursive: true });

  return outputFolder;
}

/**
 * Generates a unique file path to avoid overwriting existing files.
 * If "photo.jpg" exists, tries "photo_1.jpg", "photo_2.jpg", etc.
 * @param {string} destDir - Destination directory
 * @param {string} fileName - Original filename
 * @returns {string} Unique absolute file path
 */
function getUniqueFilePath(destDir, fileName) {
  let destPath = path.join(destDir, fileName);
  if (!fs.existsSync(destPath)) {
    return destPath;
  }

  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let counter = 1;
  while (fs.existsSync(destPath)) {
    destPath = path.join(destDir, `${base}_${counter}${ext}`);
    counter++;
  }
  return destPath;
}

/**
 * Moves duplicate files to the appropriate subdirectory (Exact/ or Perceptual/).
 * Uses rename if possible (same filesystem), otherwise copies and deletes.
 * @param {Array<{filePath: string, reason: 'exact'|'perceptual'}>} duplicates
 * @param {string} outputFolder - Path to the output folder (contains Exact/ and Perceptual/)
 * @returns {Promise<{moved: number, errors: string[], movedFiles: Array<{original: string, destination: string, reason: string}>}>}
 */
async function moveDuplicates(duplicates, outputFolder) {
  const results = { moved: 0, errors: [], movedFiles: [] };

  for (const dup of duplicates) {
    const subFolder = dup.reason === 'exact' ? 'Exact' : 'Perceptual';
    const destDir = path.join(outputFolder, subFolder);
    const fileName = path.basename(dup.filePath);
    const destPath = getUniqueFilePath(destDir, fileName);

    try {
      // Try rename first (fast, same-filesystem move)
      try {
        await fs.promises.rename(dup.filePath, destPath);
      } catch (renameErr) {
        // EXDEV = cross-device link → must copy + delete
        if (renameErr.code === 'EXDEV') {
          await fs.promises.copyFile(dup.filePath, destPath);
          await fs.promises.unlink(dup.filePath);
        } else {
          throw renameErr;
        }
      }

      results.moved++;
      results.movedFiles.push({
        original: dup.filePath,
        destination: destPath,
        reason: dup.reason,
      });
    } catch (err) {
      results.errors.push(`Failed to move ${dup.filePath}: ${err.message}`);
    }
  }

  return results;
}

module.exports = {
  IMAGE_EXTENSIONS,
  getTimestampedFolderName,
  createOutputFolder,
  moveDuplicates,
  getUniqueFilePath,
};
