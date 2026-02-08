import { spawn } from 'child_process';
import type { GPGKey, GPGResult } from '../types';

/**
 * Check if GPG is installed on the system
 */
export async function checkGPGInstalled(): Promise<boolean> {
  try {
    const result = await execGPG(['--version']);
    return result.success;
  } catch {
    return false;
  }
}

/**
 * Show installation instructions for GPG
 */
export function getGPGInstallInstructions(): string {
  return `Error: GPG not found

Install GPG:
  brew install gnupg

After installing, generate a key:
  gpg --gen-key`;
}

/**
 * Execute a GPG command and return the result
 */
async function execGPG(args: string[], input?: string): Promise<GPGResult> {
  return new Promise((resolve) => {
    const gpg = spawn('gpg', args);
    let output = '';
    let error = '';

    if (input) {
      gpg.stdin.write(input);
      gpg.stdin.end();
    }

    gpg.stdout.on('data', (data) => {
      output += data.toString();
    });

    gpg.stderr.on('data', (data) => {
      error += data.toString();
    });

    gpg.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output, error });
      } else {
        resolve({ success: false, output, error });
      }
    });

    gpg.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Encrypt content for multiple GPG recipients
 */
export async function encryptMultiRecipient(
  content: string,
  recipients: string[]
): Promise<string> {
  if (recipients.length === 0) {
    throw new Error('At least one recipient is required');
  }

  // Sort recipients for deterministic output
  const sortedRecipients = [...recipients].sort();

  // Build recipient arguments
  const recipientArgs: string[] = [];
  for (const recipient of sortedRecipients) {
    recipientArgs.push('--recipient', recipient);
  }

  const args = [
    '--encrypt',
    '--armor',
    '--trust-model', 'always', // Skip trust check for automation
    ...recipientArgs,
  ];

  const result = await execGPG(args, content);

  if (!result.success || !result.output) {
    const error = result.error || 'Unknown error';

    // Check if error is due to missing public key
    if (error.includes('No public key') || error.includes('not found') || error.includes('unusable public key')) {
      throw new Error(
        `GPG encryption failed: Missing public key.\n\n` +
        `You need to import the public keys for all recipients:\n` +
        `  ${sortedRecipients.join(', ')}\n\n` +
        `Get the public key from your teammate and run:\n` +
        `  gpg --import teammate-key.asc\n\n` +
        `Original error: ${error}`
      );
    }

    throw new Error(`GPG encryption failed: ${error}`);
  }

  return result.output;
}

/**
 * Decrypt GPG encrypted content
 */
export async function decrypt(encryptedContent: string): Promise<string> {
  const args = ['--decrypt', '--quiet'];

  const result = await execGPG(args, encryptedContent);

  if (!result.success || !result.output) {
    throw new Error(`GPG decryption failed: ${result.error || 'Unknown error'}`);
  }

  return result.output;
}

/**
 * List all GPG keys in the keyring
 */
export async function listKeys(): Promise<GPGKey[]> {
  const args = ['--list-keys', '--with-colons'];
  const result = await execGPG(args);

  if (!result.success || !result.output) {
    return [];
  }

  const keys: GPGKey[] = [];
  const lines = result.output.split('\n');

  let currentKey: Partial<GPGKey> | null = null;

  for (const line of lines) {
    const fields = line.split(':');
    const recordType = fields[0];

    if (recordType === 'pub') {
      // Start of a new key
      if (currentKey && currentKey.id) {
        keys.push(currentKey as GPGKey);
      }
      currentKey = {
        id: fields[4], // Key ID
        fingerprint: fields[9],
      };
    } else if (recordType === 'uid' && currentKey) {
      // User ID line contains name and email
      const uid = fields[9];
      const emailMatch = uid.match(/<(.+?)>/);
      const nameMatch = uid.match(/^([^<]+)/);

      if (emailMatch) {
        currentKey.email = emailMatch[1];
      }
      if (nameMatch) {
        currentKey.name = nameMatch[1].trim();
      }
    }
  }

  // Add the last key
  if (currentKey && currentKey.id) {
    keys.push(currentKey as GPGKey);
  }

  return keys;
}

/**
 * Get the default GPG key ID (first secret key)
 */
export async function getDefaultKeyId(): Promise<string | null> {
  const args = ['--list-secret-keys', '--with-colons'];
  const result = await execGPG(args);

  if (!result.success || !result.output) {
    return null;
  }

  const lines = result.output.split('\n');

  for (const line of lines) {
    const fields = line.split(':');
    const recordType = fields[0];

    if (recordType === 'sec') {
      // Secret key record
      return fields[4]; // Key ID
    }
  }

  return null;
}

/**
 * Get key identifier (email or ID) for display
 */
export async function getKeyIdentifier(keyId: string): Promise<string> {
  const keys = await listKeys();
  const key = keys.find((k) => k.id === keyId || k.email === keyId || k.fingerprint === keyId);

  if (key && key.email) {
    return key.email;
  }

  return keyId;
}

/**
 * Verify that a key exists in the keyring
 */
export async function verifyKeyExists(keyIdentifier: string): Promise<boolean> {
  const keys = await listKeys();
  return keys.some(
    (k) =>
      k.id === keyIdentifier ||
      k.email === keyIdentifier ||
      k.fingerprint === keyIdentifier
  );
}
