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
 * Read .gitattributes content
 */
export async function readGitattributes(): Promise<string> {
  try {
    return await readFile(getGitattributesPath(), 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

/**
 * Write .gitattributes content
 */
export async function writeGitattributes(content: string): Promise<void> {
  await writeFile(getGitattributesPath(), content, 'utf-8');
}

/**
 * Check if a file is already in .gitattributes
 */
export async function isFileInGitattributes(filename: string): Promise<boolean> {
  const content = await readGitattributes();
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    if (parts[0] === filename) {
      return true;
    }
  }

  return false;
}

/**
 * Add a file to .gitattributes with seekgits filter
 */
export async function addFileToGitattributes(filename: string): Promise<void> {
  if (await isFileInGitattributes(filename)) {
    return; // Already exists
  }

  let content = await readGitattributes();

  // Ensure content ends with newline if not empty
  if (content && !content.endsWith('\n')) {
    content += '\n';
  }

  // Add the file with seekgits filter
  content += `${filename} filter=seekgits diff=seekgits\n`;

  await writeGitattributes(content);
}

/**
 * Initialize .gitattributes with seekgits header
 */
export async function initGitattributes(): Promise<void> {
  const exists = await gitattributesExists();

  if (!exists) {
    const header = `# SeekGits - GPG encrypted secrets
# Files listed below will be automatically encrypted when committed
# and decrypted when checked out.

`;
    await writeGitattributes(header);
  }
}

/**
 * Validate file path (basic validation)
 */
export function validateFilePath(filepath: string): boolean {
  // Don't allow absolute paths or parent directory references
  if (filepath.startsWith('/') || filepath.includes('..')) {
    return false;
  }

  // Don't allow empty paths
  if (!filepath || filepath.trim() === '') {
    return false;
  }

  return true;
}

/**
 * Normalize file path (remove leading ./)
 */
export function normalizeFilePath(filepath: string): string {
  if (filepath.startsWith('./')) {
    return filepath.slice(2);
  }
  return filepath;
}
