# SeekGits - Implementation Plan (v2)

A CLI tool for transparent, deterministic encryption of secrets in git repositories.

## Overview

SeekGits encrypts sensitive files (like `.env`) so they can be committed to git. Unlike the original GPG-only approach, this version uses **hybrid encryption** for deterministic output - the same plaintext always produces the same ciphertext, which is essential for git's change detection.

### Key Features

- **Deterministic encryption**: Same content = same ciphertext (git-friendly)
- **Per-file access control**: Different files can have different recipients
- **GPG key distribution**: Uses existing GPG infrastructure for key exchange
- **Transparent git integration**: Automatic encrypt on commit, decrypt on checkout

## Encryption Scheme

Based on [git-crypt](https://github.com/AGWA/git-crypt)'s approach, but with per-file keys and HMAC-SHA256.

### Why Two Keys? (AES + HMAC)

AES-CTR requires a nonce (number used once). Normally random, but that breaks determinism.

**Solution:** Derive the nonce from the plaintext using HMAC:

```
nonce = HMAC-SHA256(hmac_key, plaintext)   // deterministic!
ciphertext = AES-256-CTR(aes_key, nonce[0:16], plaintext)
```

Same plaintext → same nonce → same ciphertext.

### File Key Structure

Each tracked file has a 64-byte symmetric key:

| Component | Size | Purpose |
|-----------|------|---------|
| `aes_key` | 32 bytes | AES-256-CTR encryption |
| `hmac_key` | 32 bytes | Nonce derivation via HMAC-SHA256 |

The file key is generated once per file and encrypted to each recipient using GPG.

### Encrypted File Format

```
| Offset | Size | Content                       |
|--------|------|-------------------------------|
| 0      | 10   | \0SEEKGITS\0 (magic header)   |
| 10     | 32   | HMAC-SHA256 nonce             |
| 42     | N    | AES-256-CTR ciphertext        |
```

## Configuration Files

### secrets.json

Committed to repo. Contains file tracking info and GPG-encrypted file keys.

```json
{
  "version": 1,
  "files": {
    ".env": {
      "recipients": ["alice@example.com", "bob@example.com"],
      "keys": {
        "alice@example.com": "-----BEGIN PGP MESSAGE-----\n...\n-----END PGP MESSAGE-----",
        "bob@example.com": "-----BEGIN PGP MESSAGE-----\n...\n-----END PGP MESSAGE-----"
      }
    },
    "config/prod.env": {
      "recipients": ["alice@example.com"],
      "keys": {
        "alice@example.com": "-----BEGIN PGP MESSAGE-----\n..."
      }
    }
  }
}
```

### .gitattributes

Managed by SeekGits. Tells git to use our filters.

```
.env filter=seekgits diff=seekgits
config/prod.env filter=seekgits diff=seekgits
```

## Commands

### `seekgits init`

Initialize SeekGits in a repository.

**Actions:**
1. Create empty `secrets.json` with version field
2. Configure git filters:
   - Set `git config filter.seekgits.clean "seekgits filter encrypt %f"`
   - Set `git config filter.seekgits.smudge "seekgits filter decrypt %f"`
   - Set `git config diff.seekgits.textconv "seekgits filter decrypt %f"`
3. Print next steps

**Usage:**
```bash
seekgits init
```

### `seekgits encrypt <file>`

Start tracking a file. Encrypts to your default GPG key.

**Actions:**
1. Get user's default GPG secret key
2. Generate 64 random bytes (file key)
3. Encrypt file key to user's GPG key
4. Add entry to `secrets.json`
5. Add filter rule to `.gitattributes`
6. Clear git index entry for file (prevents caching bugs)

**Usage:**
```bash
seekgits encrypt .env
```

### `seekgits share <file> <gpg-key>`

Add another recipient to an already-tracked file.

**Actions:**
1. Verify file is already tracked
2. Decrypt existing file key (requires being a current recipient)
3. Encrypt file key to new recipient using GPG
4. Add new recipient to `secrets.json`

**Usage:**
```bash
seekgits share .env bob@example.com
```

### `seekgits remove <file>`

Stop tracking a file and delete it.

**Actions:**
1. Verify file is tracked
2. Remove entry from `secrets.json`
3. Remove filter rule from `.gitattributes`
4. Delete the file from working directory (prevents accidental plaintext commit)

**Usage:**
```bash
seekgits remove .env
```

### `seekgits filter encrypt <file>`

Git clean filter (called automatically by git) - encrypts content for storage.

**Actions:**
1. Read plaintext from stdin
2. Load file key from `secrets.json`, decrypt with user's GPG key
3. Compute `nonce = HMAC-SHA256(hmac_key, plaintext)`
4. Encrypt `ciphertext = AES-256-CTR(aes_key, nonce[0:16], plaintext)`
5. Output: header + nonce + ciphertext to stdout

**Note:** This is called by git, not directly by users.

### `seekgits filter decrypt <file>`

Git smudge filter (called automatically by git) - decrypts content for working directory.

**Actions:**
1. Read encrypted content from stdin
2. Verify magic header `\0SEEKGITS\0`
3. Load file key from `secrets.json`, decrypt with user's GPG key
4. Read nonce from bytes 10-42
5. Decrypt with AES-256-CTR
6. Output plaintext to stdout

**Note:** This is called by git, not directly by users.

### `seekgits status [file]`

Show status of tracked files.

**Actions:**
1. List all tracked files from `secrets.json`
2. For each file, show:
   - Recipients
   - Whether current user can decrypt (has access)
   - Whether file exists in working directory
   - Whether git index matches (no caching bugs)

**Usage:**
```bash
seekgits status
seekgits status .env
```

## Implementation Phases

### Phase 1: Core Encryption

**Goal:** Working encrypt/decrypt without git integration.

**Files:**
- `src/lib/crypto.ts` - AES-256-CTR + HMAC-SHA256 functions
- `src/lib/gpg.ts` - GPG encrypt/decrypt for file keys
- `src/lib/secrets.ts` - Load/save `secrets.json`

**Functions to implement:**

```typescript
// crypto.ts
function generateFileKey(): Buffer  // 64 random bytes
function encrypt(plaintext: Buffer, fileKey: Buffer): Buffer
function decrypt(ciphertext: Buffer, fileKey: Buffer): Buffer

// gpg.ts
function gpgEncrypt(data: Buffer, recipient: string): Promise<string>
function gpgDecrypt(armored: string): Promise<Buffer>
function listKeys(): Promise<GPGKey[]>
function verifyKeyExists(keyId: string): Promise<boolean>

// secrets.ts
function loadSecrets(): Promise<SecretsConfig>
function saveSecrets(config: SecretsConfig): Promise<void>
function getFileKey(file: string): Promise<Buffer>  // decrypts using user's GPG
function addRecipient(file: string, recipient: string, fileKey: Buffer): Promise<void>
```

**Tests:**
- Encrypt then decrypt returns original plaintext
- Same plaintext + same key = same ciphertext (determinism!)
- Different plaintext = different ciphertext
- File key GPG round-trip works

### Phase 2: CLI Commands

**Goal:** User-facing commands work.

**Files:**
- `src/cli.ts` - Main CLI entry point
- `src/commands/init.ts`
- `src/commands/encrypt.ts`
- `src/commands/share.ts`
- `src/commands/remove.ts`
- `src/commands/status.ts`
- `src/commands/filter.ts` - encrypt/decrypt subcommands

**Manual testing:**
```bash
# Initialize
seekgits init
cat secrets.json  # Should show version: 1, empty files

# Encrypt a file (uses default GPG key)
echo "SECRET=test" > .env
seekgits encrypt .env
cat secrets.json  # Should show .env with encrypted key

# Test encryption manually
cat .env | seekgits filter encrypt .env | xxd | head
# Should start with 00 53 45 45 4b 47 49 54 53 00 (\0SEEKGITS\0)

# Test round-trip
cat .env | seekgits filter encrypt .env | seekgits filter decrypt .env
# Should output: SECRET=test
```

### Phase 3: Git Integration

**Goal:** Transparent encryption via git filters.

**Files:**
- `src/commands/init.ts` - Enhanced with git config setup
- `src/lib/gitattributes.ts` - Manage .gitattributes

**Manual testing:**
```bash
# Setup
git init test-repo && cd test-repo
seekgits init
echo "SECRET=test" > .env
seekgits encrypt .env

# Commit
git add .env secrets.json .gitattributes
git commit -m "Add encrypted env"

# Verify encrypted in git
git show HEAD:.env | xxd | head
# Should show \0SEEKGITS\0 header

# Verify decrypted in working dir
cat .env
# Should show: SECRET=test

# Test determinism
touch .env  # Change mtime
git status
# Should NOT show .env as modified (deterministic encryption!)
```

### Phase 4: Polish

**Goal:** Good UX and edge case handling.

**Features:**
- Helpful error messages for common issues
- GPG key not found errors
- Missing recipient errors
- Clear git index on `encrypt` to prevent caching bugs

## Tech Stack

- **Runtime:** Bun (fast, built-in TypeScript)
- **CLI framework:** Commander.js or similar
- **Crypto:** Node.js `crypto` module (AES, HMAC)
- **GPG:** Shell out to `gpg` command

## File Structure

```
seekgits/
├── src/
│   ├── cli.ts              # Entry point
│   ├── commands/
│   │   ├── init.ts
│   │   ├── encrypt.ts
│   │   ├── share.ts
│   │   ├── remove.ts
│   │   ├── status.ts
│   │   └── filter.ts       # filter encrypt/decrypt
│   ├── lib/
│   │   ├── crypto.ts       # AES + HMAC
│   │   ├── gpg.ts          # GPG operations
│   │   ├── secrets.ts      # secrets.json management
│   │   ├── gitattributes.ts
│   │   └── git.ts          # Git operations
│   └── types.ts
├── tests/
│   ├── crypto.test.ts
│   ├── gpg.test.ts
│   └── integration.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Key Differences from v1 (GPG-only)

| Aspect | v1 (GPG-only) | v2 (Hybrid) |
|--------|---------------|-------------|
| Encryption | GPG multi-recipient | AES-256-CTR + HMAC-SHA256 |
| Determinism | No (random padding/session keys) | Yes (nonce from HMAC) |
| Key storage | None (GPG handles it) | `secrets.json` (GPG-wrapped) |
| Git status | False "modified" on unchanged files | Correct status |
| Performance | Slower (asymmetric crypto) | Faster (symmetric + GPG once) |

## Security Considerations

1. **File key exposure:** If `secrets.json` leaks, attacker still needs GPG private key
2. **Determinism trade-off:** Reveals if two files have identical content (acceptable for config files)
3. **Trust model:** You trust whoever can commit to `secrets.json`

## Why No Revoke Command?

A `revoke` command would be misleading and unsafe:

1. **Can't un-share a secret:** Once someone has decrypted a file, they have the plaintext. Removing them from `secrets.json` doesn't erase their memory or local copies.

2. **File key is compromised:** The revoked user still has the 64-byte file key. They could decrypt any past (or future, if they have repo access) versions of that file.

3. **Git history is permanent:** Even if you regenerate the file key, old commits still contain ciphertext encrypted with the old key.

4. **False sense of security:** A `revoke` command suggests access has been removed, when it hasn't.

**What to do instead when someone leaves the team:**
- Rotate the actual secrets (API keys, passwords, etc.)
- The encrypted file history is now useless because the secrets themselves changed
- This is the same as any secrets management - revocation means rotating secrets, not just removing access

## References

- [git-crypt](https://github.com/AGWA/git-crypt) - Inspiration for deterministic encryption
- [AES-CTR mode](https://en.wikipedia.org/wiki/Block_cipher_mode_of_operation#Counter_(CTR))
- [HMAC](https://en.wikipedia.org/wiki/HMAC)
