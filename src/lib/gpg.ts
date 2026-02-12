import { spawn } from 'child_process';
import type { GPGKey, GPGResult } from '../types';

/**
 * Result with raw buffer output for binary data
 */
interface GPGResultWithBuffer extends GPGResult {
  outputBuffer?: Buffer;
}

/**
 * Execute a GPG command and return the result
 */
async function execGPG(args: string[], input?: Buffer | string): Promise<GPGResultWithBuffer> {
  return new Promise((resolve) => {
    const gpg = spawn('gpg', args);
    const outputChunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    if (input) {
      gpg.stdin.write(input);
      gpg.stdin.end();
    }

    gpg.stdout.on('data', (data) => {
      outputChunks.push(data);
    });

    gpg.stderr.on('data', (data) => {
      errorChunks.push(data);
    });

    gpg.on('close', (code) => {
      const outputBuffer = Buffer.concat(outputChunks);
      const output = outputBuffer.toString('utf8');
      const error = Buffer.concat(errorChunks).toString('utf8');

      if (code === 0) {
        resolve({ success: true, output, error, outputBuffer });
      } else {
        resolve({ success: false, output, error, outputBuffer });
      }
    });

    gpg.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

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
 * Encrypt data to a GPG recipient (returns ASCII-armored output)
 */
export async function gpgEncrypt(data: Buffer, recipient: string): Promise<string> {
  const args = [
    '--encrypt',
    '--armor',
    '--trust-model', 'always', // Skip trust check for automation
    '--recipient', recipient,
  ];

  const result = await execGPG(args, data);

  if (!result.success || !result.output) {
    const error = result.error || 'Unknown error';

    if (error.includes('No public key') || error.includes('not found') || error.includes('unusable public key')) {
      throw new Error(
        `GPG encryption failed: Public key not found for "${recipient}".\n\n` +
        `Import the public key with:\n` +
        `  gpg --import <keyfile>\n\n` +
        `Or fetch from a keyserver:\n` +
        `  gpg --keyserver keys.openpgp.org --recv-keys <key-id>\n\n` +
        `Original error: ${error}`
      );
    }

    throw new Error(`GPG encryption failed: ${error}`);
  }

  return result.output;
}

/**
 * Decrypt GPG-encrypted ASCII-armored data
 */
export async function gpgDecrypt(armored: string): Promise<Buffer> {
  const args = ['--decrypt', '--quiet'];

  const result = await execGPG(args, armored);

  if (!result.success) {
    const error = result.error || 'Unknown error';

    if (error.includes('No secret key') || error.includes('decryption failed')) {
      throw new Error(
        `GPG decryption failed: No secret key available.\n\n` +
        `You may not have access to this file. Check with:\n` +
        `  gpg --list-secret-keys\n\n` +
        `Original error: ${error}`
      );
    }

    throw new Error(`GPG decryption failed: ${error}`);
  }

  // Use raw buffer output to preserve binary data
  return result.outputBuffer || Buffer.from('');
}

/**
 * Get the default GPG secret key ID
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
      return fields[4]; // Key ID
    }
  }

  return null;
}

/**
 * Get the email associated with a key ID
 */
export async function getKeyEmail(keyId: string): Promise<string | null> {
  const keys = await listKeys();
  const key = keys.find(k => k.id === keyId || k.fingerprint?.includes(keyId));
  return key?.email || null;
}

/**
 * List all GPG public keys in the keyring
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
      if (currentKey && currentKey.id) {
        keys.push(currentKey as GPGKey);
      }
      currentKey = {
        id: fields[4],
        fingerprint: fields[9],
      };
    } else if (recordType === 'uid' && currentKey && !currentKey.email) {
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

  if (currentKey && currentKey.id) {
    keys.push(currentKey as GPGKey);
  }

  return keys;
}

/**
 * Verify that a key exists in the keyring (public or secret)
 */
export async function verifyKeyExists(keyIdentifier: string): Promise<boolean> {
  const keys = await listKeys();
  return keys.some(
    k =>
      k.id === keyIdentifier ||
      k.email === keyIdentifier ||
      k.fingerprint === keyIdentifier ||
      k.id?.endsWith(keyIdentifier) ||
      k.fingerprint?.endsWith(keyIdentifier)
  );
}
