import { spawn } from 'child_process';
import { gitattributesExists } from '../lib/config';
import { secretsExists } from '../lib/secrets';

/**
 * Execute a git config command
 */
async function gitConfig(args: string[]): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const git = spawn('git', ['config', ...args]);
    let error = '';

    git.stderr.on('data', (data) => {
      error += data.toString();
    });

    git.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error });
      }
    });

    git.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

export async function installCommand(): Promise<void> {
  try {
    // Check if secrets.json exists
    if (!(await secretsExists())) {
      console.error('Error: secrets.json not found. Run "seekgits init" first.');
      process.exit(1);
    }

    // Check if .gitattributes exists
    if (!(await gitattributesExists())) {
      console.warn('Warning: .gitattributes not found');
      console.warn('Run "seekgits init" or add files with "seekgits allow" first');
    }

    // Get the path to the seekgits binary
    // In development, this will be "bun run src/index.ts"
    // In production, this will be "seekgits"
    const seekgitsCmd = process.argv[1].endsWith('.ts') ? 'bun run src/index.ts' : 'seekgits';

    console.log('Configuring git filters...\n');

    // Configure clean filter
    const cleanResult = await gitConfig([
      'filter.seekgits.clean',
      `${seekgitsCmd} filter-clean %f`,
    ]);

    if (!cleanResult.success) {
      console.error(`Error configuring clean filter: ${cleanResult.error}`);
      process.exit(1);
    }
    console.log('✓ Configured clean filter (encrypts on commit)');

    // Configure smudge filter
    const smudgeResult = await gitConfig([
      'filter.seekgits.smudge',
      `${seekgitsCmd} filter-smudge %f`,
    ]);

    if (!smudgeResult.success) {
      console.error(`Error configuring smudge filter: ${smudgeResult.error}`);
      process.exit(1);
    }
    console.log('✓ Configured smudge filter (decrypts on checkout)');

    // Configure diff textconv
    const diffResult = await gitConfig(['diff.seekgits.textconv', `${seekgitsCmd} filter-smudge`]);

    if (!diffResult.success) {
      console.error(`Error configuring diff textconv: ${diffResult.error}`);
      process.exit(1);
    }
    console.log('✓ Configured diff textconv (shows decrypted diffs)');

    console.log(`
Git filters installed successfully!

The filters are configured in your repository's .git/config.

Files with "filter=seekgits" in .gitattributes will now be:
  - Automatically encrypted when you commit
  - Automatically decrypted when you checkout
  - Shown decrypted in git diff

You can now commit secret files as usual:
  git add .env
  git commit -m "Add encrypted .env"
`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
