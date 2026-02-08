import { getKeysSorted, secretsExists } from '../lib/secrets';
import { encryptMultiRecipient } from '../lib/gpg';
import { normalizeFilePath } from '../lib/config';
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

export async function filterCleanCommand(args: string[]): Promise<void> {
  try {
    // Get filename from argument (the %f from git config)
    if (args.length < 1) {
      // No filename provided, pass through
      const content = await readStdin();
      process.stdout.write(content);
      return;
    }

    const filename = normalizeFilePath(args[0]);

    // Read content from stdin
    const content = await readStdin();

    // Check if secrets.json exists
    if (!(await secretsExists())) {
      // Not initialized, pass through unchanged
      process.stdout.write(content);
      return;
    }

    // Get allowed keys for this file
    const keys = await getKeysSorted(filename);

    if (keys.length === 0) {
      // File not tracked, pass through unchanged
      process.stdout.write(content);
      return;
    }

    // Encrypt for all recipients
    const encrypted = await encryptMultiRecipient(content, keys);

    // Create encrypted file structure
    const encryptedFile: EncryptedFile = {
      encrypted,
      recipients: keys,
    };

    // Output JSON
    const output = JSON.stringify(encryptedFile, null, 2) + '\n';
    process.stdout.write(output);
  } catch (error) {
    // On error, log to stderr and pass through original content
    console.error(`seekgits filter-clean error: ${(error as Error).message}`);

    // Try to read and pass through stdin if we haven't already
    try {
      const content = await readStdin();
      process.stdout.write(content);
    } catch {
      // If we can't read stdin, exit with error
      process.exit(1);
    }
  }
}
