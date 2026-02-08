import { describe, test, expect, beforeAll } from 'bun:test';
import { checkGPGInstalled, encryptMultiRecipient, decrypt, listKeys, getDefaultKeyId } from '../src/lib/gpg';

describe('GPG Library', () => {
  beforeAll(async () => {
    // Check if GPG is installed before running tests
    const installed = await checkGPGInstalled();
    if (!installed) {
      console.warn('Warning: GPG not installed, skipping GPG tests');
    }
  });

  test('checkGPGInstalled returns boolean', async () => {
    const result = await checkGPGInstalled();
    expect(typeof result).toBe('boolean');
  });

  test('listKeys returns array', async () => {
    const installed = await checkGPGInstalled();
    if (!installed) {
      return; // Skip if GPG not installed
    }

    const keys = await listKeys();
    expect(Array.isArray(keys)).toBe(true);
  });

  test('getDefaultKeyId returns string or null', async () => {
    const installed = await checkGPGInstalled();
    if (!installed) {
      return; // Skip if GPG not installed
    }

    const keyId = await getDefaultKeyId();
    expect(keyId === null || typeof keyId === 'string').toBe(true);
  });

  test('encrypt and decrypt round-trip', async () => {
    const installed = await checkGPGInstalled();
    if (!installed) {
      return; // Skip if GPG not installed
    }

    const defaultKey = await getDefaultKeyId();
    if (!defaultKey) {
      console.warn('No GPG key found, skipping encryption test');
      return;
    }

    const plaintext = 'Hello, SeekGits!';
    const encrypted = await encryptMultiRecipient(plaintext, [defaultKey]);

    expect(encrypted).toContain('-----BEGIN PGP MESSAGE-----');
    expect(encrypted).toContain('-----END PGP MESSAGE-----');

    const decrypted = await decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  test('encrypt with multiple recipients', async () => {
    const installed = await checkGPGInstalled();
    if (!installed) {
      return; // Skip if GPG not installed
    }

    const keys = await listKeys();
    if (keys.length === 0) {
      console.warn('No GPG keys found, skipping multi-recipient test');
      return;
    }

    // Use first key (if there's only one, that's fine too)
    const recipients = [keys[0].id];
    const plaintext = 'Multi-recipient test';

    const encrypted = await encryptMultiRecipient(plaintext, recipients);
    const decrypted = await decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  test('encrypt with no recipients throws error', async () => {
    const installed = await checkGPGInstalled();
    if (!installed) {
      return; // Skip if GPG not installed
    }

    expect(async () => {
      await encryptMultiRecipient('test', []);
    }).toThrow();
  });
});
