import { spawn } from 'child_process';
import { secretsExists, loadSecrets } from '../lib/secrets';
import { gitattributesExists, readGitattributes } from '../lib/config';
import { checkGPGInstalled } from '../lib/gpg';
import { normalizeFilePath } from '../lib/config';

async function execCommand(cmd: string, args: string[]): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args);
    let output = '';
    let error = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      error += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ success: code === 0, output: output || error });
    });

    proc.on('error', () => {
      resolve({ success: false, output: error });
    });
  });
}

export async function statusCommand(args: string[]): Promise<void> {
  try {
    console.log('SeekGits Status Diagnostic\n');

    // Check if file argument provided
    const filename = args.length > 0 ? normalizeFilePath(args[0]) : null;

    // 1. Check GPG
    console.log('1. GPG Installation:');
    const gpgInstalled = await checkGPGInstalled();
    console.log(`   ${gpgInstalled ? '✓' : '✗'} GPG installed: ${gpgInstalled ? 'Yes' : 'No'}`);

    // 2. Check secrets.json
    console.log('\n2. Configuration Files:');
    const hasSecrets = await secretsExists();
    console.log(`   ${hasSecrets ? '✓' : '✗'} secrets.json exists: ${hasSecrets ? 'Yes' : 'No'}`);

    if (hasSecrets) {
      const config = await loadSecrets();
      const fileCount = Object.keys(config.files).length;
      console.log(`   - Tracking ${fileCount} file(s)`);
    }

    // 3. Check .gitattributes
    const hasGitattributes = await gitattributesExists();
    console.log(`   ${hasGitattributes ? '✓' : '✗'} .gitattributes exists: ${hasGitattributes ? 'Yes' : 'No'}`);

    // 4. Check git filters configured
    console.log('\n3. Git Filter Configuration:');
    const cleanFilter = await execCommand('git', ['config', '--local', 'filter.seekgits.clean']);
    const smudgeFilter = await execCommand('git', ['config', '--local', 'filter.seekgits.smudge']);
    const diffFilter = await execCommand('git', ['config', '--local', 'diff.seekgits.textconv']);

    console.log(`   ${cleanFilter.success ? '✓' : '✗'} Clean filter: ${cleanFilter.success ? cleanFilter.output.trim() : 'Not configured'}`);
    console.log(`   ${smudgeFilter.success ? '✓' : '✗'} Smudge filter: ${smudgeFilter.success ? smudgeFilter.output.trim() : 'Not configured'}`);
    console.log(`   ${diffFilter.success ? '✓' : '✗'} Diff textconv: ${diffFilter.success ? diffFilter.output.trim() : 'Not configured'}`);

    // 5. If file specified, check it
    if (filename) {
      console.log(`\n4. File Status: ${filename}`);

      // Check if tracked
      if (hasSecrets) {
        const config = await loadSecrets();
        const fileConfig = config.files[filename];

        if (fileConfig) {
          console.log(`   ✓ Tracked in secrets.json`);
          console.log(`   - Allowed keys: ${fileConfig.allowed_keys.join(', ')}`);
        } else {
          console.log(`   ✗ NOT tracked in secrets.json`);
        }
      }

      // Check .gitattributes
      if (hasGitattributes) {
        const gitattributes = await readGitattributes();
        const hasFilter = gitattributes.includes(`${filename} filter=seekgits`);
        console.log(`   ${hasFilter ? '✓' : '✗'} In .gitattributes: ${hasFilter ? 'Yes' : 'No'}`);
      }

      // Check if file exists
      const fileExists = await execCommand('test', ['-f', filename]);
      console.log(`   ${fileExists.success ? '✓' : '✗'} File exists: ${fileExists.success ? 'Yes' : 'No'}`);

      // Check git index
      const gitIndex = await execCommand('git', ['ls-files', '-s', filename]);
      if (gitIndex.success && gitIndex.output.trim()) {
        console.log(`   ✓ In git index`);

        // Show what's actually staged
        const stagedContent = await execCommand('git', ['show', `:${filename}`]);
        if (stagedContent.success) {
          const content = stagedContent.output;
          const size = Buffer.byteLength(content, 'utf8');

          if (size === 0) {
            console.log(`   ✗ Staged content: EMPTY (0 bytes) - FILE IS BLANK IN GIT!`);
          } else if (content.includes('BEGIN PGP MESSAGE')) {
            console.log(`   ✓ Staged content: Encrypted (${size} bytes)`);
            // Try to parse as JSON to verify format
            try {
              const parsed = JSON.parse(content);
              if (parsed.encrypted && parsed.allowed_keys) {
                console.log(`   ✓ Format: Valid encrypted JSON with ${parsed.allowed_keys.length} key(s)`);
              } else {
                console.log(`   ⚠ Format: JSON but missing expected fields`);
              }
            } catch {
              console.log(`   ⚠ Format: Raw PGP message (not JSON)`);
            }
          } else {
            console.log(`   ✗ Staged content: PLAINTEXT (${size} bytes) - NOT ENCRYPTED!`);
            console.log(`   Preview: ${content.substring(0, 100)}...`);
          }
        }
      } else {
        console.log(`   ✗ Not in git index`);
      }

      // Test filter manually
      console.log('\n5. Filter Test:');
      const testContent = 'TEST_SECRET=12345';
      const filterTest = spawn('seekgits', ['filter-clean', filename]);
      filterTest.stdin.write(testContent);
      filterTest.stdin.end();

      let filterOutput = '';
      filterTest.stdout.on('data', (data) => {
        filterOutput += data.toString();
      });

      await new Promise((resolve) => {
        filterTest.on('close', () => {
          if (filterOutput.includes('BEGIN PGP MESSAGE')) {
            console.log('   ✓ Filter working: Produces encrypted output');
          } else {
            console.log('   ✗ Filter NOT working: No encryption detected');
            console.log(`   Output: ${filterOutput.substring(0, 100)}...`);
          }
          resolve(null);
        });
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('\nDiagnosis:');

    if (!gpgInstalled) {
      console.log('⚠ Install GPG first: brew install gnupg');
    }

    if (!hasSecrets) {
      console.log('⚠ Run: seekgits init');
    }

    if (!cleanFilter.success || !smudgeFilter.success) {
      console.log('⚠ Run: seekgits install');
    }

    if (filename && hasSecrets) {
      const config = await loadSecrets();
      if (!config.files[filename]) {
        console.log(`⚠ Run: seekgits allow ${filename} <gpg-key-id>`);
      }
    }

    console.log('\nFor file-specific issues, run:');
    console.log('  seekgits status <file>');
    console.log('  seekgits reindex <file>');

  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
