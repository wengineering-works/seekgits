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

export async function filterSmudgeCommand(_args: string[]): Promise<void> {
  try {
    // Read encrypted content from stdin
    const input = await readStdin();

    if (!input.trim()) {
      // Empty input, pass through
      return;
    }

    let encryptedContent: string;

    // Try to parse as JSON (EncryptedFile format)
    try {
      const parsed: EncryptedFile = JSON.parse(input);
      if (parsed.encrypted) {
        encryptedContent = parsed.encrypted;
      } else {
        // Not in expected format, might be plaintext already
        process.stdout.write(input);
        return;
      }
    } catch {
      // Not JSON, might be raw GPG message or plaintext
      // Try to decrypt anyway
      encryptedContent = input;
    }

    // Attempt to decrypt
    try {
      const decrypted = await decrypt(encryptedContent);
      process.stdout.write(decrypted);
    } catch {
      // Decryption failed, pass through original content
      // This handles cases where the file is already plaintext
      process.stdout.write(input);
    }
  } catch (error) {
    // On error, try to pass through original content
    console.error(`seekgits filter-smudge error: ${(error as Error).message}`);

    try {
      const content = await readStdin();
      process.stdout.write(content);
    } catch {
      process.exit(1);
    }
  }
}
