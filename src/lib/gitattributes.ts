import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';

const GITATTRIBUTES_FILE = '.gitattributes';

/**
 * Get the path to .gitattributes
 */
export function getGitattributesPath(): string {
  return join(process.cwd(), GITATTRIBUTES_FILE);
}

/**
 * Check if .gitattributes exists
 */
export async function gitattributesExists(): Promise<boolean> {
  try {
    await access(getGitattributesPath());
    return true;
  } catch {
    return false;
  }
}

/**
 * Load .gitattributes content
 */
export async function loadGitattributes(): Promise<string> {
  try {
    return await readFile(getGitattributesPath(), 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Save .gitattributes content
 */
export async function saveGitattributes(content: string): Promise<void> {
  await writeFile(getGitattributesPath(), content, 'utf-8');
}

/**
 * Parse .gitattributes into lines
 */
function parseLines(content: string): string[] {
  return content.split('\n').filter(line => line.trim() !== '');
}

/**
 * Check if a file has the seekgits filter configured
 */
export async function hasFilter(file: string): Promise<boolean> {
  const content = await loadGitattributes();
  const lineSet = new Set(parseLines(content));
  return lineSet.has(`${file} filter=seekgits diff=seekgits`);
}

/**
 * Add seekgits filter for a file
 */
export async function addFilter(file: string): Promise<void> {
  const content = await loadGitattributes();
  const lines = parseLines(content);
  const lineSet = new Set(lines);

  const filterLine = `${file} filter=seekgits diff=seekgits`;
  if (lineSet.has(filterLine)) {
    return; // Already configured
  }

  lines.push(filterLine);
  await saveGitattributes(lines.join('\n') + '\n');
}

/**
 * Remove seekgits filter for a file
 */
export async function removeFilter(file: string): Promise<void> {
  const content = await loadGitattributes();
  const lines = parseLines(content);

  const filtered = lines.filter(line => {
    // Remove lines that start with this file and have seekgits filter
    if (line.startsWith(file + ' ') && line.includes('filter=seekgits')) {
      return false;
    }
    return true;
  });

  if (filtered.length > 0) {
    await saveGitattributes(filtered.join('\n') + '\n');
  } else {
    // Remove the file if empty
    try {
      const { unlink } = await import('fs/promises');
      await unlink(getGitattributesPath());
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

/**
 * Get all files with seekgits filter configured
 */
export async function getFilteredFiles(): Promise<string[]> {
  const content = await loadGitattributes();
  const lines = parseLines(content);

  const files: string[] = [];
  for (const line of lines) {
    if (line.includes('filter=seekgits')) {
      const file = line.split(' ')[0];
      if (file) {
        files.push(file);
      }
    }
  }

  return files;
}
