import { DirEntry, FileStat, FilesystemProvider, Flock, Statfs } from "@mount0/core";

export interface FirstProviderConfig {
  providers: FilesystemProvider[];
}

export class FirstProvider implements FilesystemProvider {
  private providers: FilesystemProvider[];

  constructor(config: FirstProviderConfig) {
    this.providers = config.providers;
  }

  private async executeFirst<T>(operation: (provider: FilesystemProvider) => Promise<T>): Promise<T> {
    for (const provider of this.providers) {
      try {
        return await operation(provider);
      } catch {
        continue;
      }
    }
    throw new Error("All providers failed");
  }

  // Core operations
  async lookup(parent: number, name: string): Promise<FileStat | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.lookup(parent, name);
        if (result !== null) return result;
      } catch {
        continue;
      }
    }
    return null;
  }

  async getattr(ino: number): Promise<FileStat | null> {
    return this.executeFirst((p) => p.getattr(ino));
  }

  async setattr(ino: number, to_set: number, attr: FileStat): Promise<void> {
    return this.executeFirst((p) => p.setattr(ino, to_set, attr));
  }

  // Directory operations
  async readdir(ino: number, size: number, off: number): Promise<DirEntry[]> {
    return this.executeFirst((p) => p.readdir(ino, size, off));
  }

  async opendir(ino: number, flags: number): Promise<number> {
    return this.executeFirst((p) => p.opendir(ino, flags));
  }

  async releasedir(ino: number, fh: number): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.releasedir(ino, fh)));
  }

  async fsyncdir(ino: number, fh: number, datasync: number): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.fsyncdir(ino, fh, datasync)));
  }

  // File operations
  async open(ino: number, flags: number, mode?: number): Promise<number> {
    return this.executeFirst((p) => p.open(ino, flags, mode));
  }

  async read(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number> {
    return this.executeFirst((p) => p.read(ino, fh, buffer, off, length));
  }

  async write(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number> {
    return this.executeFirst((p) => p.write(ino, fh, buffer, off, length));
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
  async create(parent: number, name: string, mode: number, flags: number): Promise<FileStat> {
    return this.executeFirst((p) => p.create(parent, name, mode, flags));
  }

  async mknod(parent: number, name: string, mode: number, rdev: number): Promise<FileStat> {
    return this.executeFirst((p) => p.mknod(parent, name, mode, rdev));
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    return this.executeFirst((p) => p.mkdir(parent, name, mode));
  }

  // Remove operations
  async unlink(parent: number, name: string): Promise<void> {
    return this.executeFirst((p) => p.unlink(parent, name));
  }

  async rmdir(parent: number, name: string): Promise<void> {
    return this.executeFirst((p) => p.rmdir(parent, name));
  }

  // Link operations
  async link(ino: number, newparent: number, newname: string): Promise<FileStat> {
    return this.executeFirst((p) => p.link(ino, newparent, newname));
  }

  async symlink(link: string, parent: number, name: string): Promise<FileStat> {
    return this.executeFirst((p) => p.symlink(link, parent, name));
  }

  async readlink(ino: number): Promise<string> {
    return this.executeFirst((p) => p.readlink(ino));
  }

  // Rename
  async rename(parent: number, name: string, newparent: number, newname: string, flags: number): Promise<void> {
    return this.executeFirst((p) => p.rename(parent, name, newparent, newname, flags));
  }

  // Extended attributes
  async setxattr(ino: number, name: string, value: Buffer, size: number, flags: number): Promise<void> {
    return this.executeFirst((p) => p.setxattr(ino, name, value, size, flags));
  }

  async getxattr(ino: number, name: string, size: number): Promise<Buffer | number> {
    return this.executeFirst((p) => p.getxattr(ino, name, size));
  }

  async listxattr(ino: number, size: number): Promise<Buffer | number> {
    return this.executeFirst((p) => p.listxattr(ino, size));
  }

  async removexattr(ino: number, name: string): Promise<void> {
    return this.executeFirst((p) => p.removexattr(ino, name));
  }

  // Other operations
  async access(ino: number, mask: number): Promise<void> {
    return this.executeFirst((p) => p.access(ino, mask));
  }

  async statfs(ino: number): Promise<Statfs> {
    return this.executeFirst((p) => p.statfs(ino));
  }

  // Locking
  async getlk(ino: number, fh: number): Promise<Flock> {
    return this.executeFirst((p) => p.getlk(ino, fh));
  }

  async setlk(ino: number, fh: number, sleep: number): Promise<void> {
    return this.executeFirst((p) => p.setlk(ino, fh, sleep));
  }

  async flock(ino: number, fh: number, op: number): Promise<void> {
    return this.executeFirst((p) => p.flock(ino, fh, op));
  }

  // Advanced operations
  async bmap(ino: number, blocksize: number, idx: number): Promise<number> {
    return this.executeFirst((p) => p.bmap(ino, blocksize, idx));
  }

  async ioctl(ino: number, cmd: number, in_buf: Buffer | null, in_bufsz: number, out_bufsz: number): Promise<{ result: number; out_buf?: Buffer }> {
    return this.executeFirst((p) => p.ioctl(ino, cmd, in_buf, in_bufsz, out_bufsz));
  }

  async poll(ino: number, fh: number): Promise<number> {
    return this.executeFirst((p) => p.poll(ino, fh));
  }

  async fallocate(ino: number, fh: number, offset: number, length: number, mode: number): Promise<void> {
    return this.executeFirst((p) => p.fallocate(ino, fh, offset, length, mode));
  }

  async readdirplus(ino: number, size: number, off: number): Promise<DirEntry[]> {
    return this.executeFirst((p) => p.readdirplus(ino, size, off));
  }

  async copy_file_range(ino_in: number, off_in: number, ino_out: number, off_out: number, len: number, flags: number): Promise<number> {
    return this.executeFirst((p) => p.copy_file_range(ino_in, off_in, ino_out, off_out, len, flags));
  }

  async lseek(ino: number, fh: number, off: number, whence: number): Promise<number> {
    return this.executeFirst((p) => p.lseek(ino, fh, off, whence));
  }

  async tmpfile(parent: number, mode: number, flags: number): Promise<FileStat> {
    return this.executeFirst((p) => p.tmpfile(parent, mode, flags));
  }
}
