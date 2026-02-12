import { unlink } from 'fs/promises';
import { secretsExists, isFileTracked, removeTrackedFile } from '../lib/secrets';
import { removeFilter } from '../lib/gitattributes';
import { clearGitIndexEntry } from '../lib/git';

export async function removeCommand(file: string): Promise<void> {
  // Check if secrets.json exists
  if (!await secretsExists()) {
    console.error('Error: SeekGits not initialized. Run "seekgits init" first.');
    process.exit(1);
  }

  // Check if file is tracked
  if (!await isFileTracked(file)) {
    console.error(`Error: File "${file}" is not tracked.`);
    process.exit(1);
  }

  console.log(`Removing "${file}" from tracking...`);

  // Remove from secrets.json
  await removeTrackedFile(file);
  console.log('Removed from secrets.json');

  // Remove from .gitattributes
  await removeFilter(file);
  console.log('Removed filter from .gitattributes');

  // Clear git index
  await clearGitIndexEntry(file);

  // Delete the file from working directory
  try {
    await unlink(file);
    console.log(`Deleted ${file}`);
  } catch {
    // File might not exist, that's ok
  }

  console.log('');
  console.log(`File "${file}" is no longer tracked.`);
  console.log('');
  console.log('Next steps:');
  console.log('  git add secrets.json .gitattributes');
  console.log('  git commit -m "Remove ' + file + ' from tracking"');
}
