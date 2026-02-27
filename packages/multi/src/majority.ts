import { DirEntry, FileStat, FilesystemProvider, Flock, Statfs } from "@mount0/core";

export interface MajorityProviderConfig {
  providers: FilesystemProvider[];
}

export class MajorityProvider implements FilesystemProvider {
  private providers: FilesystemProvider[];
  private majority: number;

  constructor(config: MajorityProviderConfig) {
    this.providers = config.providers;
    this.majority = Math.floor(this.providers.length / 2) + 1;
  }

  private async executeWithMajority<T>(operation: (provider: FilesystemProvider) => Promise<T>): Promise<T> {
    const results = await Promise.allSettled(this.providers.map((p) => operation(p)));
    const successful = results.filter((r) => r.status === "fulfilled");
    if (successful.length >= this.majority) {
      return (successful[0] as PromiseFulfilledResult<T>).value;
    }
    throw new Error("Majority of providers failed");
  }

  // Core operations
  async lookup(parent: number, name: string): Promise<FileStat | null> {
    return this.executeWithMajority((p) => p.lookup(parent, name));
  }

  async getattr(ino: number, fh: number): Promise<FileStat | null> {
    return this.executeWithMajority((p) => p.getattr(ino, fh));
  }

  async setattr(ino: number, fh: number, to_set: number, attr: FileStat): Promise<void> {
    return this.executeWithMajority((p) => p.setattr(ino, fh, to_set, attr));
  }

  // Directory operations
  async readdir(ino: number, fh: number, size: number, off: number): Promise<DirEntry[]> {
    return this.executeWithMajority((p) => p.readdir(ino, fh, size, off));
  }

  async opendir(ino: number, flags: number): Promise<number> {
    return this.executeWithMajority((p) => p.opendir(ino, flags));
  }

  async releasedir(ino: number, fh: number): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.releasedir(ino, fh)));
  }

  async fsyncdir(ino: number, fh: number, datasync: number): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.fsyncdir(ino, fh, datasync)));
  }

  // File operations
  async open(ino: number, flags: number, mode?: number): Promise<number> {
    return this.executeWithMajority((p) => p.open(ino, flags, mode));
  }

  async read(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number> {
    return this.executeWithMajority((p) => p.read(ino, fh, buffer, off, length));
  }

  async write(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number> {
    // For writes, use first available (majority doesn't make sense for writes)
    for (const provider of this.providers) {
      try {
        return await provider.write(ino, fh, buffer, off, length);
      } catch {
        continue;
      }
    }
    throw new Error("All providers failed");
  }

  async flush(ino: number, fh: number): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.flush(ino, fh)));
  }

  async fsync(ino: number, fh: number, datasync: number): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.fsync(ino, fh, datasync)));
  }

  async release(ino: number, fh: number): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.release(ino, fh)));
  }

  // Create operations
  async create(parent: number, name: string, mode: number, flags: number): Promise<{ stat: FileStat; fh: number }> {
    return this.executeWithMajority((p) => p.create(parent, name, mode, flags));
  }

  async mknod(parent: number, name: string, mode: number, rdev: number): Promise<FileStat> {
    return this.executeWithMajority((p) => p.mknod(parent, name, mode, rdev));
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    return this.executeWithMajority((p) => p.mkdir(parent, name, mode));
  }

  // Remove operations
  async unlink(parent: number, name: string): Promise<void> {
    return this.executeWithMajority((p) => p.unlink(parent, name));
  }

  async rmdir(parent: number, name: string): Promise<void> {
    return this.executeWithMajority((p) => p.rmdir(parent, name));
  }

  // Link operations
  async link(ino: number, newparent: number, newname: string): Promise<FileStat> {
    return this.executeWithMajority((p) => p.link(ino, newparent, newname));
  }

  async symlink(link: string, parent: number, name: string): Promise<FileStat> {
    return this.executeWithMajority((p) => p.symlink(link, parent, name));
  }

  async readlink(ino: number): Promise<string> {
    return this.executeWithMajority((p) => p.readlink(ino));
  }

  // Rename
  async rename(parent: number, name: string, newparent: number, newname: string, flags: number): Promise<void> {
    return this.executeWithMajority((p) => p.rename(parent, name, newparent, newname, flags));
  }

  // Extended attributes
  async setxattr(ino: number, name: string, value: Buffer, size: number, flags: number): Promise<void> {
    return this.executeWithMajority((p) => p.setxattr(ino, name, value, size, flags));
  }

  async getxattr(ino: number, name: string, size: number): Promise<Buffer | number> {
    return this.executeWithMajority((p) => p.getxattr(ino, name, size));
  }

  async listxattr(ino: number, size: number): Promise<Buffer | number> {
    return this.executeWithMajority((p) => p.listxattr(ino, size));
  }

  async removexattr(ino: number, name: string): Promise<void> {
    return this.executeWithMajority((p) => p.removexattr(ino, name));
  }

  // Other operations
  async access(ino: number, mask: number): Promise<void> {
    return this.executeWithMajority((p) => p.access(ino, mask));
  }

  async statfs(ino: number, fh: number): Promise<Statfs> {
    return this.executeWithMajority((p) => p.statfs(ino, fh));
  }

  // Locking
  async getlk(ino: number, fh: number, lock: Flock): Promise<Flock> {
    return this.executeWithMajority((p) => p.getlk(ino, fh, lock));
  }

  async setlk(ino: number, fh: number, lock: Flock, sleep: number): Promise<void> {
    return this.executeWithMajority((p) => p.setlk(ino, fh, lock, sleep));
  }

  async flock(ino: number, fh: number, op: number): Promise<void> {
    return this.executeWithMajority((p) => p.flock(ino, fh, op));
  }

  // Advanced operations
  async bmap(ino: number, blocksize: number, idx: number): Promise<number> {
    return this.executeWithMajority((p) => p.bmap(ino, blocksize, idx));
  }

  async ioctl(ino: number, fh: number, cmd: number, in_buf: Buffer | null, in_bufsz: number, out_bufsz: number, flags: number): Promise<{ result: number; out_buf?: Buffer }> {
    return this.executeWithMajority((p) => p.ioctl(ino, fh, cmd, in_buf, in_bufsz, out_bufsz, flags));
  }

  async poll(ino: number, fh: number): Promise<number> {
    return this.executeWithMajority((p) => p.poll(ino, fh));
  }

  async fallocate(ino: number, fh: number, offset: number, length: number, mode: number): Promise<void> {
    return this.executeWithMajority((p) => p.fallocate(ino, fh, offset, length, mode));
  }

  async readdirplus(ino: number, fh: number, size: number, off: number): Promise<DirEntry[]> {
    return this.executeWithMajority((p) => p.readdirplus(ino, fh, size, off));
  }

  async copy_file_range(ino_in: number, fh_in: number, off_in: number, ino_out: number, fh_out: number, off_out: number, len: number, flags: number): Promise<number> {
    return this.executeWithMajority((p) => p.copy_file_range(ino_in, fh_in, off_in, ino_out, fh_out, off_out, len, flags));
  }

  async lseek(ino: number, fh: number, off: number, whence: number): Promise<number> {
    return this.executeWithMajority((p) => p.lseek(ino, fh, off, whence));
  }

  async tmpfile(parent: number, mode: number, flags: number): Promise<{ stat: FileStat; fh: number }> {
    return this.executeWithMajority((p) => p.tmpfile(parent, mode, flags));
  }
}
