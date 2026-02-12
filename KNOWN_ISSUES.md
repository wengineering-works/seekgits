# Known Issues

## Non-Deterministic Encryption Causes False "Modified" Status

**Status:** Proposed solution below (hybrid symmetric/GPG encryption)

### Symptom
After running `git reset --hard HEAD` or `git checkout <file>`, git status shows the file as modified even though `git diff` shows no changes.

```bash
git reset --hard HEAD
git status
# Shows: modified:   test.env

git diff test.env
# Shows: (no output - no actual changes)
```

### Root Cause
GPG encryption is non-deterministic - encrypting the same plaintext twice produces different encrypted output due to:
- Random padding
- Random session keys
- Timestamps in PGP format

When git checks if a file has changed:
1. Checks file stats (timestamp, size) first (fast check)
2. If stats changed, runs clean filter on working directory
3. Compares clean filter output to what's in git
4. Encrypted outputs differ (even though plaintext is same)
5. Git shows file as modified

### Impact
- Confusing UX - users think file changed when it didn't
- `git status` always shows tracked files as modified after certain operations
- Can't trust `git status` for encrypted files
- Might accidentally commit "no-change" commits

### Workarounds

**Workaround 1: Ignore it**
- If `git diff` shows no changes, ignore the `git status` warning
- Only commit when you actually made changes

**Workaround 2: Use git diff to check**
```bash
git diff test.env  # If empty, no real changes
```

**Workaround 3: Add and reset** (refreshes index)
```bash
git add test.env
git reset test.env
# Sometimes clears the false modification flag
```

### Proposed Solution: Hybrid Symmetric/GPG Encryption

