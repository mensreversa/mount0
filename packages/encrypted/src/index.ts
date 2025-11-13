import { DirEntry, FileStat, FilesystemProvider, Flock, Statfs } from '@mount0/core';
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
  private inoToProviderIno: Map<number, number> = new Map();
  private providerInoToIno: Map<number, number> = new Map();
  private nextIno: number = 2;

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

    return Buffer.concat([iv, authTag || Buffer.alloc(0), encrypted]);
  }

  private async decrypt(encrypted: Buffer): Promise<Buffer> {
    const key = await this.getKey();
    const iv = encrypted.subarray(0, 16);
    const authTagLength = this.algorithm.includes('gcm') ? 16 : 0;
    const authTag = authTagLength > 0 ? encrypted.subarray(16, 16 + authTagLength) : undefined;
    const data = encrypted.subarray(16 + authTagLength);

    const decipher = createDecipheriv(this.algorithm, key, iv);
    if (authTag) {
      (decipher as any).setAuthTag(authTag);
    }

    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  private getProviderIno(ino: number): number {
    return this.inoToProviderIno.get(ino) || ino;
  }

  private setInoMapping(ino: number, providerIno: number): void {
    this.inoToProviderIno.set(ino, providerIno);
    this.providerInoToIno.set(providerIno, ino);
  }

  async lookup(parent: number, name: string): Promise<FileStat | null> {
    const providerParent = this.getProviderIno(parent);
    const stat = await this.provider.lookup(providerParent, name);
    if (stat) {
      const ino = this.nextIno++;
      this.setInoMapping(ino, stat.ino);
      return { ...stat, ino };
    }
    return null;
  }

  async getattr(ino: number): Promise<FileStat | null> {
    if (ino === 1) {
      return await this.provider.getattr(1);
    }
    const providerIno = this.getProviderIno(ino);
    const stat = await this.provider.getattr(providerIno);
    if (stat) {
      this.setInoMapping(ino, stat.ino);
      return { ...stat, ino };
    }
    return null;
  }

  async setattr(ino: number, to_set: number, attr: FileStat): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.setattr(providerIno, to_set, attr);
  }

  async readdir(ino: number, size: number, off: number): Promise<DirEntry[]> {
    const providerIno = this.getProviderIno(ino);
    const entries = await this.provider.readdir(providerIno, size, off);
    return entries.map((entry) => {
      const ino = this.nextIno++;
      this.setInoMapping(ino, entry.ino);
      return { ...entry, ino };
    });
  }

  async opendir(ino: number, flags: number): Promise<number> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.opendir(providerIno, flags);
  }

  async releasedir(ino: number, fh: number): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.releasedir(providerIno, fh);
  }

  async fsyncdir(ino: number, fh: number, datasync: number): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.fsyncdir(providerIno, fh, datasync);
  }

  async open(ino: number, flags: number, mode?: number): Promise<number> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.open(providerIno, flags, mode);
  }

  async read(
    ino: number,
    fh: number,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number> {
    const providerIno = this.getProviderIno(ino);
    const overhead = this.algorithm.includes('gcm') ? 32 : 16;
    const encryptedBuffer = Buffer.alloc(length + overhead);
    const bytesRead = await this.provider.read(
      providerIno,
      fh,
      encryptedBuffer,
      offset,
      length + overhead
    );
    if (bytesRead < overhead) return 0;

    try {
      const decrypted = await this.decrypt(encryptedBuffer.subarray(0, bytesRead));
      const toCopy = Math.min(decrypted.length, length);
      decrypted.copy(buffer, 0, 0, toCopy);
      return toCopy;
    } catch {
      throw new Error('Decryption failed');
    }
  }

  async write(
    ino: number,
    fh: number,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number> {
    const providerIno = this.getProviderIno(ino);
    const encrypted = await this.encrypt(buffer.subarray(0, length));
    await this.provider.write(providerIno, fh, encrypted, offset, encrypted.length);
    return length;
  }

  async flush(ino: number, fh: number): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.flush(providerIno, fh);
  }

  async fsync(ino: number, fh: number, datasync: number): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.fsync(providerIno, fh, datasync);
  }

  async release(ino: number, fh: number): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.release(providerIno, fh);
  }

  async create(parent: number, name: string, mode: number, flags: number): Promise<FileStat> {
    const providerParent = this.getProviderIno(parent);
    const stat = await this.provider.create(providerParent, name, mode, flags);
    const ino = this.nextIno++;
    this.setInoMapping(ino, stat.ino);
    return { ...stat, ino };
  }

  async mknod(parent: number, name: string, mode: number, rdev: number): Promise<FileStat> {
    const providerParent = this.getProviderIno(parent);
    const stat = await this.provider.mknod(providerParent, name, mode, rdev);
    const ino = this.nextIno++;
    this.setInoMapping(ino, stat.ino);
    return { ...stat, ino };
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    const providerParent = this.getProviderIno(parent);
    const stat = await this.provider.mkdir(providerParent, name, mode);
    const ino = this.nextIno++;
    this.setInoMapping(ino, stat.ino);
    return { ...stat, ino };
  }

  async unlink(parent: number, name: string): Promise<void> {
    const providerParent = this.getProviderIno(parent);
    return this.provider.unlink(providerParent, name);
  }

  async rmdir(parent: number, name: string): Promise<void> {
    const providerParent = this.getProviderIno(parent);
    return this.provider.rmdir(providerParent, name);
  }

  async link(ino: number, newparent: number, newname: string): Promise<FileStat> {
    const providerIno = this.getProviderIno(ino);
    const providerNewParent = this.getProviderIno(newparent);
    const stat = await this.provider.link(providerIno, providerNewParent, newname);
    const newIno = this.nextIno++;
    this.setInoMapping(newIno, stat.ino);
    return { ...stat, ino: newIno };
  }

  async symlink(link: string, parent: number, name: string): Promise<FileStat> {
    const providerParent = this.getProviderIno(parent);
    const stat = await this.provider.symlink(link, providerParent, name);
    const ino = this.nextIno++;
    this.setInoMapping(ino, stat.ino);
    return { ...stat, ino };
  }

  async readlink(ino: number): Promise<string> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.readlink(providerIno);
  }

  async rename(
    parent: number,
    name: string,
    newparent: number,
    newname: string,
    flags: number
  ): Promise<void> {
    const providerParent = this.getProviderIno(parent);
    const providerNewParent = this.getProviderIno(newparent);
    return this.provider.rename(providerParent, name, providerNewParent, newname, flags);
  }

  async setxattr(
    ino: number,
    name: string,
    value: Buffer,
    size: number,
    flags: number
  ): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.setxattr(providerIno, name, value, size, flags);
  }

  async getxattr(ino: number, name: string, size: number): Promise<Buffer | number> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.getxattr(providerIno, name, size);
  }

  async listxattr(ino: number, size: number): Promise<Buffer | number> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.listxattr(providerIno, size);
  }

  async removexattr(ino: number, name: string): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.removexattr(providerIno, name);
  }

  async access(ino: number, mask: number): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.access(providerIno, mask);
  }

  async statfs(ino: number): Promise<Statfs> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.statfs(providerIno);
  }

  async getlk(ino: number, fh: number): Promise<Flock> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.getlk(providerIno, fh);
  }

  async setlk(ino: number, fh: number, sleep: number): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.setlk(providerIno, fh, sleep);
  }

  async flock(ino: number, fh: number, op: number): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.flock(providerIno, fh, op);
  }

  async bmap(ino: number, blocksize: number, idx: number): Promise<number> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.bmap(providerIno, blocksize, idx);
  }

  async ioctl(
    ino: number,
    cmd: number,
    in_buf: Buffer | null,
    in_bufsz: number,
    out_bufsz: number
  ): Promise<{ result: number; out_buf?: Buffer }> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.ioctl(providerIno, cmd, in_buf, in_bufsz, out_bufsz);
  }

  async poll(ino: number, fh: number): Promise<number> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.poll(providerIno, fh);
  }

  async fallocate(
    ino: number,
    fh: number,
    offset: number,
    length: number,
    mode: number
  ): Promise<void> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.fallocate(providerIno, fh, offset, length, mode);
  }

  async readdirplus(ino: number, size: number, offset: number): Promise<DirEntry[]> {
    const providerIno = this.getProviderIno(ino);
    const entries = await this.provider.readdirplus(providerIno, size, offset);
    return entries.map((entry) => {
      const ino = this.nextIno++;
      this.setInoMapping(ino, entry.ino);
      return { ...entry, ino };
    });
  }

  async copy_file_range(
    ino_in: number,
    off_in: number,
    ino_out: number,
    off_out: number,
    len: number,
    flags: number
  ): Promise<number> {
    const providerInoIn = this.getProviderIno(ino_in);
    const providerInoOut = this.getProviderIno(ino_out);
    return this.provider.copy_file_range(
      providerInoIn,
      off_in,
      providerInoOut,
      off_out,
      len,
      flags
    );
  }

  async lseek(ino: number, fh: number, off: number, whence: number): Promise<number> {
    const providerIno = this.getProviderIno(ino);
    return this.provider.lseek(providerIno, fh, off, whence);
  }

  async tmpfile(parent: number, mode: number, flags: number): Promise<FileStat> {
    const providerParent = this.getProviderIno(parent);
    const stat = await this.provider.tmpfile(providerParent, mode, flags);
    const ino = this.nextIno++;
    this.setInoMapping(ino, stat.ino);
    return { ...stat, ino };
  }
}
