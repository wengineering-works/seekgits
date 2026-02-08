import { readFile } from 'fs/promises';
import { decrypt } from '../lib/gpg';
import type { EncryptedFile } from '../types';

/**
 * Read from stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

export async function decryptCommand(args: string[]): Promise<void> {
  try {
    let input: string;

    // Read from file argument or stdin
    if (args.length > 0) {
      const filename = args[0];
      try {
        input = await readFile(filename, 'utf-8');
      } catch (error) {
        console.error(`Error: Failed to read file "${filename}": ${(error as Error).message}`);
        process.exit(1);
      }
    } else {
      // Read from stdin
      input = await readStdin();
    }

    if (!input.trim()) {
      console.error('Error: No input provided');
      process.exit(1);
    }

    let encryptedContent: string;

    // Try to parse as JSON (EncryptedFile format)
    try {
      const parsed: EncryptedFile = JSON.parse(input);
      if (parsed.encrypted) {
        encryptedContent = parsed.encrypted;
      } else {
        // Not in expected format, treat as raw GPG message
        encryptedContent = input;
      }
    } catch {
      // Not JSON, treat as raw GPG message
      encryptedContent = input;
    }

    // Decrypt
    const decrypted = await decrypt(encryptedContent);

    // Output plaintext to stdout
    process.stdout.write(decrypted);
  } catch (error) {
    const errorMsg = (error as Error).message;

    if (errorMsg.includes('decryption failed')) {
      console.error(`Error: Decryption failed

This can happen if:
  - You don't have the private key needed to decrypt
  - The file is not properly encrypted
  - The encrypted data is corrupted

Check that your GPG key is in the allowed_keys list.`);
    } else {
      console.error(`Error: ${errorMsg}`);
    }

    process.exit(1);
  }
}
