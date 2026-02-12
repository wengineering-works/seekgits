import { access } from 'fs/promises';
import { secretsExists, isFileTracked, addTrackedFile } from '../lib/secrets';
import { addFilter } from '../lib/gitattributes';
import { gitAdd, gitAddRenormalize } from '../lib/git';
import { getDefaultKeyId, gpgEncrypt, getKeyEmail } from '../lib/gpg';
import { generateFileKey } from '../lib/crypto';

export async function encryptCommand(file: string): Promise<void> {
  // Check if secrets.json exists
  if (!await secretsExists()) {
    console.error('Error: SeekGits not initialized. Run "seekgits init" first.');
    process.exit(1);
  }

  // Check if file exists
  try {
    await access(file);
  } catch {
    console.error(`Error: File "${file}" does not exist.`);
    process.exit(1);
  }

  // Check if already tracked
  if (await isFileTracked(file)) {
    console.error(`Error: File "${file}" is already tracked.`);
    console.error('Use "seekgits share" to add more recipients.');
    process.exit(1);
  }

  // Get default GPG key
  const keyId = await getDefaultKeyId();
  if (!keyId) {
    console.error('Error: No GPG secret key found.');
    console.error('');
    console.error('Generate a key with:');
    console.error('  gpg --gen-key');
    process.exit(1);
  }

  // Get email for display
  const email = await getKeyEmail(keyId);
  const recipient = email || keyId;

  console.log(`Encrypting "${file}" for ${recipient}...`);

  // Generate file key
  const fileKey = generateFileKey();

  // Encrypt file key to the user
  const encryptedFileKey = await gpgEncrypt(fileKey, keyId);

  // Add to secrets.json
  await addTrackedFile(file, recipient, encryptedFileKey);
  console.log('Added to secrets.json');

  // Add to .gitattributes
  await addFilter(file);
  console.log('Added filter to .gitattributes');

  // Stage .gitattributes first so git knows about the filter
  await gitAdd('.gitattributes');

  // Add file with --renormalize to force filter application
  await gitAddRenormalize(file);
  console.log(`Staged ${file} (encrypted)`);

  console.log('');
  console.log(`File "${file}" is now tracked and staged.`);
  console.log('');
  console.log('Next steps:');
  console.log('  git add secrets.json');
  console.log('  git commit -m "Add encrypted secrets"');
  console.log('');
  console.log('To share with others:');
  console.log(`  seekgits share ${file} <email>`);
}
