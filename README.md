# SeekGits

Commit secret files (like `.env`) to git, using GPG encryption. Uses Git's `.gitattributes` feature to keep files decrypted on disk, but encrypted on commit/push.

## Features

- **GPG-based encryption** - Uses your existing GPG keys, no custom key management
- **Multi-recipient support** - Encrypt files for multiple team members
- **Seamless integration** - Files are automatically encrypted on commit and decrypted on checkout using `.gitattributes`, so you can edit and diff files normally
- **Zero runtime dependencies** - Uses system GPG, no crypto libraries needed

## Prerequisites

**GPG must be installed on your system:**

```bash
brew install gnupg
```

**Generate a GPG key if you don't have one:**

```bash
gpg --gen-key
```

## Installation

This project is in development and not available on a package manager yet.

## Quick Start

```bash
# 1. Initialize seekgits in your project
seekgits init

# 2. Add a file to track (e.g., .env)
seekgits allow .env alice@example.com

# 3. Setup git filters for automatic encryption
seekgits install

# 4. Commit as usual - files are encrypted automatically!
git add .env .gitattributes secrets.json
git commit -m "Add encrypted .env"
```

## How It Works

### Architecture

SeekGits uses three key components:

1. **secrets.json** - Defines which files to encrypt and who can decrypt them
2. **.gitattributes** - Tells git which files to pass through seekgits filters
3. **Git filters** - Automatically encrypt/decrypt files during git operations

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

Files are encrypted using GPG's native multi-recipient encryption:

```json
{
  "encrypted": "-----BEGIN PGP MESSAGE-----\n...",
  "allowed_keys": ["alice@example.com", "bob@example.com"]
}
```

The `encrypted` field contains a single GPG message encrypted for all allowed keys. Any key holder can decrypt it with their private key.

### Git Filter Workflow

**On commit (clean filter):**
1. You edit `.env` in plaintext
2. `git add .env` reads the plaintext file
3. SeekGits encrypts it for all allowed keys
4. Git commits the encrypted JSON

**On checkout (smudge filter):**
1. `git checkout` reads encrypted JSON from git
2. SeekGits decrypts it with your private key
3. Plaintext `.env` appears in your working directory

**On diff:**
- `git diff` shows plaintext diffs, not encrypted JSON

## Commands

### `seekgits init`

Initialize seekgits in the current directory.

```bash
seekgits init
```

Creates:
- `secrets.json` - Empty secrets configuration
- `.gitattributes` - Git filter configuration

### `seekgits allow <file> <gpg-key-id>`

Add a GPG key to the allowed list for a file.

```bash
seekgits allow .env alice@example.com
seekgits allow .env 0x1234ABCD
seekgits allow config/secrets.yml bob@example.com
```

If the file is not yet tracked, it's automatically added to `.gitattributes`.

### `seekgits list`

List all tracked files and their allowed keys.

```bash
seekgits list
```

### `seekgits install`

Setup git filters for automatic encryption/decryption.

```bash
seekgits install
```

Run this once per repository clone. It configures git to use seekgits filters for files marked in `.gitattributes`.

### `seekgits encrypt <file>`

Manually encrypt a file (for testing/debugging).

```bash
seekgits encrypt .env > .env.encrypted
```

### `seekgits decrypt <file>`

Manually decrypt a file (for testing/debugging).

```bash
seekgits decrypt .env.encrypted > .env
cat .env.encrypted | seekgits decrypt
```

## Workflow Examples

### Single User Setup

```bash
# Initialize
seekgits init

# Add your key to .env
seekgits allow .env $(gpg --list-secret-keys --keyid-format SHORT | grep sec | awk '{print $2}' | cut -d'/' -f2)

# Setup git filters
seekgits install

# Create and commit secret file
echo "API_KEY=secret123" > .env
git add .env .gitattributes secrets.json
git commit -m "Add encrypted secrets"
```

### Team Setup

**Team member 1 (Alice):**

```bash
# Initialize project
seekgits init

# Add file with Alice's key
seekgits allow .env alice@example.com

# Setup filters and commit
seekgits install
git add .env .gitattributes secrets.json
git commit -m "Add encrypted .env"
git push
```

