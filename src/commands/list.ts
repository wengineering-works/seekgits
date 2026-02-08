import { loadSecrets } from '../lib/secrets';

export async function listCommand(): Promise<void> {
  try {
    const config = await loadSecrets();
    const files = Object.keys(config.files).sort();

    if (files.length === 0) {
      console.log('No files tracked yet.');
      console.log('\nAdd files with:');
      console.log('  seekgits allow <file> <gpg-key-id>');
      return;
    }

    console.log('Tracked files:\n');

    for (const file of files) {
      const keys = config.files[file].allowed_keys;
      console.log(`${file}`);
      console.log(`  Recipients (${keys.length}):`);

      for (const key of keys) {
        console.log(`    - ${key}`);
      }
      console.log();
    }

    console.log(`Total: ${files.length} file(s) tracked`);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
