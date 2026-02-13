import { secretsExists, initSecrets } from '../lib/secrets';
import { isGitRepo, configureFilters } from '../lib/git';
import { checkGPGInstalled } from '../lib/gpg';

export async function initCommand(): Promise<void> {
  // Check prerequisites
  if (!await isGitRepo()) {
    console.error('Error: Not a git repository. Run "git init" first.');
    process.exit(1);
  }

  if (!await checkGPGInstalled()) {
    console.error('Error: GPG is not installed.');
    console.error('');
    console.error('Install GPG:');
    console.error('  brew install gnupg');
    console.error('');
    console.error('Then generate a key:');
    console.error('  gpg --gen-key');
    process.exit(1);
  }

  const alreadyInitialized = await secretsExists();

  // Configure git filters (always - each user needs local config)
  await configureFilters();
  console.log('Configured git filters');

  // Initialize secrets.json only if it doesn't exist
  if (!alreadyInitialized) {
    await initSecrets();
    console.log('Created secrets.json');
  }

  console.log('');
  console.log('SeekGits initialized successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  seekgits encrypt <file>    Start tracking a file');
  if (!alreadyInitialized) {
    console.log('');
    console.log('Remember to commit secrets.json and .gitattributes');
  }
}
