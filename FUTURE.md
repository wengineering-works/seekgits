# Future Plans & Ideas

This document outlines potential improvements and features for SeekGits.

## Embedding Public Keys in secrets.json

**Current workflow:**
- Team members must manually exchange and import GPG public keys
- Everyone needs everyone else's public keys to commit changes
- Key exchange happens out-of-band (email, Slack, etc.)

**Proposed change:** Include public key data directly in `secrets.json`

### Option A: Embed ASCII-armored public keys

```json
{
  "files": {
    ".env": {
      "allowed_keys": ["alice@example.com", "bob@example.com"]
    }
  },
  "public_keys": {
    "alice@example.com": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n...",
    "bob@example.com": "-----BEGIN PGP PUBLIC KEY BLOCK-----\n..."
  }
}
```

**Pros:**
- No manual key exchange needed
- Automatic import when you clone/pull
- Single source of truth for team access
- Easier onboarding for new team members
- Keys are version-controlled alongside access control

**Cons:**
- Makes `secrets.json` much larger (RSA keys are ~3KB, Ed25519 ~500 bytes)
- Trust model changes: you trust whoever commits the key, not GPG's web of trust
- Still need to verify key fingerprints somehow
- Git history shows all past public keys

### Option B: Store key fingerprints only

```json
{
  "files": {
    ".env": {
      "allowed_keys": [
        {
          "email": "alice@example.com",
          "fingerprint": "8242451656A0141957CCE8C6D9519D6B27EB9BCE"
        }
      ]
    }
  }
}
```

- Verify fingerprints when importing keys manually
- Smaller file size
- Still requires manual key exchange but with verification

### Implementation considerations

If we embed keys:

1. **Auto-import command**: `seekgits install` could automatically import all keys from `secrets.json`

2. **Key verification**: Show fingerprints and prompt for confirmation on first import

3. **Key rotation**: When someone generates a new key, they update `secrets.json` with new public key

4. **Keyserver fallback**: Try fetching from `keys.openpgp.org` if key not embedded

### Decision needed

This is a significant architectural decision that affects:
- Trust model (implicit trust vs. explicit verification)
- File size and git history
- User experience (convenience vs. security)

**Recommendation:** Start without embedding keys, add as optional feature later if demand exists. Could be controlled by a flag:

```bash
seekgits allow .env alice@example.com --embed-key
```

## Other Future Improvements

### 1. Key Rotation Support

**Problem:** When someone rotates their GPG key, all files need re-encryption.

**Possible solution:**
```bash
seekgits rotate alice@example.com NEW_KEY_ID
# - Updates secrets.json
# - Re-encrypts all files Alice has access to
# - Creates a single commit with all changes
```

### 2. Symmetric Encryption Option

**Use case:** Single-user projects don't need multi-recipient complexity.

```bash
seekgits init --symmetric
# Uses a single passphrase instead of GPG keys
# Stored in ~/.seekgits/config or env var
```

### 3. Audit Log

Track who had access to which files at what time:

```bash
seekgits audit .env
# Shows git log of secrets.json changes affecting .env
# Lists all keys that have ever had access
```

### 4. Keyserver Integration

Automatically fetch public keys from keyservers:

```bash
seekgits allow .env alice@example.com --fetch-key
# Tries to download from keys.openpgp.org
# Prompts to verify fingerprint
```

### 5. Pre-commit Hook

Automatically validate before committing:

```bash
seekgits install --hooks
# Installs git pre-commit hook that:
# - Checks all required public keys are available
# - Warns if secrets.json changed but files not re-encrypted
# - Validates .gitattributes is in sync with secrets.json
```

### 6. Diff Tool Integration

Show decrypted diffs without git filters:

```bash
seekgits diff .env
# Shows plaintext diff even if filters not installed
```

### 7. Bulk Operations

```bash
seekgits allow-all alice@example.com
# Adds Alice to all tracked files

seekgits re-encrypt
# Re-encrypts all tracked files (useful after key changes)
```

### 8. Configuration File

Support project-level config in `.seekgits/config`:

```json
{
  "default_keys": ["alice@example.com"],
  "keyserver": "keys.openpgp.org",
  "auto_import_keys": true,
  "require_key_verification": true
}
```

### 9. Multi-file Commands

```bash
seekgits allow "*.env" alice@example.com
# Adds Alice to all .env files

seekgits allow --interactive
# Interactive TUI for managing access
```

### 10. Status Command

```bash
seekgits status
# Shows:
# - Which files are tracked
# - Which have uncommitted changes
# - Missing public keys
# - Files that need re-encryption
```

### 11. Verify Command

```bash
seekgits verify
# Checks:
# - All public keys are imported
# - All tracked files are properly encrypted in git
# - .gitattributes matches secrets.json
# - Can decrypt all tracked files
```

### 12. Export/Import Configuration

```bash
seekgits export > project-secrets-config.json
seekgits import < project-secrets-config.json

# Useful for:
# - Moving between repositories
# - Backup/restore
# - Templating new projects
```

### 13. Revoke Command

```bash
seekgits revoke .env bob@example.com
# Removes Bob from .env
# WARNS that Bob already saw the secrets
# Suggests rotating the actual secrets
```

### 14. Directory Support

```bash
seekgits allow config/ alice@example.com
# Tracks all files in config/ directory
# Updates .gitattributes with pattern
```

### 15. CI/CD Integration

Support for encrypted secrets in CI:

```bash
# Set up a CI-specific key
seekgits allow .env ci@example.com --role ci

# In CI, decrypt without git filters
seekgits decrypt-for-ci .env
```

## Non-Features (Things We Won't Do)

### 1. Custom Crypto Library

**Why not:** GPG is battle-tested and widely available. Rolling our own crypto is risky.

### 2. Cloud Key Storage

**Why not:** Private keys should never leave the developer's machine. This breaks the security model.

### 3. Automatic Key Distribution

**Why not:** Key verification is critical. Automation without verification is dangerous.

### 4. Binary File Encryption

**Why not:** Git is optimized for text. Large encrypted binaries don't diff well. Use Git LFS or S3 instead.

### 5. Secret Scanning/Detection

**Why not:** Out of scope. Use dedicated tools like `gitleaks` or `trufflehog` for this.

## Contributing Ideas

Have suggestions? Open an issue or PR to discuss!

Consider:
- **User experience:** Does it make the tool easier to use?
- **Security:** Does it maintain or improve security?
- **Complexity:** Is the added complexity worth the benefit?
- **Compatibility:** Does it work with existing workflows?
