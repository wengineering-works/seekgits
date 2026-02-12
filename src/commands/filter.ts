import { readFile } from 'fs/promises';
import { getFileKey, isFileTracked, secretsExists } from '../lib/secrets';
import { encrypt, decrypt, isEncrypted } from '../lib/crypto';

async function readStdin(): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Git filter commands
 * - encrypt: clean filter (working dir -> git)
 * - decrypt: smudge filter (git -> working dir)
 *
 * For clean/smudge: reads from stdin
 * For textconv: receives temp file path as extra arg from git
 */
export async function filterCommand(action: 'encrypt' | 'decrypt', file: string, tempfile?: string): Promise<void> {
  let input: Buffer;

  if (tempfile) {
    // textconv mode - read from temp file provided by git
    input = await readFile(tempfile);
  } else {
    // clean/smudge mode - read from stdin
    input = await readStdin();
  }


  // Check if secrets.json exists
  if (!await secretsExists()) {
    // Not initialized - pass through unchanged
    process.stdout.write(input);
    return;
  }

  // Check if file is tracked
  if (!await isFileTracked(file)) {
    // Not tracked - pass through unchanged
    process.stdout.write(input);
    return;
  }

  if (action === 'encrypt') {
    await handleEncrypt(file, input);
  } else {
    await handleDecrypt(file, input);
  }
}

async function handleEncrypt(file: string, plaintext: Buffer): Promise<void> {
  // If already encrypted, pass through (prevents double encryption)
  if (isEncrypted(plaintext)) {
    process.stdout.write(plaintext);
    return;
  }

  try {
    const fileKey = await getFileKey(file);
    const encrypted = encrypt(plaintext, fileKey);
    process.stdout.write(encrypted);
  } catch (error) {
    // If we can't encrypt (no key access), pass through plaintext
    // This allows viewing the file even without decrypt access
    // Git will show it as modified, but that's better than failing
    console.error(`Warning: Could not encrypt ${file}: ${(error as Error).message}`);
    process.stdout.write(plaintext);
  }
}

async function handleDecrypt(file: string, ciphertext: Buffer): Promise<void> {
  // If not encrypted, pass through (might be plaintext in history)
  if (!isEncrypted(ciphertext)) {
    process.stdout.write(ciphertext);
    return;
  }

  try {
    const fileKey = await getFileKey(file);
    const decrypted = decrypt(ciphertext, fileKey);
    process.stdout.write(decrypted);
  } catch (error) {
    // If we can't decrypt, output something useful
    console.error(`Warning: Could not decrypt ${file}: ${(error as Error).message}`);
    // Output a placeholder so the user knows something is wrong
    process.stdout.write(Buffer.from(`[ENCRYPTED: Cannot decrypt ${file}]\n`));
  }
}
