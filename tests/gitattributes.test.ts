import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  hasFilter,
  addFilter,
  removeFilter,
  getFilteredFiles,
  loadGitattributes,
  saveGitattributes,
} from '../src/lib/gitattributes';

let tempDir: string;
let originalCwd: string;

beforeEach(async () => {
  originalCwd = process.cwd();
  tempDir = await mkdtemp(join(tmpdir(), 'seekgits-test-'));
  process.chdir(tempDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(tempDir, { recursive: true });
});

describe('gitattributes', () => {
  describe('hasFilter', () => {
    test('returns false when .gitattributes does not exist', async () => {
      expect(await hasFilter('.env')).toBe(false);
    });

    test('returns true when filter exists', async () => {
      await saveGitattributes('.env filter=seekgits diff=seekgits\n');
      expect(await hasFilter('.env')).toBe(true);
    });

    test('returns false when filter does not exist', async () => {
      await saveGitattributes('.env filter=seekgits diff=seekgits\n');
      expect(await hasFilter('secrets.json')).toBe(false);
    });

    test('substring match bug: short path is not a false positive for longer path', async () => {
      await saveGitattributes(
        'tools/link-tracker/.env filter=seekgits diff=seekgits\n'
      );
      expect(await hasFilter('.env')).toBe(false);
      expect(await hasFilter('tools/link-tracker/.env')).toBe(true);
    });

    test('does not match partial line content', async () => {
      await saveGitattributes('my.env filter=seekgits diff=seekgits\n');
      expect(await hasFilter('.env')).toBe(false);
    });
  });

  describe('addFilter', () => {
    test('creates .gitattributes if it does not exist', async () => {
      await addFilter('.env');
      const content = await readFile(join(tempDir, '.gitattributes'), 'utf-8');
      expect(content).toBe('.env filter=seekgits diff=seekgits\n');
    });

    test('appends to existing .gitattributes', async () => {
      await saveGitattributes('.env filter=seekgits diff=seekgits\n');
      await addFilter('secrets.json');
      const content = await readFile(join(tempDir, '.gitattributes'), 'utf-8');
      expect(content).toContain('.env filter=seekgits diff=seekgits');
      expect(content).toContain('secrets.json filter=seekgits diff=seekgits');
    });

    test('does not duplicate existing filter', async () => {
      await saveGitattributes('.env filter=seekgits diff=seekgits\n');
      await addFilter('.env');
      const content = await readFile(join(tempDir, '.gitattributes'), 'utf-8');
      const matches = content.match(/\.env filter=seekgits diff=seekgits/g);
      expect(matches?.length).toBe(1);
    });

    test('substring match bug: adds .env even when longer path exists', async () => {
      await saveGitattributes(
        'tools/link-tracker/.env filter=seekgits diff=seekgits\n'
      );
      await addFilter('.env');
      const content = await readFile(join(tempDir, '.gitattributes'), 'utf-8');
      expect(content).toContain('.env filter=seekgits diff=seekgits');
      expect(content).toContain(
        'tools/link-tracker/.env filter=seekgits diff=seekgits'
      );
      const lines = content.split('\n').filter((l) => l.trim() !== '');
      expect(lines.length).toBe(2);
    });
  });

  describe('removeFilter', () => {
    test('removes filter for specified file', async () => {
      await saveGitattributes(
        '.env filter=seekgits diff=seekgits\nsecrets.json filter=seekgits diff=seekgits\n'
      );
      await removeFilter('.env');
      const content = await readFile(join(tempDir, '.gitattributes'), 'utf-8');
      expect(content).not.toContain('.env filter=seekgits');
      expect(content).toContain('secrets.json filter=seekgits diff=seekgits');
    });

    test('deletes .gitattributes if last filter removed', async () => {
      await saveGitattributes('.env filter=seekgits diff=seekgits\n');
      await removeFilter('.env');
      expect(await loadGitattributes()).toBe('');
    });
  });

  describe('getFilteredFiles', () => {
    test('returns empty array when no .gitattributes', async () => {
      expect(await getFilteredFiles()).toEqual([]);
    });

    test('returns all files with seekgits filter', async () => {
      await saveGitattributes(
        '.env filter=seekgits diff=seekgits\nsecrets.json filter=seekgits diff=seekgits\n'
      );
      const files = await getFilteredFiles();
      expect(files).toEqual(['.env', 'secrets.json']);
    });
  });
});
