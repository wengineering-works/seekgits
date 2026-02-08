/**
 * Configuration structure for secrets.json
 */
export interface SecretsConfig {
  files: {
    [filename: string]: FileConfig;
  };
}

/**
 * Configuration for a single tracked file
 */
export interface FileConfig {
  allowed_keys: string[];
}

/**
 * Structure of an encrypted file
 */
export interface EncryptedFile {
  encrypted: string;
  recipients: string[];
}

/**
 * GPG key information
 */
export interface GPGKey {
  id: string;
  email?: string;
  name?: string;
  fingerprint?: string;
}

/**
 * Result of a GPG operation
 */
export interface GPGResult {
  success: boolean;
  output?: string;
  error?: string;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}
