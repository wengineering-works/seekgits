# SeekGits Implementation Plan

**Goal**: Build a CLI tool that allows safely committing secret files (like `.env`) to git using GPG encryption with transparent git filter integration.

**Approach**: Use GPG's native multi-recipient encryption with git clean/smudge filters for automatic encryption/decryption.

## Technology Stack

- **Runtime**: Bun (JavaScript/TypeScript)
- **Encryption**: GPG (GNU Privacy Guard) - must be installed on system
- **CLI Framework**: Minimal - possibly just built-in arg parsing
- **Testing**: Bun's built-in test runner

## Dependencies Philosophy

**Minimize dependencies** - Use as few external packages as possible.

Potential approaches:
1. **Zero dependencies**: Use Node.js built-in `process.argv` for CLI parsing
2. **Minimal dependencies**: Only add Commander.js if arg parsing becomes complex

## Dependencies

```json
{
  "dependencies": {},
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Start with zero dependencies. Add Commander.js only if needed for complex arg parsing.

No crypto libraries needed - we shell out to `gpg` command.

## Architecture Overview

### GPG Integration Approach

Instead of managing our own keypairs, use existing GPG infrastructure:
- Users use their existing GPG keys (or generate via `gpg --gen-key`)
- Public keys identified by GPG key ID or email
- Encryption/decryption via GPG command-line or node-gpg library

### secrets.json Format

```json
{
  "files": {
    ".env": {
      "allowed_keys": [
        "alice@example.com",
        "bob@example.com",
        "0x1234ABCD"
      ]
    }
  }
}
```

GPG key identifiers can be:
- Email addresses
- Key IDs (0x...)
- Fingerprints

### Encrypted File Format

**Update**: Use GPG's native multi-recipient encryption instead of separate encryptions per key.

```json
{
  "encrypted": "-----BEGIN PGP MESSAGE-----\n...",
  "recipients": ["alice@example.com", "bob@example.com", "0x1234ABCD"]
}
```

The `encrypted` field contains a single GPG message encrypted for all recipients. GPG handles multi-recipient encryption natively, which is more efficient than encrypting separately for each key.

The `recipients` array documents who can decrypt (for verification/auditing).

## Project Structure

```
seekgits/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # CLI entry point
│   ├── commands/
│   │   ├── init.ts        # Initialize project
│   │   ├── encrypt.ts     # Encrypt files
│   │   ├── decrypt.ts     # Decrypt files
│   │   ├── allow.ts       # Add public key
│   │   ├── list.ts        # List tracked files
│   │   ├── install.ts     # Setup git filters
│   │   ├── filter-clean.ts   # Git clean filter
│   │   └── filter-smudge.ts  # Git smudge filter
│   ├── lib/
│   │   ├── gpg.ts         # GPG wrapper functions
│   │   ├── secrets.ts     # secrets.json management
│   │   └── config.ts      # Configuration handling
│   └── types.ts           # TypeScript types
├── tests/
│   └── *.test.ts
└── README.md
```

## Implementation Plan

### Phase 1: Core GPG Operations

**File**: `src/lib/gpg.ts`

Functions needed:
- `encryptMultiRecipient(content: string, recipients: string[]): Promise<string>` - Encrypt for multiple GPG keys
- `decrypt(encryptedContent: string): Promise<string>` - Decrypt with local GPG key
- `listKeys(): Promise<GPGKey[]>` - List available GPG keys
- `getDefaultKeyId(): Promise<string>` - Get current user's default GPG key identifier

Implementation approach:
- Use `child_process.spawn` to call `gpg` command
- GPG commands:
  - Encrypt: `gpg --encrypt --armor --recipient alice@example.com --recipient bob@example.com` (multiple --recipient flags)
  - Decrypt: `gpg --decrypt --quiet`
  - List: `gpg --list-keys --with-colons`
  - Get default key: `gpg --list-secret-keys --with-colons` (first key)

### Phase 2: Secrets Management

**File**: `src/lib/secrets.ts`

Functions:
- `loadSecrets(): Promise<SecretsConfig>` - Read secrets.json
- `saveSecrets(config: SecretsConfig): Promise<void>` - Write secrets.json
- `addAllowedKey(file: string, keyId: string): Promise<void>` - Add key to allowed list
- `getKeysSorted(file: string): Promise<string[]>` - Get allowed keys, deterministically ordered

### Phase 3: CLI Commands

#### init command
1. Check if secrets.json exists
2. If not, create with empty files object
3. Get user's GPG key (or prompt to create one)
4. Create .gitattributes if doesn't exist
5. Show next steps (run `seekgits install`)

#### encrypt command
Manual encryption for testing/debugging (git filters handle this automatically).

1. Read plaintext file from disk (e.g., `.env`)
2. Load secrets.json to get allowed_keys for this file
3. Encrypt content once with GPG for all recipients (multi-recipient encryption)
4. Create encrypted JSON structure: `{ encrypted: "...", recipients: [...] }`
5. Write to stdout or optional output file

Usage: `seekgits encrypt .env > .env.encrypted`

#### decrypt command
Manual decryption for testing/debugging (git filters handle this automatically).

1. Read encrypted file from stdin or file argument
2. Parse JSON and extract the `encrypted` field
3. Decrypt using GPG (will work if user's key is in recipients list)
4. Write plaintext to stdout
5. If decryption fails, show helpful error (user not in recipients list)

Usage: `seekgits decrypt .env.encrypted > .env`

#### allow command
1. Load secrets.json
2. Add key ID to allowed_keys array for the file
3. Save secrets.json
4. Prompt user to re-encrypt the file

#### list command
1. Load secrets.json
2. Display each file and its allowed keys in a table

#### install command
1. Configure git filters:
   ```bash
   git config filter.seekgits.clean 'seekgits filter-clean %f'
   git config filter.seekgits.smudge 'seekgits filter-smudge %f'
   git config diff.seekgits.textconv 'seekgits filter-smudge'
   ```
2. Verify .gitattributes exists

#### filter-clean command
1. Read filename from argv (the %f parameter)
2. Read file content from stdin
3. Load secrets.json to get allowed_keys for this file
4. Encrypt once for all recipients
5. Output encrypted JSON to stdout: `{ encrypted: "...", recipients: [...] }`

#### filter-smudge command
1. Read encrypted JSON from stdin (or raw GPG message for backwards compat)
2. Extract the `encrypted` field (or use whole stdin if not JSON)
3. Decrypt using GPG
4. Output plaintext to stdout
5. On error, output stdin as-is (graceful degradation)

### Phase 4: Git Integration

**Files to create**:
- `.gitattributes` template
- Git configuration setup in install command

### Phase 5: Testing

Test scenarios:
1. GPG encryption/decryption round-trip
2. secrets.json read/write
3. Multi-recipient encryption
4. Git filter simulation (stdin/stdout)
5. Full workflow: init → allow → encrypt → decrypt

## Decisions Made

### File Naming
Users work with plaintext files (e.g., `.env`). Git filters handle encryption transparently. No `.encrypted` suffix in working directory.

### .gitattributes Management
- `seekgits init` creates `.gitattributes` if it doesn't exist
- When encrypting a new file, automatically add it to `.gitattributes`
- Format: `<filename> filter=seekgits diff=seekgits`

### Deterministic Output
Sort recipients alphabetically before encrypting to ensure consistent git diffs.

### GPG Installation Check
**Important**: GPG is NOT included with macOS by default. Must check and guide installation.

On first command run, check if GPG exists:
```bash
which gpg || command -v gpg
```

If not found, show installation instructions:
```
Error: GPG not found

