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

  // Check if already initialized
  if (await secretsExists()) {
    console.log('SeekGits is already initialized in this repository.');
    console.log('');
    console.log('Next steps:');
    console.log('  seekgits encrypt <file>    Start tracking a file');
    console.log('  seekgits status            Show tracked files');
    return;
  }

  // Initialize secrets.json
  await initSecrets();
  console.log('Created secrets.json');

  // Configure git filters
  await configureFilters();
  console.log('Configured git filters');

  console.log('');
  console.log('SeekGits initialized successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  seekgits encrypt <file>    Start tracking a file');
  console.log('');
  console.log('Remember to commit secrets.json and .gitattributes');
}
