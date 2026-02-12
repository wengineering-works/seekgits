import { spawn } from 'child_process';

/**
 * Execute a git command
 */
async function execGit(args: string[]): Promise<{ success: boolean; output: string; error: string }> {
  return new Promise((resolve) => {
    const git = spawn('git', args);
    const outputChunks: Buffer[] = [];
    const errorChunks: Buffer[] = [];

    git.stdout.on('data', (data) => {
      outputChunks.push(data);
    });

    git.stderr.on('data', (data) => {
      errorChunks.push(data);
    });

    git.on('close', (code) => {
      const output = Buffer.concat(outputChunks).toString('utf8');
      const error = Buffer.concat(errorChunks).toString('utf8');
      resolve({ success: code === 0, output, error });
    });

    git.on('error', (err) => {
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

/**
 * Check if we're in a git repository
 */
export async function isGitRepo(): Promise<boolean> {
  const result = await execGit(['rev-parse', '--git-dir']);
  return result.success;
}

/**
 * Configure git filter for seekgits
 */
export async function configureFilters(): Promise<void> {
  // Set up clean filter (encrypt on add)
  await execGit(['config', 'filter.seekgits.clean', 'seekgits filter encrypt %f']);

  // Set up smudge filter (decrypt on checkout)
  await execGit(['config', 'filter.seekgits.smudge', 'seekgits filter decrypt %f']);

  // Set up diff driver (show decrypted diffs)
  // Note: textconv receives temp file as argument, we pass %f for context
  await execGit(['config', 'diff.seekgits.textconv', 'seekgits filter decrypt %f']);

  // Mark as binary to prevent line ending issues
  await execGit(['config', 'diff.seekgits.binary', 'true']);
}

/**
 * Clear git index entry for a file
 * This forces git to re-run the filter on the file
 */
export async function clearGitIndexEntry(file: string): Promise<void> {
  await execGit(['rm', '--cached', '--ignore-unmatch', file]);
}

/**
 * Check if a file is tracked by git
 */
export async function isGitTracked(file: string): Promise<boolean> {
  const result = await execGit(['ls-files', file]);
  return result.success && result.output.trim() !== '';
}

/**
 * Get the content of a file as stored in git (after clean filter)
 */
export async function getGitContent(file: string): Promise<Buffer | null> {
  const result = await execGit(['show', `:${file}`]);
  if (!result.success) {
    return null;
  }
  return Buffer.from(result.output, 'binary');
}
