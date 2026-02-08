# Known Issues

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
