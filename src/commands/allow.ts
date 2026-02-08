import { addAllowedKey, isFileTracked } from '../lib/secrets';
import { addFileToGitattributes, clearGitIndexEntry } from '../lib/config';
import { verifyKeyExists } from '../lib/gpg';
import { validateFilePath, normalizeFilePath } from '../lib/config';

export async function allowCommand(args: string[]): Promise<void> {
  try {
    if (args.length < 2) {
      console.error(`Usage: seekgits allow <file> <gpg-key-id>

Examples:
  seekgits allow .env alice@example.com
  seekgits allow .env 0x1234ABCD
  seekgits allow config/secrets.yml bob@example.com

Arguments:
  <file>         File to track (e.g., .env)
  <gpg-key-id>   GPG key identifier (email or key ID)`);
      process.exit(1);
    }

    const filename = normalizeFilePath(args[0]);
    const keyId = args[1];

    // Validate file path
    if (!validateFilePath(filename)) {
      console.error(`Error: Invalid file path: ${filename}`);
      process.exit(1);
    }

    // Check if key exists (warning only)
    const keyExists = await verifyKeyExists(keyId);
    if (!keyExists) {
      console.warn(`Warning: Key "${keyId}" not found in GPG keyring`);
      console.warn('The key will be added, but encryption may fail if the key is not imported.');
    }

    // Check if this is a new file
    const isNewFile = !(await isFileTracked(filename));

    // Add key to secrets.json (returns true if newly added, false if already existed)
    const keyAdded = await addAllowedKey(filename, keyId);

    if (keyAdded) {
      console.log(`✓ Added key "${keyId}" to ${filename}`);
    } else {
      console.log(`✓ Key "${keyId}" already allowed for ${filename} (re-indexing)`);
    }

    // Add to .gitattributes if new file
    if (isNewFile) {
      await addFileToGitattributes(filename);
      console.log(`✓ Added ${filename} to .gitattributes`);
    }

    // Always clear git index entry to force re-filtering on next git add
    // This prevents stale index entries from being used and fixes index issues
    await clearGitIndexEntry(filename);

    // Show next steps
    if (isNewFile) {
      console.log(`
Next steps:
  1. Make sure the file exists: ${filename}
  2. Commit the configuration:
     git add secrets.json .gitattributes
     git commit -m "Track ${filename} with seekgits"
  3. Add and commit the secret file:
     git add ${filename}
     git commit -m "Add encrypted ${filename}"

The file will be automatically encrypted when committed.`);
    } else if (keyAdded) {
      console.log(`
File already tracked. To re-encrypt with the new key:
  git add ${filename}
  git commit -m "Update ${filename} with new key"`);
    } else {
      console.log(`
Git index cleared. To re-encrypt:
  git add ${filename}
  git commit -m "Re-encrypt ${filename}"`);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
