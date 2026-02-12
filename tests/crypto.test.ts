import { describe, test, expect } from 'bun:test';
import { generateFileKey, encrypt, decrypt, isEncrypted } from '../src/lib/crypto';
import { MAGIC_HEADER, FILE_KEY_SIZE } from '../src/types';

describe('crypto', () => {
  describe('generateFileKey', () => {
    test('generates 64-byte key', () => {
      const key = generateFileKey();
      expect(key.length).toBe(FILE_KEY_SIZE);
    });

    test('generates different keys each time', () => {
      const key1 = generateFileKey();
      const key2 = generateFileKey();
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('encrypt/decrypt', () => {
    test('round-trip works', () => {
      const fileKey = generateFileKey();
      const plaintext = Buffer.from('SECRET=hello123');

      const encrypted = encrypt(plaintext, fileKey);
      const decrypted = decrypt(encrypted, fileKey);

      expect(decrypted.toString()).toBe(plaintext.toString());
    });

    test('encrypted output has correct header', () => {
      const fileKey = generateFileKey();
      const plaintext = Buffer.from('test');

      const encrypted = encrypt(plaintext, fileKey);

      expect(encrypted.subarray(0, MAGIC_HEADER.length).equals(MAGIC_HEADER)).toBe(true);
    });

    test('DETERMINISTIC: same plaintext + same key = same ciphertext', () => {
      const fileKey = generateFileKey();
      const plaintext = Buffer.from('SECRET=deterministic');

      const encrypted1 = encrypt(plaintext, fileKey);
      const encrypted2 = encrypt(plaintext, fileKey);

      expect(encrypted1.equals(encrypted2)).toBe(true);
    });

    test('different plaintext = different ciphertext', () => {
      const fileKey = generateFileKey();
      const plaintext1 = Buffer.from('SECRET=one');
      const plaintext2 = Buffer.from('SECRET=two');

      const encrypted1 = encrypt(plaintext1, fileKey);
      const encrypted2 = encrypt(plaintext2, fileKey);

      expect(encrypted1.equals(encrypted2)).toBe(false);
    });

    test('different key = different ciphertext', () => {
      const fileKey1 = generateFileKey();
      const fileKey2 = generateFileKey();
      const plaintext = Buffer.from('SECRET=test');

      const encrypted1 = encrypt(plaintext, fileKey1);
      const encrypted2 = encrypt(plaintext, fileKey2);

      expect(encrypted1.equals(encrypted2)).toBe(false);
    });

    test('cannot decrypt with wrong key', () => {
      const fileKey1 = generateFileKey();
      const fileKey2 = generateFileKey();
      const plaintext = Buffer.from('SECRET=test');

      const encrypted = encrypt(plaintext, fileKey1);

      // Decryption with wrong key produces garbage, not the original
      const decrypted = decrypt(encrypted, fileKey2);
      expect(decrypted.toString()).not.toBe(plaintext.toString());
    });

    test('handles empty plaintext', () => {
      const fileKey = generateFileKey();
      const plaintext = Buffer.from('');

      const encrypted = encrypt(plaintext, fileKey);
      const decrypted = decrypt(encrypted, fileKey);

      expect(decrypted.toString()).toBe('');
    });

    test('handles large plaintext', () => {
      const fileKey = generateFileKey();
      const plaintext = Buffer.alloc(100000, 'x'); // 100KB

      const encrypted = encrypt(plaintext, fileKey);
      const decrypted = decrypt(encrypted, fileKey);

      expect(decrypted.equals(plaintext)).toBe(true);
    });

    test('handles binary data', () => {
      const fileKey = generateFileKey();
      const plaintext = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

      const encrypted = encrypt(plaintext, fileKey);
      const decrypted = decrypt(encrypted, fileKey);

      expect(decrypted.equals(plaintext)).toBe(true);
    });
  });

  describe('isEncrypted', () => {
    test('returns true for encrypted data', () => {
      const fileKey = generateFileKey();
      const encrypted = encrypt(Buffer.from('test'), fileKey);

      expect(isEncrypted(encrypted)).toBe(true);
    });

    test('returns false for plaintext', () => {
      expect(isEncrypted(Buffer.from('SECRET=test'))).toBe(false);
    });

    test('returns false for empty buffer', () => {
      expect(isEncrypted(Buffer.from(''))).toBe(false);
    });

    test('returns false for short buffer', () => {
      expect(isEncrypted(Buffer.from('short'))).toBe(false);
    });
  });
});
