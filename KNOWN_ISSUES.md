# Known Issues

## Non-Deterministic Encryption Causes False "Modified" Status

**Status:** Confirmed issue, no clean solution yet

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

### Possible Solutions

**Solution 1: Deterministic encryption mode**
- Add `--encrypt-to-self` and store encrypted with deterministic mode
- Problem: GPG doesn't have a true deterministic mode
- Would need custom encryption wrapper

**Solution 2: Store hash of plaintext**
- Store SHA256 hash of plaintext in encrypted JSON
- Git could use this to detect real changes
- Requires changes to filter logic

**Solution 3: Use git's built-in .gitattributes options**
```
test.env filter=seekgits diff=seekgits -diff
```
- The `-diff` flag tells git "don't show diffs for this file"
- Might reduce confusion but doesn't fix root issue

**Solution 4: Custom git diff driver**
- Implement custom diff driver that always decrypts before comparing
- More complex but could provide better UX

**Solution 5: Accept and document**
- This is a known limitation of git filters with non-deterministic output
- Document clearly in README
- Provide `seekgits verify` command to check if real changes exist

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
