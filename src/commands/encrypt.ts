import { readFile } from 'fs/promises';
import { getKeysSorted } from '../lib/secrets';
import { encryptMultiRecipient } from '../lib/gpg';
import { normalizeFilePath } from '../lib/config';
import type { EncryptedFile } from '../types';

export async function encryptCommand(args: string[]): Promise<void> {
  try {
    if (args.length < 1) {
      console.error(`Usage: seekgits encrypt <file>

Encrypt a file manually (for testing/debugging).
The file must be tracked in secrets.json.

Example:
  seekgits encrypt .env`);
      process.exit(1);
    }

    const filename = normalizeFilePath(args[0]);

    // Get allowed keys for this file
    const keys = await getKeysSorted(filename);

    if (keys.length === 0) {
      console.error(`Error: File "${filename}" is not tracked or has no allowed keys.

Add keys with:
  seekgits allow ${filename} <gpg-key-id>`);
      process.exit(1);
    }

    // Read the plaintext file
    let content: string;
    try {
      content = await readFile(filename, 'utf-8');
    } catch (error) {
      console.error(`Error: Failed to read file "${filename}": ${(error as Error).message}`);
      process.exit(1);
    }

    // Encrypt for all recipients
    const encrypted = await encryptMultiRecipient(content, keys);

    // Create encrypted file structure
    const encryptedFile: EncryptedFile = {
      encrypted,
      allowed_keys: keys,
    };

    // Output JSON to stdout
    console.log(JSON.stringify(encryptedFile, null, 2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
