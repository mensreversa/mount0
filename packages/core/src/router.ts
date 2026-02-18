import { FilesystemProvider, Flock, Statfs } from "./provider";
import { DirEntry, FileStat } from "./types";

export class RouterProvider implements FilesystemProvider {
  public readonly providers: { path: string; provider: FilesystemProvider }[];
  private inoToProvider: Map<number, FilesystemProvider> = new Map();

  constructor(providers: { path: string; provider: FilesystemProvider }[]) {
    this.providers = providers;
    this.inoToProvider.set(1, this);
  }

  handle(path: string, provider: FilesystemProvider): void {
    const normalized = path === "/" ? "/" : path.replace(/\/+$/, "") || "/";
    this.providers.push({ path: normalized, provider });
    this.providers.sort((a, b) => b.path.length - a.path.length);
  }

  unhandle(path: string): void {
    const normalized = path === "/" ? "/" : path.replace(/\/+$/, "") || "/";
    const index = this.providers.findIndex((rp) => rp.path === normalized);
    if (index !== -1) this.providers.splice(index, 1);
  }

  private getProvider(ino: number): FilesystemProvider {
    const provider = this.inoToProvider.get(ino);
    if (!provider) throw new Error(`Provider not found for inode ${ino}`);
    return provider;
  }

  private matchProvider(path: string): FilesystemProvider | null {
    const matched = this.providers
      .filter((rp) => {
        if (rp.path === "/") {
          // Root provider matches everything
          return true;
        }
        return path === rp.path || path.startsWith(rp.path + "/");
      })
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (!matched) return null;
    return matched.provider;
  }

  async lookup(parent: number, name: string): Promise<FileStat | null> {
    if (parent === 1) {
      // For root lookups, match provider for the path /${name}
      const path = `/${name}`;
      const provider = this.matchProvider(path);
      if (!provider) {
        throw new Error("No provider found");
      }
      // Call getattr(1) on the matched provider
      const stat = await provider.getattr(1);
      if (stat) {
        this.inoToProvider.set(stat.ino, provider);
      }
      return stat;
    }
    const stat = await this.getProvider(parent).lookup(parent, name);
    if (stat) this.inoToProvider.set(stat.ino, this.getProvider(parent));
    return stat;
  }

  async getattr(ino: number): Promise<FileStat | null> {
    if (ino === 1)
      return {
        mode: 0o40755,
        size: 0,
        mtime: Math.floor(Date.now() / 1000),
        ctime: Math.floor(Date.now() / 1000),
        atime: Math.floor(Date.now() / 1000),
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 1,
        nlink: 1,
        rdev: 0,
        blksize: 4096,
        blocks: 0,
      };
    return this.getProvider(ino).getattr(ino);
  }

  async setattr(ino: number, to_set: number, attr: FileStat): Promise<void> {
    return this.getProvider(ino).setattr(ino, to_set, attr);
  }

  async readdir(ino: number, size: number, off: number): Promise<DirEntry[]> {
    if (ino === 1) {
      const topLevel = new Set<string>();
      const entries = await Promise.all(
        this.providers
          .filter((rp) => {
            if (rp.path === "/") return false;
            const parts = rp.path.split("/").filter((p) => p);
            const top = `/${parts[0]}`;
            if (topLevel.has(top)) return false;
            topLevel.add(top);
            return rp.path === top;
          })
          .map(async (rp) => {
            const stat = await rp.provider.getattr(1);
            if (stat) {
              this.inoToProvider.set(stat.ino, rp.provider);
              return { name: rp.path.slice(1), mode: stat.mode, ino: stat.ino };
            }
            return null;
          })
      );
      return entries.filter((e) => e !== null).slice(off) as DirEntry[];
    }
    const entries = await this.getProvider(ino).readdir(ino, size, off);
    entries.forEach((e) => {
      if (!this.inoToProvider.has(e.ino)) this.inoToProvider.set(e.ino, this.getProvider(ino));
    });
    return entries;
  }

  async opendir(ino: number, flags: number): Promise<number> {
    return this.getProvider(ino).opendir(ino, flags);
  }

  async releasedir(ino: number, fh: number): Promise<void> {
    return this.getProvider(ino).releasedir(ino, fh);
  }

