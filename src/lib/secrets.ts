import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import type { SecretsConfig, FileConfig } from '../types';
import { gpgDecrypt, gpgEncrypt } from './gpg';

const SECRETS_FILE = 'secrets.json';

/**
 * Get the path to secrets.json in the current directory
 */
export function getSecretsPath(): string {
  return join(process.cwd(), SECRETS_FILE);
}

/**
 * Check if secrets.json exists
 */
export async function secretsExists(): Promise<boolean> {
  try {
    await access(getSecretsPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Load secrets configuration from secrets.json
 */
export async function loadSecrets(): Promise<SecretsConfig> {
  const path = getSecretsPath();

  try {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('secrets.json not found. Run "seekgits init" first.');
    }
    throw new Error(`Failed to read secrets.json: ${(error as Error).message}`);
  }
}

/**
 * Save secrets configuration to secrets.json
 */
export async function saveSecrets(config: SecretsConfig): Promise<void> {
  const path = getSecretsPath();

  try {
    const content = JSON.stringify(config, null, 2) + '\n';
    await writeFile(path, content, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to write secrets.json: ${(error as Error).message}`);
  }
}

/**
 * Initialize a new secrets.json file
 */
export async function initSecrets(): Promise<void> {
  const config: SecretsConfig = {
    version: 1,
    files: {},
  };

  await saveSecrets(config);
}

/**
 * Check if a file is tracked in secrets.json
 */
export async function isFileTracked(file: string): Promise<boolean> {
  const config = await loadSecrets();
  return !!config.files[file];
}

/**
 * Get file configuration
 */
export async function getFileConfig(file: string): Promise<FileConfig | null> {
  const config = await loadSecrets();
  return config.files[file] || null;
}

/**
 * Get all tracked files
 */
export async function getTrackedFiles(): Promise<string[]> {
  const config = await loadSecrets();
  return Object.keys(config.files).sort();
}

/**
 * Add a new tracked file with its first recipient
 */
export async function addTrackedFile(
  file: string,
  recipient: string,
  encryptedFileKey: string
): Promise<void> {
  const config = await loadSecrets();

  if (config.files[file]) {
    throw new Error(`File "${file}" is already tracked. Use "seekgits share" to add recipients.`);
  }

  config.files[file] = {
    keys: {
      [recipient]: encryptedFileKey,
    },
  };

  await saveSecrets(config);
}

/**
 * Add a recipient to an existing tracked file
 */
export async function addRecipient(
  file: string,
  recipient: string,
  encryptedFileKey: string
): Promise<void> {
  const config = await loadSecrets();

  if (!config.files[file]) {
    throw new Error(`File "${file}" is not tracked. Use "seekgits encrypt" first.`);
  }

  if (config.files[file].keys[recipient]) {
    throw new Error(`Recipient "${recipient}" already has access to "${file}".`);
  }

  config.files[file].keys[recipient] = encryptedFileKey;

  await saveSecrets(config);
}

/**
 * Remove a tracked file
 */
export async function removeTrackedFile(file: string): Promise<void> {
  const config = await loadSecrets();

  if (!config.files[file]) {
    throw new Error(`File "${file}" is not tracked.`);
  }

  delete config.files[file];
  await saveSecrets(config);
}

/**
 * Get the decrypted file key for a file
 * Tries each recipient's encrypted key until one works
 */
export async function getFileKey(file: string): Promise<Buffer> {
  const config = await loadSecrets();
  const fileConfig = config.files[file];

  if (!fileConfig) {
    throw new Error(`File "${file}" is not tracked.`);
  }

  // Try to decrypt with any available key
  const recipients = Object.keys(fileConfig.keys);
  const errors: string[] = [];

  for (const recipient of recipients) {
    const encryptedKey = fileConfig.keys[recipient];

    try {
      return await gpgDecrypt(encryptedKey);
    } catch (error) {
      errors.push(`${recipient}: ${(error as Error).message}`);
    }
  }

  throw new Error(
    `Cannot decrypt file key for "${file}". ` +
    `You may not have access.\n\nTried recipients: ${recipients.join(', ')}`
  );
}

/**
 * Get recipients for a file
 */
export async function getRecipients(file: string): Promise<string[]> {
  const config = await loadSecrets();
  const fileConfig = config.files[file];

  if (!fileConfig) {
    throw new Error(`File "${file}" is not tracked.`);
  }

  return Object.keys(fileConfig.keys);
}
