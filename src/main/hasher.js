'use strict';

const crypto = require('crypto');
const fs = require('fs');
const sharp = require('sharp');

/**
 * Computes SHA-256 hash of a file's contents using streaming.
 * Streaming avoids loading the entire file into memory.
 * @param {string} filePath - Absolute path to the file
 * @returns {Promise<string>} Hex digest of SHA-256 hash
 */
async function computeExactHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

/**
 * Computes a 64-bit difference hash (dHash) for perceptual image comparison.
 *
 * Algorithm:
 *   1. Resize image to 9×8 grayscale (9 columns to get 8 horizontal differences)
 *   2. For each of the 8 rows, compare adjacent pixels left-to-right
 *   3. If left pixel intensity < right pixel intensity → bit = 1, else bit = 0
 *   4. This produces 8 bits/row × 8 rows = 64 bits total
 *
 * The dHash is robust against resizing, recompression, and minor color shifts
 * because it captures relative luminance gradients, not absolute pixel values.
 *
 * @param {string} filePath - Absolute path to the image file
 * @returns {Promise<string>} 16-character hex string representing the 64-bit dHash
 */
async function computePerceptualHash(filePath) {
  const { data } = await sharp(filePath)
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left < right ? '1' : '0';
    }
  }

  // Convert binary string to 16-char hex. padStart ensures leading zeros are preserved.
  return BigInt('0b' + bits).toString(16).padStart(16, '0');
}

/**
 * Computes the Hamming distance between two hex hash strings.
 * Hamming distance = number of bit positions where the two hashes differ.
 * @param {string} hex1 - First hex string (16 chars)
 * @param {string} hex2 - Second hex string (16 chars)
 * @returns {number} Number of differing bits (0–64)
 */
function hammingDistance(hex1, hex2) {
  const buf1 = Buffer.from(hex1, 'hex');
  const buf2 = Buffer.from(hex2, 'hex');
  let distance = 0;
  for (let i = 0; i < buf1.length; i++) {
    let xor = buf1[i] ^ buf2[i];
    // Brian Kernighan's bit-counting trick
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Determines if two perceptual hashes are similar enough to be considered duplicates.
 * @param {string} hex1 - First perceptual hash hex string
 * @param {string} hex2 - Second perceptual hash hex string
 * @param {number} [threshold=10] - Maximum Hamming distance to consider similar
 * @returns {boolean} true if the images are perceptually similar
 */
function arePerceptuallySimilar(hex1, hex2, threshold = 10) {
  return hammingDistance(hex1, hex2) <= threshold;
}

module.exports = {
  computeExactHash,
  computePerceptualHash,
  hammingDistance,
  arePerceptuallySimilar,
};
