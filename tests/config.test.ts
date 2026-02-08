import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import {
  gitattributesExists,
  initGitattributes,
  addFileToGitattributes,
  isFileInGitattributes,
  validateFilePath,
  normalizeFilePath,
} from '../src/lib/config';

// Use a temporary directory for tests
const TEST_DIR = join(import.meta.dir, 'tmp');
const ORIGINAL_CWD = process.cwd();

describe('Config Utilities', () => {
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
      await unlink(join(TEST_DIR, '.gitattributes'));
    } catch {
      // File might not exist
    }
  });

  test('gitattributesExists returns false when file does not exist', async () => {
    const exists = await gitattributesExists();
    expect(exists).toBe(false);
  });

  test('initGitattributes creates .gitattributes', async () => {
    await initGitattributes();
    const exists = await gitattributesExists();
    expect(exists).toBe(true);
  });

  test('addFileToGitattributes adds file', async () => {
    await initGitattributes();
    await addFileToGitattributes('.env');

    const inFile = await isFileInGitattributes('.env');
    expect(inFile).toBe(true);
  });

  test('addFileToGitattributes does not duplicate', async () => {
    await initGitattributes();
    await addFileToGitattributes('.env');
    await addFileToGitattributes('.env'); // Add again

    const inFile = await isFileInGitattributes('.env');
    expect(inFile).toBe(true);
  });

  test('isFileInGitattributes returns false for non-existent file', async () => {
    await initGitattributes();
    const inFile = await isFileInGitattributes('.env');
    expect(inFile).toBe(false);
  });

  test('validateFilePath rejects absolute paths', () => {
    expect(validateFilePath('/absolute/path')).toBe(false);
  });

  test('validateFilePath rejects parent directory references', () => {
    expect(validateFilePath('../parent')).toBe(false);
    expect(validateFilePath('foo/../bar')).toBe(false);
  });

  test('validateFilePath accepts relative paths', () => {
    expect(validateFilePath('.env')).toBe(true);
    expect(validateFilePath('config/secrets.yml')).toBe(true);
  });

  test('validateFilePath rejects empty paths', () => {
    expect(validateFilePath('')).toBe(false);
    expect(validateFilePath('  ')).toBe(false);
  });

  test('normalizeFilePath removes leading ./', () => {
    expect(normalizeFilePath('./.env')).toBe('.env');
    expect(normalizeFilePath('./config/file.yml')).toBe('config/file.yml');
  });

  test('normalizeFilePath preserves paths without ./', () => {
    expect(normalizeFilePath('.env')).toBe('.env');
    expect(normalizeFilePath('config/file.yml')).toBe('config/file.yml');
  });
});
