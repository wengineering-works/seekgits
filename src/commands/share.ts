import { secretsExists, isFileTracked, getFileKey, addRecipient } from '../lib/secrets';
import { gpgEncrypt, verifyKeyExists } from '../lib/gpg';

export async function shareCommand(file: string, gpgKey: string): Promise<void> {
  // Check if secrets.json exists
  if (!await secretsExists()) {
    console.error('Error: SeekGits not initialized. Run "seekgits init" first.');
    process.exit(1);
  }

  // Check if file is tracked
  if (!await isFileTracked(file)) {
    console.error(`Error: File "${file}" is not tracked.`);
    console.error('Use "seekgits encrypt" to start tracking it first.');
    process.exit(1);
  }

  // Verify the recipient key exists
  if (!await verifyKeyExists(gpgKey)) {
    console.error(`Error: GPG key "${gpgKey}" not found in keyring.`);
    console.error('');
    console.error('Import the public key first:');
    console.error('  gpg --import <keyfile>');
    console.error('');
    console.error('Or fetch from a keyserver:');
    console.error(`  gpg --keyserver keys.openpgp.org --search-keys ${gpgKey}`);
    process.exit(1);
  }

  console.log(`Sharing "${file}" with ${gpgKey}...`);

  // Get the existing file key (requires being a current recipient)
  let fileKey: Buffer;
  try {
    fileKey = await getFileKey(file);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    console.error('');
    console.error('You must be an existing recipient to share with others.');
    process.exit(1);
  }

  // Encrypt the file key to the new recipient
  const encryptedFileKey = await gpgEncrypt(fileKey, gpgKey);

  // Add to secrets.json
  await addRecipient(file, gpgKey, encryptedFileKey);

  console.log('');
  console.log(`Shared "${file}" with ${gpgKey}.`);
  console.log('');
  console.log('Next steps:');
  console.log('  git add secrets.json');
  console.log('  git commit -m "Share secrets with ' + gpgKey + '"');
}
