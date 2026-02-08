import { clearGitIndexEntry } from '../lib/config';
import { isFileTracked } from '../lib/secrets';
import { normalizeFilePath } from '../lib/config';

export async function reindexCommand(args: string[]): Promise<void> {
  try {
    if (args.length < 1) {
      console.error(`Usage: seekgits reindex <file>

Force git to re-filter and re-encrypt a file on next git add.

This is useful when:
  - File appears blank or corrupted in git
  - Git cached the file before filters were configured
  - You want to ensure the file is properly encrypted

Examples:
  seekgits reindex .env
  seekgits reindex config/secrets.yml
  seekgits reindex webapp/.env`);
      process.exit(1);
    }

    const filename = normalizeFilePath(args[0]);

    // Check if file is tracked
    const tracked = await isFileTracked(filename);
    if (!tracked) {
      console.error(`Error: File "${filename}" is not tracked by seekgits.

Add it first:
  seekgits allow ${filename} <gpg-key-id>`);
      process.exit(1);
    }

    // Clear the git index entry
    await clearGitIndexEntry(filename);

    console.log(`✓ Cleared git index for ${filename}

Next steps:
  git add ${filename}
  git commit -m "Re-encrypt ${filename}"

The file will be re-filtered and properly encrypted on git add.`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