Install GPG:
  macOS:    brew install gnupg
  Linux:    apt-get install gnupg (Debian/Ubuntu)
            yum install gnupg (RHEL/CentOS)
  Windows:  Download from https://gnupg.org/download/

After installing, generate a key:
  gpg --gen-key
```

### GPG Key Discovery
- Use `gpg --list-secret-keys` to find default key (first private key)
- If no keys, show helpful error: "No GPG keys found. Generate one with: gpg --gen-key"

### Error Handling
1. **GPG not installed**: Check on first command, show install instructions (see above)
2. **No GPG key**: Show error with instructions to generate
3. **Decryption fails**: Show error with recipients list (user might not be in it)
4. **Key validation**: When adding to allowed_keys, optionally verify key exists in keyring (warn if not found)

### Git Filter Behavior
- **filter-clean**: If secrets.json doesn't exist or file not listed, pass through unchanged (don't encrypt)
- **filter-smudge**: If decryption fails, pass through unchanged (maybe already plaintext)

## Implementation Order

1. **Project setup**
   - package.json with Bun configuration
   - tsconfig.json
   - Basic CLI structure with Commander.js

2. **Core libraries**
   - `src/lib/gpg.ts` - GPG wrapper functions
   - `src/lib/secrets.ts` - secrets.json management
   - `src/lib/config.ts` - Utilities (file paths, validation)

3. **Basic commands** (in order)
   - `init` - Set up new project
   - `allow` - Add keys to secrets.json
   - `list` - Show configuration
   - `encrypt` - Manual encryption
   - `decrypt` - Manual decryption

4. **Git integration**
   - `install` - Configure git filters
   - `filter-clean` - Git clean filter
   - `filter-smudge` - Git smudge filter

5. **Testing & refinement**
   - Unit tests for GPG operations
   - Integration tests for full workflow
   - Error handling improvements

## Critical Files

Will create:
- `package.json` - Project manifest, dependencies, bin entry
- `tsconfig.json` - TypeScript configuration
- `bun.lockb` - Bun lock file
- `src/index.ts` - CLI entry point
- `src/lib/gpg.ts` - GPG operations
- `src/lib/secrets.ts` - secrets.json management
- `src/lib/config.ts` - Utilities
- `src/types.ts` - TypeScript interfaces
- `src/commands/*.ts` - All command implementations
- `tests/*.test.ts` - Test files

## Verification Plan

End-to-end test:
1. `seekgits init` - Creates secrets.json
2. Create a `.env` file with test content
3. `seekgits allow .env <gpg-key>` - Add key to allowed list
4. `seekgits encrypt .env` - Encrypt file
5. Verify `.env.encrypted` contains GPG message
6. `seekgits decrypt .env.encrypted` - Decrypt back
7. Verify plaintext matches original
8. `seekgits install` - Setup git filters
9. Test git workflow: edit .env, git add, verify encrypted in index
10. git checkout, verify decrypted in working dir

Integration test:
1. Initialize project with 2 GPG keys (alice, bob)
2. Alice encrypts .env for both keys
3. Bob decrypts .env successfully
4. Test git filters with simulated stdin/stdout

## Next Steps

After plan approval:
1. Initialize Bun project with TypeScript
2. Install dependencies (Commander.js)
3. Implement core GPG operations library
4. Build CLI commands in order (init → allow → list → encrypt → decrypt)
5. Add git filter integration (install, filter-clean, filter-smudge)
6. Test end-to-end workflow
7. Update project README with user documentation
