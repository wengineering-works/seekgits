import { checkGPGInstalled, getGPGInstallInstructions, getDefaultKeyId } from '../lib/gpg';
import { secretsExists, initSecrets } from '../lib/secrets';
import { initGitattributes, gitattributesExists } from '../lib/config';

export async function initCommand(): Promise<void> {
  try {
    // Check if GPG is installed
    const gpgInstalled = await checkGPGInstalled();
    if (!gpgInstalled) {
      console.error(getGPGInstallInstructions());
      process.exit(1);
    }

    // Check if user has a GPG key
    const defaultKey = await getDefaultKeyId();
    if (!defaultKey) {
      console.error(`Error: No GPG keys found

Generate a GPG key first:
  gpg --gen-key

Then run "seekgits init" again.`);
      process.exit(1);
    }

    // Check if secrets.json already exists
    if (await secretsExists()) {
      console.log('✓ secrets.json already exists');
    } else {
      await initSecrets();
      console.log('✓ Created secrets.json');
    }

    // Check if .gitattributes already exists
    if (await gitattributesExists()) {
      console.log('✓ .gitattributes already exists');
    } else {
      await initGitattributes();
      console.log('✓ Created .gitattributes');
    }

    console.log(`
SeekGits initialized successfully!

Your default GPG key: ${defaultKey}

Next steps:
  1. Add files to track:
     seekgits allow <file> <gpg-key-id>

  2. Setup git filters:
     seekgits install

  3. Commit as usual - files will be encrypted automatically!

Example:
  seekgits allow .env ${defaultKey}
  git add .env .gitattributes secrets.json
  git commit -m "Add encrypted .env"`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
