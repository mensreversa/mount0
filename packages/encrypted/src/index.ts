import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export interface EncryptedProviderConfig {
  provider: FilesystemProvider;
  password: string | Buffer;
  algorithm?: string;
  keyLength?: number;
}

export class EncryptedProvider implements FilesystemProvider {
  private provider: FilesystemProvider;
  private password: string | Buffer;
  private algorithm: string;
  private keyLength: number;
  private key: Buffer | null = null;
  private salt: Buffer | null = null;

  constructor(config: EncryptedProviderConfig) {
    this.provider = config.provider;
    this.password = config.password;
    this.algorithm = config.algorithm || 'aes-256-gcm';
    this.keyLength = config.keyLength || 32;
  }

  private async getKey(): Promise<Buffer> {
    if (this.key) return this.key;

    if (!this.salt) {
      this.salt = randomBytes(16);
    }

    const passwordBuffer =
      typeof this.password === 'string' ? Buffer.from(this.password, 'utf8') : this.password;

    this.key = (await scryptAsync(passwordBuffer, this.salt!, this.keyLength)) as Buffer;
    return this.key;
  }

  private async encrypt(data: Buffer): Promise<Buffer> {
    const key = await this.getKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

    const authTag = (cipher as any).getAuthTag?.();

    // Prepend IV and auth tag
    return Buffer.concat([iv, authTag || Buffer.alloc(0), encrypted]);
  }

  private async decrypt(encrypted: Buffer): Promise<Buffer> {
    const key = await this.getKey();
    const iv = encrypted.slice(0, 16);
    const authTagLength = this.algorithm.includes('gcm') ? 16 : 0;
    const authTag = authTagLength > 0 ? encrypted.slice(16, 16 + authTagLength) : undefined;
    const data = encrypted.slice(16 + authTagLength);

    const decipher = createDecipheriv(this.algorithm, key, iv);
    if (authTag) {
      (decipher as any).setAuthTag(authTag);
    }

    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  async getattr(path: string): Promise<FileStat | null> {
    return this.provider.getattr(path);
  }

  async readdir(path: string): Promise<DirEntry[]> {
    return this.provider.readdir(path);
  }

  async open(path: string, flags: number, mode?: number): Promise<FileHandle> {
    return this.provider.open(path, flags, mode);
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const overhead = this.algorithm.includes('gcm') ? 32 : 16;
    const encryptedBuffer = Buffer.alloc(length + overhead);
    const bytesRead = await this.provider.read(handle, encryptedBuffer, offset, length + overhead);
    if (bytesRead < overhead) return 0;

    try {
      const decrypted = await this.decrypt(encryptedBuffer.slice(0, bytesRead));
      const toCopy = Math.min(decrypted.length, length);
      decrypted.copy(buffer, 0, 0, toCopy);
      return toCopy;
    } catch {
      throw new Error('Decryption failed');
    }
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const encrypted = await this.encrypt(buffer.slice(0, length));
    await this.provider.write(handle, encrypted, offset, encrypted.length);
    return length;
  }

  async create(path: string, mode: number): Promise<FileHandle> {
    return this.provider.create(path, mode);
  }

  async unlink(path: string): Promise<void> {
    return this.provider.unlink(path);
  }

  async mkdir(path: string, mode: number): Promise<void> {
    return this.provider.mkdir(path, mode);
  }

  async rmdir(path: string): Promise<void> {
    return this.provider.rmdir(path);
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    return this.provider.rename(oldpath, newpath);
  }

  async truncate(path: string, length: number): Promise<void> {
    await this.provider.truncate(path, length);
  }

  async close(handle: FileHandle): Promise<void> {
    return this.provider.close(handle);
  }
}
