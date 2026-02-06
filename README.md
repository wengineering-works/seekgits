# SeekGits - Planning Document

Tool for safely committing secret files (like .env) to git using public key encryption.

## Core Concept

Use asymmetric encryption so files can be encrypted for multiple team members. Each encrypted file contains multiple versions - one encrypted for each authorized public key.

## Architecture

### secrets.json
Lives in project root (committed to git). Defines access control.

```json
{
  "files": {
    ".env": {
      "allowed_keys": ["pk_abc123...", "pk_def456..."]
    },
    ".env.production": {
      "allowed_keys": ["pk_abc123..."]
    }
  }
}
```

### Encrypted file format
`.env.encrypted` (committed to git):
```json
{
  "pk_abc123...": "base64_encrypted_content...",
  "pk_def456...": "base64_encrypted_content..."
}
```

Each key encrypts the same plaintext content, so any authorized user can decrypt.

### Key storage
- Private keys: `~/.seekgits/private_key` (never committed)
- Public key derived from private key
- Users share public keys to grant access

## Commands to Implement

```bash
seekgits init              # Generate keypair, create secrets.json
seekgits encrypt <file>    # Encrypt for all allowed_keys in secrets.json
seekgits decrypt <file>    # Decrypt with local private key
seekgits allow <file> <pk> # Add public key to allowed_keys
seekgits list              # Show all tracked files and who has access
```

**Note on revocation:** No revoke command - once someone has access to secrets, they've seen them. Removing a key from `allowed_keys` only prevents future re-encryptions from including that key. True revocation requires rotating the actual secrets.

## Workflow

1. User runs `seekgits init` - generates keypair
2. Create `.env` file normally
3. User runs `seekgits encrypt .env` - creates `.env.encrypted` with their public key
4. Commit both `secrets.json` and `.env.encrypted`
5. Team member clones, runs `seekgits allow .env <their_public_key>`
6. Re-encrypt and commit
7. Team member pulls and runs `seekgits decrypt .env`

## Git Integration

Use git clean/smudge filters to make encryption/decryption transparent.

### How It Works

**File mapping (committed to repo):**

`.gitattributes` specifies which files use which filter:
```
.env filter=seekgits diff=seekgits
.env.production filter=seekgits diff=seekgits
.env.* filter=seekgits diff=seekgits
```

When someone clones, they get `.gitattributes`. Git knows these files need the "seekgits" filter, but doesn't know what commands to run yet.

**Filter setup (local, once per clone):**

Run `seekgits install` to configure the filter commands:
```bash
git config filter.seekgits.clean 'seekgits filter-clean %f'
git config filter.seekgits.smudge 'seekgits filter-smudge %f'
git config diff.seekgits.textconv 'seekgits filter-smudge'
```

This tells git what to execute when it sees `filter=seekgits` in `.gitattributes`.

The config keys:
- `filter.seekgits.clean` - command for working dir → git (encrypt)
- `filter.seekgits.smudge` - command for git → working dir (decrypt)
- `diff.seekgits.textconv` - command to show plaintext in diffs

Note: `textconv` reuses the smudge command because both transform git content (encrypted) → plaintext.

**Filter execution:**

**Clean filter** (working directory → git, runs on `git add`):
- Receives plaintext `.env` on stdin
- Reads `secrets.json` from disk to get allowed_keys
- Encrypts content for each public key
- Outputs encrypted JSON to stdout
- Git commits the encrypted version

**Smudge filter** (git → working directory, runs on `git checkout`):
- Receives encrypted JSON on stdin
- Decrypts using local private key
- Outputs plaintext to stdout
- User sees plaintext `.env` on disk

**Textconv** (for diffs):
- `git diff` shows plaintext diff, not encrypted JSON

### User Experience

After `seekgits install`:
- Edit `.env` normally (plaintext file)
- `git add .env` → auto-encrypts
- `git commit` → encrypted version committed
- `git pull` → auto-decrypts
- `git diff` → shows plaintext diff
- Applications read `.env` directly (it's plaintext on disk)

## Open Questions

- Should we auto-gitignore the plaintext `.env`?
- How to handle key rotation?
- Should we support symmetric encryption mode for single-user projects?
- Encryption algorithm? (RSA, NaCl box, age?)
- File size limits for encryption?
- Should `init` command auto-create .gitattributes and .gitignore?
