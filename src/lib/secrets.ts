import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import type { SecretsConfig, FileConfig } from '../types';

const SECRETS_FILE = 'secrets.json';

/**
 * Get the path to secrets.json
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
    files: {},
  };

  await saveSecrets(config);
}

/**
 * Add a key to the allowed list for a file
 * Returns true if key was newly added, false if already existed
 */
export async function addAllowedKey(file: string, keyId: string): Promise<boolean> {
  const config = await loadSecrets();

  if (!config.files[file]) {
    config.files[file] = {
      allowed_keys: [],
    };
  }

  // Check if key already exists
  if (config.files[file].allowed_keys.includes(keyId)) {
    return false; // Key already exists, no changes made
  }

  config.files[file].allowed_keys.push(keyId);

  await saveSecrets(config);
  return true; // Key was newly added
}

/**
 * Remove a key from the allowed list for a file
 */
export async function removeAllowedKey(file: string, keyId: string): Promise<void> {
  const config = await loadSecrets();

  if (!config.files[file]) {
    throw new Error(`File ${file} is not tracked`);
  }

  const index = config.files[file].allowed_keys.indexOf(keyId);
  if (index === -1) {
    throw new Error(`Key ${keyId} is not allowed for ${file}`);
  }

  config.files[file].allowed_keys.splice(index, 1);

  // Remove file entry if no keys left
  if (config.files[file].allowed_keys.length === 0) {
    delete config.files[file];
  }

  await saveSecrets(config);
}

/**
 * Get allowed keys for a file (sorted deterministically)
 */
export async function getKeysSorted(file: string): Promise<string[]> {
  const config = await loadSecrets();

  if (!config.files[file]) {
    return [];
  }

  return [...config.files[file].allowed_keys].sort();
}

/**
 * Get file configuration
 */
export async function getFileConfig(file: string): Promise<FileConfig | null> {
  const config = await loadSecrets();
  return config.files[file] || null;
}

/**
 * Check if a file is tracked
 */
export async function isFileTracked(file: string): Promise<boolean> {
  const config = await loadSecrets();
  return !!config.files[file];
}

/**
 * Get all tracked files
 */
export async function getTrackedFiles(): Promise<string[]> {
  const config = await loadSecrets();
  return Object.keys(config.files).sort();
}
