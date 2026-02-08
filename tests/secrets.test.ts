import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import {
  initSecrets,
  loadSecrets,
  saveSecrets,
  addAllowedKey,
  getKeysSorted,
  isFileTracked,
  getTrackedFiles,
  secretsExists,
} from '../src/lib/secrets';

// Use a temporary directory for tests
const TEST_DIR = join(import.meta.dir, 'tmp');
const ORIGINAL_CWD = process.cwd();

describe('Secrets Management', () => {
  beforeEach(async () => {
    // Create test directory and change to it
    try {
      await mkdir(TEST_DIR, { recursive: true });
    } catch {
      // Directory might already exist
    }
    process.chdir(TEST_DIR);
  });

  afterEach(async () => {
    // Change back to original directory
    process.chdir(ORIGINAL_CWD);

    // Clean up test files
    try {
      await unlink(join(TEST_DIR, 'secrets.json'));
    } catch {
      // File might not exist
    }
  });

  test('secretsExists returns false when file does not exist', async () => {
    const exists = await secretsExists();
    expect(exists).toBe(false);
  });

  test('initSecrets creates secrets.json', async () => {
    await initSecrets();
    const exists = await secretsExists();
    expect(exists).toBe(true);
  });

  test('loadSecrets returns config structure', async () => {
    await initSecrets();
    const config = await loadSecrets();

    expect(config).toBeDefined();
    expect(config.files).toBeDefined();
    expect(typeof config.files).toBe('object');
  });

  test('saveSecrets writes config', async () => {
    const config = {
      files: {
        '.env': {
          allowed_keys: ['alice@example.com'],
        },
      },
    };

    await saveSecrets(config);
    const loaded = await loadSecrets();

    expect(loaded.files['.env']).toBeDefined();
    expect(loaded.files['.env'].allowed_keys).toContain('alice@example.com');
  });

  test('addAllowedKey adds key to file', async () => {
    await initSecrets();
    await addAllowedKey('.env', 'alice@example.com');

    const keys = await getKeysSorted('.env');
    expect(keys).toContain('alice@example.com');
  });

  test('addAllowedKey returns false if key already exists', async () => {
    await initSecrets();
    const firstAdd = await addAllowedKey('.env', 'alice@example.com');
    expect(firstAdd).toBe(true); // First add returns true

    const secondAdd = await addAllowedKey('.env', 'alice@example.com');
    expect(secondAdd).toBe(false); // Second add returns false (already exists)
  });

  test('getKeysSorted returns sorted keys', async () => {
    await initSecrets();
    await addAllowedKey('.env', 'charlie@example.com');
    await addAllowedKey('.env', 'alice@example.com');
    await addAllowedKey('.env', 'bob@example.com');

    const keys = await getKeysSorted('.env');
    expect(keys).toEqual(['alice@example.com', 'bob@example.com', 'charlie@example.com']);
  });

  test('isFileTracked returns correct value', async () => {
    await initSecrets();
    await addAllowedKey('.env', 'alice@example.com');

    expect(await isFileTracked('.env')).toBe(true);
    expect(await isFileTracked('.nottracked')).toBe(false);
  });

  test('getTrackedFiles returns all tracked files', async () => {
    await initSecrets();
    await addAllowedKey('.env', 'alice@example.com');
    await addAllowedKey('config.yml', 'bob@example.com');

    const files = await getTrackedFiles();
    expect(files).toContain('.env');
    expect(files).toContain('config.yml');
    expect(files.length).toBe(2);
  });

  test('loadSecrets throws if file does not exist', async () => {
    expect(async () => {
      await loadSecrets();
    }).toThrow();
  });
});