Based on how [git-crypt](https://github.com/AGWA/git-crypt) achieves deterministic encryption.

#### How git-crypt Works

git-crypt uses AES-256-CTR with a synthetic IV derived from HMAC-SHA1 of the plaintext:

```
Keys (stored in .git-crypt/keys/default):
- AES key: 32 bytes (randomly generated)
- HMAC key: 32 bytes (randomly generated)

Encryption:
1. nonce = HMAC-SHA1(plaintext, hmac_key)
2. ciphertext = AES-256-CTR(plaintext, aes_key, nonce)
3. output = "\0GITCRYPT\0" + nonce + ciphertext

File format:
| Offset | Size | Content                      |
|--------|------|------------------------------|
| 0      | 10   | \0GITCRYPT\0 (magic header)  |
| 10     | 20   | HMAC-SHA1 nonce              |
| 30     | N    | AES-256-CTR ciphertext       |
```

**Why it's deterministic:** The nonce is derived from the plaintext itself via HMAC. Same plaintext → same HMAC → same nonce → same ciphertext.

#### Why Two Keys? (AES + HMAC Explained)

AES-CTR doesn't just take `key + content`. It requires a **nonce** (number used once):

```
ciphertext = AES-CTR(aes_key, nonce, plaintext)
```

**The problem with random nonces:**
```
nonce = random_bytes(12)
ciphertext = AES-CTR(key, nonce, plaintext)
```
Random nonce means same plaintext → different ciphertext each time. Git sees the file as "modified" even when content hasn't changed.

**The solution - derive nonce from content:**
```
nonce = HMAC-SHA256(hmac_key, plaintext)   // deterministic!
ciphertext = AES-CTR(aes_key, nonce, plaintext)
```
Now same plaintext → same nonce → same ciphertext. Git is happy.

**Why HMAC instead of a plain hash?**
We could use `nonce = SHA256(plaintext)`, but then anyone could compute the nonce by hashing the plaintext. With HMAC, you need the secret `hmac_key` to compute it, adding a layer of security.

**Why SHA256 over SHA1?**
git-crypt uses HMAC-SHA1, which is still secure for HMAC purposes. However, SeekGits uses HMAC-SHA256 because:
- SHA256 is the modern standard with no legacy concerns
- Produces 32-byte output (vs 20 for SHA1), matching our key sizes
- Consistent with AES-256 security level

**Why separate keys for AES and HMAC?**
Using the same key for both would be a cryptographic weakness. Separate keys ensure:
- Domain separation: a flaw in one algorithm wouldn't compromise the other
- Provable security: security proofs assume independent keys
- Standard practice: this is how TLS, IPsec, and other protocols do it

**Summary of the two keys:**
| Key | Size | Purpose |
|-----|------|---------|
| `aes_key` | 32 bytes | Encrypts the content (AES-256-CTR) |
| `hmac_key` | 32 bytes | Derives the nonce via HMAC-SHA256 (makes encryption deterministic) |

Both are bundled together as one 64-byte "file key" and encrypted to each recipient via GPG.

#### How SeekGits Would Differ from git-crypt

| Feature | git-crypt | SeekGits (proposed) |
|---------|-----------|---------------------|
| **HMAC algorithm** | HMAC-SHA1 (20-byte nonce) | HMAC-SHA256 (32-byte nonce) |
| **Key granularity** | One key for entire repo | Per-file keys |
| **Access control** | All-or-nothing | Per-file recipient lists |
| **Key storage** | `.git-crypt/keys/` (gitignored) | `secrets.json` (committed, encrypted) |
| **Key distribution** | GPG-encrypted key file shared out-of-band | GPG-wrapped keys inline in secrets.json |
| **Adding recipients** | Re-run `git-crypt add-gpg-user` | `seekgits allow <file> <key>` |
| **Revoking access** | Not supported (must rotate all secrets) | Per-file: regenerate that file's key |
| **File patterns** | `.gitattributes` patterns | Explicit file list in secrets.json |

#### Proposed SeekGits Architecture

**secrets.json format:**
```json
{
  "files": {
    ".env": {
      "allowed_keys": ["alice@example.com", "bob@example.com"],
      "file_key": {
        "alice@example.com": "-----BEGIN PGP MESSAGE-----\n<aes+hmac key encrypted to alice>...",
        "bob@example.com": "-----BEGIN PGP MESSAGE-----\n<aes+hmac key encrypted to bob>..."
      }
    }
  }
}
```

**Encryption flow (clean filter):**
1. Look up file's symmetric key from `secrets.json`
2. Decrypt symmetric key using user's GPG private key (once, can be cached in memory)
3. Compute `nonce = HMAC-SHA256(hmac_key, plaintext)` (use first 16 bytes for AES-CTR IV)
4. Encrypt `ciphertext = AES-256-CTR(aes_key, nonce[0:16], plaintext)`
5. Output: `\0SEEKGITS\0` + nonce (32 bytes) + ciphertext

**Encrypted file format:**
```
| Offset | Size | Content                       |
|--------|------|-------------------------------|
| 0      | 10   | \0SEEKGITS\0 (magic header)   |
| 10     | 32   | HMAC-SHA256 nonce             |
| 42     | N    | AES-256-CTR ciphertext        |
```

**Decryption flow (smudge filter):**
1. Look up file's symmetric key from `secrets.json`
2. Decrypt symmetric key using user's GPG private key
3. Read nonce from file header
4. Decrypt with AES-256-CTR

**Key generation (on `seekgits allow`):**
1. If file has no key yet: generate 64 random bytes (32 AES + 32 HMAC)
2. Encrypt the symmetric key to the recipient using GPG
3. Store encrypted key in `secrets.json`

**Adding a new recipient:**
1. Decrypt existing symmetric key (requires being an existing recipient)
2. Re-encrypt symmetric key to new recipient using GPG
3. Add to `secrets.json`

#### Benefits Over Current GPG-Only Approach

- **Deterministic:** Same plaintext always produces same ciphertext
- **Efficient:** Symmetric crypto is fast; GPG only used for key exchange
- **Git-friendly:** No false "modified" status on unchanged files

#### Trade-offs

- **Complexity:** More moving parts than pure GPG
- **secrets.json size:** Contains encrypted key material (grows with recipients)
- **Revocation:** Requires re-generating file key and re-encrypting the file
- **Key recovery:** If all recipients lose access, file key is unrecoverable

#### Implementation Notes

- Use Node.js `crypto` module for AES-256-CTR and HMAC-SHA1
- GPG still handles asymmetric encryption of the symmetric keys
- File header `\0SEEKGITS\0` distinguishes from git-crypt and legacy GPG format
- Consider migration path from current GPG-only encrypted files

### Related Issues
- This is separate from the "blank file" bug
- This happens even when everything is working correctly
- Related to how git optimizes file change detection

### Testing
Reproduce:
```bash
# Setup
seekgits init
echo "SECRET=test" > .env
seekgits allow .env <key>
seekgits install
git add .env secrets.json .gitattributes
git commit -m "test"

# Trigger the issue
git checkout .
git status  # Shows .env as modified

git diff .env  # Shows no changes (plaintext identical)
git diff --no-textconv .env  # Shows encrypted versions differ
```

### Priority
**Medium** - Annoying but not breaking. Users can work around it. Should be documented clearly.

## Git Index Caching Bug

**Status:** Workaround exists, but root cause may not be fully resolved

### Symptom
Files appear blank (0 bytes) when staged/committed to git, even though:
- The file exists with content in working directory
- `secrets.json` and `.gitattributes` are configured correctly
- Git filters are installed
- `seekgits status <file>` shows "Filter working: Produces encrypted output"

### Diagnosis
```bash
seekgits status webapp/.env
```

Shows:
```
✗ Staged content: EMPTY (0 bytes) - FILE IS BLANK IN GIT!
```

But filter test passes:
```
✓ Filter working: Produces encrypted output
```

### Root Cause
Git caches files in `.git/index` before filters are configured. When you:
1. Create a file
2. Stage it (`git add`)
3. Later add it to `.gitattributes` and configure filters
4. Try to stage again

Git sees "no changes" and reuses the cached (unfiltered/blank) version from the index.

### Current Workaround
```bash
seekgits reindex <file>  # Clears git index entry
git add <file>           # Re-adds with filter applied
```

Or manually:
```bash
git rm --cached --ignore-unmatch <file>
git add <file>
```

### Why This Might Still Happen

**Current mitigations:**
1. `seekgits allow` automatically calls `clearGitIndexEntry()` for new files
2. `seekgits allow` can be re-run (returns false, clears index anyway)
3. `seekgits reindex` command explicitly clears index

**Potential gaps:**
1. **Timing issue:** If user runs `git add` between `seekgits allow` and when they see the output, the clear might not help
2. **Concurrent operations:** Multiple terminal windows, IDE auto-staging, etc.
3. **Partial failure:** `git rm --cached` might fail silently in some cases
4. **User doesn't know to reindex:** First-time users might not discover the workaround

### Possible Future Solutions

1. **Pre-commit hook:** Validate files are encrypted before allowing commit
   - Reject commits with plaintext/blank tracked files
   - Auto-reindex and retry

2. **Post-allow auto-reindex:** After `seekgits allow`, automatically:
   ```bash
   git rm --cached <file> 2>/dev/null
   git add <file> 2>/dev/null
   ```
   (But this might be too aggressive/surprising)

3. **Better detection:** Check if file is already staged before `allow`
   - Warn user: "File is already staged, run: seekgits reindex"
   - Or auto-clear index proactively

4. **Git attributes normalization:** Research if `git add --renormalize` helps
   - Might force git to re-run filters on all tracked files

5. **Documentation:** Add troubleshooting section to README
   - "File appears blank in git?" → Run `seekgits status <file>` → Run `seekgits reindex <file>`

### Testing Needed

Create reproducible test case:
```bash
# Start fresh repo
git init test-blank-bug
cd test-blank-bug

# Create and stage file BEFORE seekgits
echo "SECRET=test" > .env
git add .env

# NOW configure seekgits
seekgits init
seekgits allow .env <key>
seekgits install

# Try to commit - is it blank?
git commit -m "test"
git show HEAD:.env  # Check if blank

# Does reindex fix it?
seekgits reindex .env
git add .env
git commit --amend --no-edit
git show HEAD:.env  # Should be encrypted now
```

### Related Code

- `src/lib/config.ts` - `clearGitIndexEntry()` function
- `src/commands/allow.ts` - Calls `clearGitIndexEntry()` for tracked files
- `src/commands/reindex.ts` - Dedicated command to clear index
- `src/commands/status.ts` - Detects blank files in index

### User Reports

- First observed: Feb 8, 2026 (during initial development)
- Reproduced in: `peekgit` project with `webapp/.env`
- Workaround confirmed working: `seekgits reindex` + `git add`

### Priority

**Medium-High** - This is a critical bug that breaks core functionality, but:
- Workaround exists and works
- Can be detected with `seekgits status`
- Only happens in specific timing scenarios
- Users can recover without data loss

Should be addressed before 1.0 release.
