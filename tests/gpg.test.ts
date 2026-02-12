import { describe, test, expect } from 'bun:test';
import {
  checkGPGInstalled,
  getDefaultKeyId,
  listKeys,
  gpgEncrypt,
  gpgDecrypt,
  verifyKeyExists,
} from '../src/lib/gpg';
import { generateFileKey } from '../src/lib/crypto';

describe('gpg', () => {
  test('GPG is installed', async () => {
    const installed = await checkGPGInstalled();
    expect(installed).toBe(true);
  });

  test('can list keys', async () => {
    const keys = await listKeys();
    // Should have at least one key if GPG is set up
    expect(Array.isArray(keys)).toBe(true);
  });

  test('can get default key ID', async () => {
    const keyId = await getDefaultKeyId();
    // Should have a default key if GPG is set up properly
    expect(keyId).not.toBeNull();
    console.log('Default key ID:', keyId);
  });

  test('encrypt/decrypt file key round-trip', async () => {
    const keyId = await getDefaultKeyId();
    if (!keyId) {
      console.log('Skipping: no default GPG key');
      return;
    }

    const fileKey = generateFileKey();

    // Encrypt the file key to ourselves
    const encrypted = await gpgEncrypt(fileKey, keyId);
    expect(encrypted).toContain('-----BEGIN PGP MESSAGE-----');

    // Decrypt it back
    const decrypted = await gpgDecrypt(encrypted);
    expect(decrypted.equals(fileKey)).toBe(true);
  });

  test('verifyKeyExists works', async () => {
    const keyId = await getDefaultKeyId();
    if (!keyId) {
      console.log('Skipping: no default GPG key');
      return;
    }

    const exists = await verifyKeyExists(keyId);
    expect(exists).toBe(true);

    const notExists = await verifyKeyExists('nonexistent@example.com');
    expect(notExists).toBe(false);
  });
});