  async fsyncdir(ino: number, fh: number, datasync: number): Promise<void> {
    return this.getProvider(ino).fsyncdir(ino, fh, datasync);
  }
  async open(ino: number, flags: number, mode?: number): Promise<number> {
    return this.getProvider(ino).open(ino, flags, mode);
  }

  async read(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number> {
    return this.getProvider(ino).read(ino, fh, buffer, off, length);
  }

  async write(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number> {
    return this.getProvider(ino).write(ino, fh, buffer, off, length);
  }

  async flush(ino: number, fh: number): Promise<void> {
    return this.getProvider(ino).flush(ino, fh);
  }

  async fsync(ino: number, fh: number, datasync: number): Promise<void> {
    return this.getProvider(ino).fsync(ino, fh, datasync);
  }

  async release(ino: number, fh: number): Promise<void> {
    return this.getProvider(ino).release(ino, fh);
  }

  async create(parent: number, name: string, mode: number, flags: number): Promise<FileStat> {
    const stat = await this.getProvider(parent).create(parent, name, mode, flags);
    this.inoToProvider.set(stat.ino, this.getProvider(parent));
    return stat;
  }

  async mknod(parent: number, name: string, mode: number, rdev: number): Promise<FileStat> {
    const stat = await this.getProvider(parent).mknod(parent, name, mode, rdev);
    this.inoToProvider.set(stat.ino, this.getProvider(parent));
    return stat;
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    const stat = await this.getProvider(parent).mkdir(parent, name, mode);
    this.inoToProvider.set(stat.ino, this.getProvider(parent));
    return stat;
  }

  async unlink(parent: number, name: string): Promise<void> {
    const stat = await this.getProvider(parent).lookup(parent, name);
    await this.getProvider(parent).unlink(parent, name);
    if (stat) this.inoToProvider.delete(stat.ino);
  }

  async rmdir(parent: number, name: string): Promise<void> {
    const stat = await this.getProvider(parent).lookup(parent, name);
    await this.getProvider(parent).rmdir(parent, name);
    if (stat) this.inoToProvider.delete(stat.ino);
  }

  async link(ino: number, newparent: number, newname: string): Promise<FileStat> {
    const stat = await this.getProvider(ino).link(ino, newparent, newname);
    this.inoToProvider.set(stat.ino, this.getProvider(ino));
    return stat;
  }

  async symlink(link: string, parent: number, name: string): Promise<FileStat> {
    const stat = await this.getProvider(parent).symlink(link, parent, name);
    this.inoToProvider.set(stat.ino, this.getProvider(parent));
    return stat;
  }

  async readlink(ino: number): Promise<string> {
    // For root inode, use the first provider
    if (ino === 1) {
      if (this.providers.length > 0) {
        const provider = this.providers[0].provider;
        if (provider.readlink) {
          return provider.readlink(1);
        }
      }
      throw new Error("Readlink not supported for root");
    }
    return this.getProvider(ino).readlink(ino);
  }

  async rename(parent: number, name: string, newparent: number, newname: string, flags: number): Promise<void> {
    return this.getProvider(parent).rename(parent, name, newparent, newname, flags);
  }
  async setxattr(ino: number, name: string, value: Buffer, size: number, flags: number): Promise<void> {
    // For root inode, use the first provider
    if (ino === 1) {
      if (this.providers.length > 0) {
        const provider = this.providers[0].provider;
        if (provider.setxattr) {
          return provider.setxattr(1, name, value, size, flags);
        }
      }
      throw new Error("Extended attributes not supported");
    }
    return this.getProvider(ino).setxattr(ino, name, value, size, flags);
  }

  async getxattr(ino: number, name: string, size: number): Promise<Buffer | number> {
    // For root inode, use the first provider
    if (ino === 1) {
      if (this.providers.length > 0) {
        const provider = this.providers[0].provider;
        if (provider.getxattr) {
          return provider.getxattr(1, name, size);
        }
      }
      throw new Error("Extended attributes not supported");
    }
    return this.getProvider(ino).getxattr(ino, name, size);
  }

  async listxattr(ino: number, size: number): Promise<Buffer | number> {
    // For root inode, use the first provider
    if (ino === 1) {
      if (this.providers.length > 0) {
        const provider = this.providers[0].provider;
        if (provider.listxattr) {
          return provider.listxattr(1, size);
        }
      }
      return size === 0 ? 0 : Buffer.alloc(0);
    }
    return this.getProvider(ino).listxattr(ino, size);
  }

  async removexattr(ino: number, name: string): Promise<void> {
    // For root inode, use the first provider
    if (ino === 1) {
      if (this.providers.length > 0) {
        const provider = this.providers[0].provider;
        if (provider.removexattr) {
          return provider.removexattr(1, name);
        }
      }
      throw new Error("Extended attributes not supported");
    }
    return this.getProvider(ino).removexattr(ino, name);
  }

  async access(ino: number, mask: number): Promise<void> {
    // For root inode, use the first provider or return success
    if (ino === 1) {
      if (this.providers.length > 0) {
        const provider = this.providers[0].provider;
        if (provider.access) {
          return provider.access(1, mask);
        }
      }
      return; // Success for root
    }
    return this.getProvider(ino).access(ino, mask);
  }

  async statfs(ino: number): Promise<Statfs> {
    // For root inode, use the first provider
    if (ino === 1) {
      if (this.providers.length > 0) {
        const provider = this.providers[0].provider;
        if (provider.statfs) {
          return provider.statfs(1);
        }
      }
      // Return default statfs for root if no provider
      return {
        bsize: 4096,
        blocks: 0,
        bfree: 0,
        bavail: 0,
        files: 0,
        ffree: 0,
      };
    }
    return this.getProvider(ino).statfs(ino);
  }

  async getlk(ino: number, fh: number): Promise<Flock> {
    return this.getProvider(ino).getlk(ino, fh);
  }

  async setlk(ino: number, fh: number, sleep: number): Promise<void> {
    return this.getProvider(ino).setlk(ino, fh, sleep);
  }

  async flock(ino: number, fh: number, op: number): Promise<void> {
    return this.getProvider(ino).flock(ino, fh, op);
  }
  async bmap(ino: number, blocksize: number, idx: number): Promise<number> {
    return this.getProvider(ino).bmap(ino, blocksize, idx);
  }

  async ioctl(ino: number, cmd: number, in_buf: Buffer | null, in_bufsz: number, out_bufsz: number): Promise<{ result: number; out_buf?: Buffer }> {
    return this.getProvider(ino).ioctl(ino, cmd, in_buf, in_bufsz, out_bufsz);
  }

  async poll(ino: number, fh: number): Promise<number> {
    return this.getProvider(ino).poll(ino, fh);
  }

  async fallocate(ino: number, fh: number, offset: number, length: number, mode: number): Promise<void> {
    return this.getProvider(ino).fallocate(ino, fh, offset, length, mode);
  }

  async readdirplus(ino: number, size: number, off: number): Promise<DirEntry[]> {
    const entries = await this.getProvider(ino).readdirplus(ino, size, off);
    entries.forEach((e) => {
      if (!this.inoToProvider.has(e.ino)) this.inoToProvider.set(e.ino, this.getProvider(ino));
    });
    return entries;
  }

  async copy_file_range(ino_in: number, off_in: number, ino_out: number, off_out: number, len: number, flags: number): Promise<number> {
    return this.getProvider(ino_in).copy_file_range(ino_in, off_in, ino_out, off_out, len, flags);
  }

  async lseek(ino: number, fh: number, off: number, whence: number): Promise<number> {
    return this.getProvider(ino).lseek(ino, fh, off, whence);
  }

  async tmpfile(parent: number, mode: number, flags: number): Promise<FileStat> {
    const stat = await this.getProvider(parent).tmpfile(parent, mode, flags);
    this.inoToProvider.set(stat.ino, this.getProvider(parent));
    return stat;
  }

  async forget(ino: number, nlookup: number): Promise<void> {
    // Don't forget the root inode
    if (ino === 1) return;

    const provider = this.inoToProvider.get(ino);
    if (provider && provider.forget) {
      await provider.forget(ino, nlookup);
    }

    // Remove from our map when lookup count reaches zero
    // Note: nlookup is the number of lookups to forget, not the remaining count
    // We can't track the exact count, so we'll remove when forget is called
    // In practice, FUSE will call forget multiple times until count reaches zero
    this.inoToProvider.delete(ino);
  }

  async forget_multi(forgets: Array<{ ino: number; nlookup: number }>): Promise<void> {
    for (const forget of forgets) {
      await this.forget(forget.ino, forget.nlookup);
    }
  }
}
