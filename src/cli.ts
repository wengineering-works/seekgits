#!/usr/bin/env bun
import { Command } from 'commander';
import { initCommand } from './commands/init';
import { encryptCommand } from './commands/encrypt';
import { shareCommand } from './commands/share';
import { removeCommand } from './commands/remove';
import { statusCommand } from './commands/status';
import { filterCommand } from './commands/filter';

const program = new Command();

program
  .name('seekgits')
  .description('Transparent, deterministic encryption of secrets in git repositories')
  .version('2.0.0');

program
  .command('init')
  .description('Initialize SeekGits in a repository')
  .action(initCommand);

program
  .command('encrypt <file>')
  .description('Start tracking a file (encrypts to your default GPG key)')
  .action(encryptCommand);

program
  .command('share <file> <gpg-key>')
  .description('Add another recipient to an already-tracked file')
  .action(shareCommand);

program
  .command('remove <file>')
  .description('Stop tracking a file and delete it')
  .action(removeCommand);

program
  .command('status [file]')
  .description('Show status of tracked files')
  .action(statusCommand);

// Internal filter commands (called by git)
const filter = program
  .command('filter')
  .description('Git filter commands (internal use)');

filter
  .command('encrypt <file> [tempfile]')
  .description('Encrypt stdin for git clean filter')
  .action((file: string, tempfile?: string) => filterCommand('encrypt', file, tempfile));

filter
  .command('decrypt <file> [tempfile]')
  .description('Decrypt stdin for git smudge filter')
  .action((file: string, tempfile?: string) => filterCommand('decrypt', file, tempfile));

program.parse();
