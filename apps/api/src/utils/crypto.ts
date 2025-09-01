// apps/api/src/utils/crypto.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

export class CryptoHelper {
  /**
   * Generate a cryptographically secure random string
   */
  static generateRandomString(length: number = 32): string {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }

  /**
   * Generate a secure random token
   */
  static generateToken(length: number = 64): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Hash a password with salt
   */
  static async hashPassword(password: string): Promise<{ hash: string; salt: string }> {
    return new Promise((resolve, reject) => {
      const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');

      crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
        if (err) reject(err);
        resolve({
          hash: derivedKey.toString('hex'),
          salt
        });
      });
    });
  }

  /**
   * Verify a password against hash and salt
   */
  static async verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
        if (err) reject(err);
        resolve(hash === derivedKey.toString('hex'));
      });
    });
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  static encrypt(text: string, key: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, key);
    cipher.setAAD(Buffer.from('chatverse', 'utf8'));

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  static decrypt(encryptedData: { encrypted: string; iv: string; tag: string }, key: string): string {
    const decipher = crypto.createDecipher(ALGORITHM, key);
    decipher.setAAD(Buffer.from('chatverse', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Generate HMAC signature
   */
  static generateHMAC(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  static verifyHMAC(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Hash data using SHA-256
   */
  static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate UUID v4
   */
  static generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate a secure session ID
   */
  static generateSessionId(): string {
    return this.generateUUID() + '_' + Date.now() + '_' + this.generateRandomString(16);
  }

  /**
   * Constant-time string comparison
   */
  static timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(a, 'utf8'),
      Buffer.from(b, 'utf8')
    );
  }

  /**
   * Generate API key
   */
  static generateApiKey(): string {
    const prefix = 'cv_';
    const randomPart = this.generateRandomString(40);
    return prefix + randomPart;
  }

  /**
   * Create checksum for data integrity
   */
  static createChecksum(data: string): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }
}

// Export individual functions for convenience
export const {
  generateRandomString,
  generateToken,
  hashPassword,
  verifyPassword,
  encrypt,
  decrypt,
  generateHMAC,
  verifyHMAC,
  hash,
  generateUUID,
  generateSessionId,
  timingSafeEqual,
  generateApiKey,
  createChecksum
} = CryptoHelper;
