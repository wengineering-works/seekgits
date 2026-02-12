/**
 * Configuration stored in secrets.json
 */
export interface SecretsConfig {
  version: number;
  files: Record<string, FileConfig>;
}

/**
 * Per-file configuration
 */
export interface FileConfig {
  keys: Record<string, string>; // recipient -> GPG-encrypted file key
}

/**
 * GPG key information
 */
export interface GPGKey {
  id: string;
  fingerprint?: string;
  email?: string;
  name?: string;
}

/**
 * Result from GPG command execution
 */
export interface GPGResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Magic header for encrypted files
 */
export const MAGIC_HEADER = Buffer.from('\0SEEKGITS\0');

/**
 * File key sizes
 */
export const AES_KEY_SIZE = 32;  // 256 bits
export const HMAC_KEY_SIZE = 32; // 256 bits
export const FILE_KEY_SIZE = AES_KEY_SIZE + HMAC_KEY_SIZE; // 64 bytes

/**
 * Nonce size (HMAC-SHA256 output)
 */
export const NONCE_SIZE = 32;

/**
 * AES-CTR IV size (first 16 bytes of nonce)
 */
export const AES_IV_SIZE = 16;
