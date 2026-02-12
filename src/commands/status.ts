import { access } from 'fs/promises';
import { secretsExists, getTrackedFiles, getFileConfig, getFileKey } from '../lib/secrets';

export async function statusCommand(file?: string): Promise<void> {
  // Check if secrets.json exists
  if (!await secretsExists()) {
    console.error('Error: SeekGits not initialized. Run "seekgits init" first.');
    process.exit(1);
  }

  if (file) {
    // Show status for specific file
    await showFileStatus(file);
  } else {
    // Show status for all tracked files
    const files = await getTrackedFiles();

    if (files.length === 0) {
      console.log('No files are tracked.');
      console.log('');
      console.log('To start tracking a file:');
      console.log('  seekgits encrypt <file>');
      return;
    }

    console.log('Tracked files:');
    console.log('');

    for (const f of files) {
      await showFileStatus(f);
      console.log('');
    }
  }
}

async function showFileStatus(file: string): Promise<void> {
  const config = await getFileConfig(file);

  if (!config) {
    console.log(`${file}: Not tracked`);
    return;
  }

  // Check if file exists
  let fileExists = false;
  try {
    await access(file);
    fileExists = true;
  } catch {
    fileExists = false;
  }

  // Check if we can decrypt
  let canDecrypt = false;
  try {
    await getFileKey(file);
    canDecrypt = true;
  } catch {
    canDecrypt = false;
  }

  console.log(`${file}:`);
  console.log(`  Recipients: ${config.recipients.join(', ')}`);
  console.log(`  File exists: ${fileExists ? 'Yes' : 'No'}`);
  console.log(`  Can decrypt: ${canDecrypt ? 'Yes' : 'No (you may not have access)'}`);
}
