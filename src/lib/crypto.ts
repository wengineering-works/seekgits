import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import {
  MAGIC_HEADER,
  AES_KEY_SIZE,
  HMAC_KEY_SIZE,
  FILE_KEY_SIZE,
  NONCE_SIZE,
  AES_IV_SIZE,
} from '../types';

/**
 * Generate a new 64-byte file key (32 bytes AES + 32 bytes HMAC)
 */
export function generateFileKey(): Buffer {
  return randomBytes(FILE_KEY_SIZE);
}

/**
 * Split a file key into AES and HMAC components
 */
export function splitFileKey(fileKey: Buffer): { aesKey: Buffer; hmacKey: Buffer } {
  if (fileKey.length !== FILE_KEY_SIZE) {
    throw new Error(`Invalid file key size: expected ${FILE_KEY_SIZE}, got ${fileKey.length}`);
  }
  return {
    aesKey: fileKey.subarray(0, AES_KEY_SIZE),
    hmacKey: fileKey.subarray(AES_KEY_SIZE, AES_KEY_SIZE + HMAC_KEY_SIZE),
  };
}

/**
 * Compute deterministic nonce from plaintext using HMAC-SHA256
 */
function computeNonce(hmacKey: Buffer, plaintext: Buffer): Buffer {
  const hmac = createHmac('sha256', hmacKey);
  hmac.update(plaintext);
  return hmac.digest(); // 32 bytes
}

/**
 * Encrypt plaintext using AES-256-CTR with deterministic nonce
 *
 * Output format:
 * - Bytes 0-9: Magic header (\0SEEKGITS\0)
 * - Bytes 10-41: HMAC-SHA256 nonce (32 bytes)
 * - Bytes 42+: AES-256-CTR ciphertext
 */
export function encrypt(plaintext: Buffer, fileKey: Buffer): Buffer {
  const { aesKey, hmacKey } = splitFileKey(fileKey);

  // Derive nonce from plaintext (deterministic!)
  const nonce = computeNonce(hmacKey, plaintext);

  // Use first 16 bytes of nonce as IV for AES-CTR
  const iv = nonce.subarray(0, AES_IV_SIZE);

  // Encrypt with AES-256-CTR
  const cipher = createCipheriv('aes-256-ctr', aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  // Build output: header + nonce + ciphertext
  return Buffer.concat([MAGIC_HEADER, nonce, ciphertext]);
}

/**
 * Decrypt ciphertext encrypted with encrypt()
 */
export function decrypt(encrypted: Buffer, fileKey: Buffer): Buffer {
  // Verify magic header
  if (!encrypted.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER)) {
    throw new Error('Invalid encrypted file: missing SEEKGITS header');
  }

  const { aesKey } = splitFileKey(fileKey);

  // Extract nonce (bytes 10-41)
  const nonceStart = MAGIC_HEADER.length;
  const nonce = encrypted.subarray(nonceStart, nonceStart + NONCE_SIZE);

  // Extract ciphertext (bytes 42+)
  const ciphertextStart = nonceStart + NONCE_SIZE;
  const ciphertext = encrypted.subarray(ciphertextStart);

  // Use first 16 bytes of nonce as IV
  const iv = nonce.subarray(0, AES_IV_SIZE);

  // Decrypt with AES-256-CTR
  const decipher = createDecipheriv('aes-256-ctr', aesKey, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Check if a buffer appears to be encrypted by SeekGits
 */
export function isEncrypted(data: Buffer): boolean {
  if (data.length < MAGIC_HEADER.length) {
    return false;
  }
  return data.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER);
}