**Team member 2 (Bob) joins:**

```bash
# Clone repository
git clone <repo-url>
cd <repo>

# Export Bob's public key and send to Alice
gpg --armor --export bob@example.com > bob-public-key.asc
# Send bob-public-key.asc to Alice via email/Slack

# Add Bob's key to secrets.json
seekgits allow .env bob@example.com

# Commit and push updated secrets.json
git add secrets.json
git commit -m "Add Bob's key to .env"
git push
```

**Alice imports Bob's key and re-encrypts:**

```bash
# Import Bob's public key
gpg --import bob-public-key.asc

# Pull Bob's key addition
git pull

# Setup filters (if not done)
seekgits install

# Touch the file to trigger re-encryption
touch .env
git add .env
git commit -m "Re-encrypt .env for Bob"
git push
```

**Bob imports Alice's key and can now work:**

```bash
# Get Alice's public key and import it
gpg --import alice-public-key.asc

# Pull re-encrypted file
git pull

# Setup filters
seekgits install

# Checkout to decrypt
git checkout .

# .env is now decrypted and readable
cat .env

# Bob can now edit and commit (requires Alice's public key to re-encrypt)
echo "NEW_VAR=value" >> .env
git add .env
git commit -m "Add new variable"  # Encrypts for both Alice and Bob
git push
```

**Important**: Everyone must have everyone else's public keys imported to commit changes to shared files. When you commit, the file is encrypted for ALL keys in `allowed_keys`, so you need all those public keys in your keyring.

## Security Considerations

### Key Management

- **Private keys** are never shared or committed
- **Public keys** are identified by email, key ID, or fingerprint
- SeekGits uses your system's GPG keyring for all operations

### Team Collaboration Requirement

**Critical**: To commit changes to a shared secret file, you must have ALL teammates' public keys imported.

When you commit, SeekGits encrypts the file for every key in `allowed_keys`. If you're missing any public key, the commit will fail.

**Example**: If `.env` has `allowed_keys: ["alice@example.com", "bob@example.com", "charlie@example.com"]`, then:
- Alice needs Bob's and Charlie's public keys to commit
- Bob needs Alice's and Charlie's public keys to commit
- Charlie needs Alice's and Bob's public keys to commit

**Setup**: When onboarding a new team member, everyone should exchange and import public keys:

```bash
# Export your public key
gpg --armor --export your-email@example.com > your-name.asc

# Import teammates' public keys
gpg --import alice.asc
gpg --import bob.asc
gpg --import charlie.asc
```

### Access Control

- Adding a key to `allowed_keys` grants **permanent access** to that secret
- Removing a key only prevents future encryptions from including it
- **True revocation requires rotating the actual secrets**

### Trust Model

- SeekGits uses GPG's `--trust-model always` for automation
- You should verify key identities out-of-band before adding them
- Consider using GPG key signing for team environments

## Troubleshooting

### GPG not found

If you see "GPG not found", install GPG:

```bash
brew install gnupg
```

### No GPG keys found

Generate a GPG key:

```bash
gpg --gen-key
```

### Decryption fails

This can happen if:
- You don't have the private key needed to decrypt
- Your key is not in the allowed_keys list
- The file is corrupted

Check the allowed keys:

```bash
seekgits list
```

### Files not encrypting automatically

Make sure you've run:

```bash
seekgits install
```

And check that the file is in `.gitattributes`:

```bash
cat .gitattributes
```

## Development

### Running Tests

```bash
bun test
```

### Building

```bash
bun run build
```

### Project Structure

```
seekgits/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── commands/             # Command implementations
│   │   ├── init.ts
│   │   ├── allow.ts
│   │   ├── list.ts
│   │   ├── encrypt.ts
│   │   ├── decrypt.ts
│   │   ├── install.ts
│   │   ├── filter-clean.ts   # Git clean filter
│   │   └── filter-smudge.ts  # Git smudge filter
│   ├── lib/
│   │   ├── gpg.ts            # GPG wrapper
│   │   ├── secrets.ts        # secrets.json management
│   │   └── config.ts         # Configuration utilities
│   └── types.ts              # TypeScript types
├── tests/                    # Test files
└── package.json
```
