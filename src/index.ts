#!/usr/bin/env bun

import { initCommand } from './commands/init';
import { allowCommand } from './commands/allow';
import { listCommand } from './commands/list';
import { encryptCommand } from './commands/encrypt';
import { decryptCommand } from './commands/decrypt';
import { installCommand } from './commands/install';
import { filterCleanCommand } from './commands/filter-clean';
import { filterSmudgeCommand } from './commands/filter-smudge';

const VERSION = '0.1.0';

function showHelp(): void {
  console.log(`SeekGits v${VERSION}
Safely commit secret files to git using GPG encryption

Usage: seekgits <command> [options]

Commands:
  init                    Initialize seekgits in current directory
  allow <file> <key>      Add a GPG key to allowed list for a file
  list                    List all tracked files and their recipients
  encrypt <file>          Manually encrypt a file (for testing)
  decrypt [file]          Manually decrypt a file (for testing)
  install                 Setup git filters for automatic encryption
  filter-clean <file>     Git clean filter (internal use)
  filter-smudge [file]    Git smudge filter (internal use)
  help                    Show this help message
  version                 Show version

Examples:
  seekgits init
  seekgits allow .env alice@example.com
  seekgits allow .env bob@example.com
  seekgits list
  seekgits install
  git add .env
  git commit -m "Add encrypted .env"

For more information, visit:
  https://github.com/yourusername/seekgits
`);
}

function showVersion(): void {
  console.log(`seekgits v${VERSION}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  try {
    switch (command) {
      case 'init':
        await initCommand();
        break;

      case 'allow':
        await allowCommand(commandArgs);
        break;

      case 'list':
        await listCommand();
        break;

      case 'encrypt':
        await encryptCommand(commandArgs);
        break;

      case 'decrypt':
        await decryptCommand(commandArgs);
        break;

      case 'install':
        await installCommand();
        break;

      case 'filter-clean':
        await filterCleanCommand(commandArgs);
        break;

      case 'filter-smudge':
        await filterSmudgeCommand(commandArgs);
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      case 'version':
      case '--version':
      case '-v':
        showVersion();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "seekgits help" for usage information');
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
