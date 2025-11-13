import { DirEntry, FileStat, FilesystemProvider, Flock, Statfs } from '@mount0/core';

export abstract class BaseRaidProvider implements FilesystemProvider {
  protected providers: FilesystemProvider[];
  protected stripeSize: number;
  protected inoToProviderInos: Map<number, number[]> = new Map(); // RAID ino -> provider inos
  protected providerInoToRaidIno: Map<number, number> = new Map(); // provider ino -> RAID ino
  protected openFiles: Map<number, Map<number, number[]>> = new Map(); // RAID ino -> fh -> provider fhs
  protected nextFh: number = 1;
  protected nextIno: number = 2; // Start at 2 (1 is root)

  constructor(providers: FilesystemProvider[], stripeSize: number = 64 * 1024) {
    if (providers.length < 2) {
      throw new Error('RAID requires at least 2 providers');
    }
    this.providers = providers;
    this.stripeSize = stripeSize;
  }

  protected getProviderInos(ino: number): number[] {
    return this.inoToProviderInos.get(ino) || [];
  }

  protected setProviderInos(ino: number, providerInos: number[]): void {
    this.inoToProviderInos.set(ino, providerInos);
    providerInos.forEach((pino) => {
      this.providerInoToRaidIno.set(pino, ino);
    });
  }

  protected getProviderFhs(ino: number, fh: number): number[] {
    const fileHandles = this.openFiles.get(ino);
    if (!fileHandles) throw new Error('File not open');
    const providerFhs = fileHandles.get(fh);
    if (!providerFhs) throw new Error('File handle not found');
    return providerFhs;
  }

  async lookup(parent: number, name: string): Promise<FileStat | null> {
    if (parent === 1) {
      // Root directory - try to find in any provider
      for (const provider of this.providers) {
        try {
          const stat = await provider.lookup(1, name);
          if (stat) {
            const raidIno = this.nextIno++;
            this.setProviderInos(raidIno, [stat.ino]);
            return { ...stat, ino: raidIno };
          }
        } catch {
          continue;
        }
      }
      return null;
    }

    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) return null;

    for (const providerIno of providerInos) {
      for (const provider of this.providers) {
        try {
          const stat = await provider.lookup(providerIno, name);
          if (stat) {
            const raidIno = this.nextIno++;
            const newProviderInos = [stat.ino];
            this.setProviderInos(raidIno, newProviderInos);
            return { ...stat, ino: raidIno };
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  async getattr(ino: number): Promise<FileStat | null> {
    if (ino === 1) {
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
    }

    const providerInos = this.getProviderInos(ino);
    if (providerInos.length === 0) return null;

    for (const providerIno of providerInos) {
      for (const provider of this.providers) {
        try {
          const stat = await provider.getattr(providerIno);
          if (stat) {
            return { ...stat, ino };
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  async setattr(ino: number, to_set: number, attr: FileStat): Promise<void> {
    const providerInos = this.getProviderInos(ino);
    await Promise.all(
      providerInos.map((providerIno, i) => this.providers[i].setattr(providerIno, to_set, attr))
    );
  }

  async readdir(ino: number, size: number, offset: number): Promise<DirEntry[]> {
    if (ino === 1) {
      const entriesMap = new Map<string, DirEntry>();
      for (const provider of this.providers) {
        try {
          const entries = await provider.readdir(1, size, 0);
          for (const entry of entries) {
            if (!entriesMap.has(entry.name)) {
              const raidIno = this.nextIno++;
              this.setProviderInos(raidIno, [entry.ino]);
              entriesMap.set(entry.name, { ...entry, ino: raidIno });
            }
          }
        } catch {
          continue;
        }
      }
      return Array.from(entriesMap.values()).slice(offset);
    }

    const providerInos = this.getProviderInos(ino);
    if (providerInos.length === 0) return [];

    const entriesMap = new Map<string, DirEntry>();
    for (const providerIno of providerInos) {
      for (const provider of this.providers) {
        try {
          const entries = await provider.readdir(providerIno, size, 0);
          for (const entry of entries) {
            if (!entriesMap.has(entry.name)) {
              const raidIno = this.nextIno++;
              this.setProviderInos(raidIno, [entry.ino]);
              entriesMap.set(entry.name, { ...entry, ino: raidIno });
            }
          }
        } catch {
          continue;
        }
      }
    }
    return Array.from(entriesMap.values()).slice(offset);
  }

  async opendir(ino: number, flags: number): Promise<number> {
    return this.open(ino, flags);
  }

  async releasedir(ino: number, fh: number): Promise<void> {
    return this.release(ino, fh);
  }

  async fsyncdir(ino: number, fh: number, datasync: number): Promise<void> {
    const providerFhs = this.getProviderFhs(ino, fh);
    await Promise.all(
      providerFhs.map((pfh, i) => {
        const providerInos = this.getProviderInos(ino);
        if (providerInos[i]) {
          return this.providers[i].fsyncdir(providerInos[i], pfh, datasync);
        }
      })
    );
  }

  async open(ino: number, flags: number, mode?: number): Promise<number> {
    const providerInos = this.getProviderInos(ino);
    if (providerInos.length === 0) throw new Error('File not found');

    const providerFhs: number[] = [];
    const errors: Error[] = [];

    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        const fh = await this.providers[i].open(providerInos[i], flags, mode);
        providerFhs.push(fh);
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (providerFhs.length === 0) {
      throw new Error(`Failed to open: ${errors.map((e) => e.message).join(', ')}`);
    }

    const fh = this.nextFh++;
    if (!this.openFiles.has(ino)) {
      this.openFiles.set(ino, new Map());
    }
    this.openFiles.get(ino)!.set(fh, providerFhs);
    return fh;
  }

  async read(
    _ino: number,
    _fh: number,
    _buffer: Buffer,
    _offset: number,
    _length: number
  ): Promise<number> {
    // Abstract - implemented by subclasses
    throw new Error('read must be implemented by subclass');
  }

  async write(
    _ino: number,
    _fh: number,
    _buffer: Buffer,
    _offset: number,
    _length: number
  ): Promise<number> {
    // Abstract - implemented by subclasses
    throw new Error('write must be implemented by subclass');
  }

  async flush(ino: number, fh: number): Promise<void> {
    const providerFhs = this.getProviderFhs(ino, fh);
    await Promise.all(
      providerFhs.map((pfh, i) => {
        const providerInos = this.getProviderInos(ino);
        if (providerInos[i]) {
          return this.providers[i].flush(providerInos[i], pfh);
        }
      })
    );
  }

  async fsync(ino: number, fh: number, datasync: number): Promise<void> {
    const providerFhs = this.getProviderFhs(ino, fh);
    await Promise.all(
      providerFhs.map((pfh, i) => {
        const providerInos = this.getProviderInos(ino);
        if (providerInos[i]) {
          return this.providers[i].fsync(providerInos[i], pfh, datasync);
        }
      })
    );
  }

  async release(ino: number, fh: number): Promise<void> {
    const fileHandles = this.openFiles.get(ino);
    if (!fileHandles) return;
    const providerFhs = fileHandles.get(fh);
    if (providerFhs) {
      await Promise.allSettled(
        providerFhs.map((pfh, i) => {
          const providerInos = this.getProviderInos(ino);
          if (providerInos[i]) {
            return this.providers[i].release(providerInos[i], pfh);
          }
        })
      );
      fileHandles.delete(fh);
    }
    if (fileHandles.size === 0) {
      this.openFiles.delete(ino);
    }
  }

  async create(parent: number, name: string, mode: number, flags: number): Promise<FileStat> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error('Parent not found');

    const stats: FileStat[] = [];
    const providerFhs: number[] = [];

    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        const stat = await this.providers[i].create(providerInos[i], name, mode, flags);
        stats.push(stat);
        const fh = await this.providers[i].open(stat.ino, flags);
        providerFhs.push(fh);
      } catch (error) {
        if (stats.length === 0) throw error;
      }
    }

    if (stats.length === 0) {
      throw new Error('Failed to create file on any provider');
    }

    const raidIno = this.nextIno++;
    const newProviderInos = stats.map((s) => s.ino);
    this.setProviderInos(raidIno, newProviderInos);

    const fh = this.nextFh++;
    if (!this.openFiles.has(raidIno)) {
      this.openFiles.set(raidIno, new Map());
    }
    this.openFiles.get(raidIno)!.set(fh, providerFhs);

    return { ...stats[0], ino: raidIno };
  }

  async mknod(parent: number, name: string, mode: number, rdev: number): Promise<FileStat> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error('Parent not found');

    const stats: FileStat[] = [];
    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        const stat = await this.providers[i].mknod(providerInos[i], name, mode, rdev);
        stats.push(stat);
      } catch (error) {
        if (stats.length === 0) throw error;
      }
    }

    if (stats.length === 0) {
      throw new Error('Failed to create node on any provider');
    }

    const raidIno = this.nextIno++;
    const newProviderInos = stats.map((s) => s.ino);
    this.setProviderInos(raidIno, newProviderInos);
    return { ...stats[0], ino: raidIno };
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error('Parent not found');

    const stats: FileStat[] = [];
    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        const stat = await this.providers[i].mkdir(providerInos[i], name, mode);
        stats.push(stat);
      } catch (error) {
        if (stats.length === 0) throw error;
      }
    }

    if (stats.length === 0) {
      throw new Error('Failed to create directory on any provider');
    }

    const raidIno = this.nextIno++;
    const newProviderInos = stats.map((s) => s.ino);
    this.setProviderInos(raidIno, newProviderInos);
    return { ...stats[0], ino: raidIno };
  }

  async unlink(_parent: number, _name: string): Promise<void> {
    // Abstract - implemented by subclasses
    throw new Error('unlink must be implemented by subclass');
  }

  async rmdir(parent: number, name: string): Promise<void> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error('Parent not found');

    await Promise.all(
      providerInos.map((providerIno, i) => this.providers[i].rmdir(providerIno, name))
    );
  }

  async link(ino: number, newparent: number, newname: string): Promise<FileStat> {
    const providerInos = this.getProviderInos(ino);
    const newProviderInos = this.getProviderInos(newparent);
    if (providerInos.length === 0 || newProviderInos.length === 0) {
      throw new Error('Source or destination not found');
    }

    const stats: FileStat[] = [];
    for (
      let i = 0;
      i < this.providers.length && i < providerInos.length && i < newProviderInos.length;
      i++
    ) {
      try {
        const stat = await this.providers[i].link(providerInos[i], newProviderInos[i], newname);
        stats.push(stat);
      } catch (error) {
        if (stats.length === 0) throw error;
      }
    }

    if (stats.length === 0) {
      throw new Error('Failed to link on any provider');
    }

    const raidIno = this.nextIno++;
    const linkedProviderInos = stats.map((s) => s.ino);
    this.setProviderInos(raidIno, linkedProviderInos);
    return { ...stats[0], ino: raidIno };
  }

  async symlink(_link: string, parent: number, name: string): Promise<FileStat> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error('Parent not found');

    const stats: FileStat[] = [];
    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        const stat = await this.providers[i].symlink(_link, providerInos[i], name);
        stats.push(stat);
      } catch (error) {
        if (stats.length === 0) throw error;
      }
    }

    if (stats.length === 0) {
      throw new Error('Failed to create symlink on any provider');
    }

    const raidIno = this.nextIno++;
    const newProviderInos = stats.map((s) => s.ino);
    this.setProviderInos(raidIno, newProviderInos);
    return { ...stats[0], ino: raidIno };
  }

  async readlink(ino: number): Promise<string> {
    const providerInos = this.getProviderInos(ino);
    if (providerInos.length === 0) throw new Error('Inode not found');

    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        return await this.providers[i].readlink(providerInos[i]);
      } catch {
        continue;
      }
    }
    throw new Error('Failed to readlink on any provider');
  }

  async rename(
    parent: number,
    name: string,
    newparent: number,
    newname: string,
    flags: number
  ): Promise<void> {
    const providerInos = this.getProviderInos(parent);
    const newProviderInos = this.getProviderInos(newparent);
    if (providerInos.length === 0 || newProviderInos.length === 0) {
      throw new Error('Source or destination not found');
    }

    await Promise.all(
      providerInos.map((providerIno, i) => {
        if (newProviderInos[i]) {
          return this.providers[i].rename(providerIno, name, newProviderInos[i], newname, flags);
        }
      })
    );
  }

  async setxattr(
    ino: number,
    name: string,
    value: Buffer,
    size: number,
    flags: number
  ): Promise<void> {
    const providerInos = this.getProviderInos(ino);
    await Promise.all(
      providerInos.map((providerIno, i) =>
        this.providers[i].setxattr(providerIno, name, value, size, flags)
      )
    );
  }

  async getxattr(ino: number, name: string, size: number): Promise<Buffer | number> {
    const providerInos = this.getProviderInos(ino);
    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        return await this.providers[i].getxattr(providerInos[i], name, size);
      } catch {
        continue;
      }
    }
    throw new Error('Failed to getxattr on any provider');
  }

  async listxattr(ino: number, size: number): Promise<Buffer | number> {
    const providerInos = this.getProviderInos(ino);
    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        return await this.providers[i].listxattr(providerInos[i], size);
      } catch {
        continue;
      }
    }
    return size === 0 ? 0 : Buffer.alloc(0);
  }

  async removexattr(ino: number, name: string): Promise<void> {
    const providerInos = this.getProviderInos(ino);
    await Promise.all(
      providerInos.map((providerIno, i) => this.providers[i].removexattr(providerIno, name))
    );
  }

  async access(ino: number, mask: number): Promise<void> {
    const providerInos = this.getProviderInos(ino);
    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        await this.providers[i].access(providerInos[i], mask);
        return;
      } catch {
        continue;
      }
    }
    throw new Error('Access denied on all providers');
  }

  async statfs(ino: number): Promise<Statfs> {
    const providerInos = this.getProviderInos(ino);
    if (providerInos.length === 0) {
      return {
        bsize: 4096,
        blocks: 0,
        bfree: 0,
        bavail: 0,
        files: 0,
        ffree: 0,
      };
    }

    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        return await this.providers[i].statfs(providerInos[i]);
      } catch {
        continue;
      }
    }
    throw new Error('Failed to statfs on any provider');
  }

  async getlk(_ino: number, _fh: number): Promise<Flock> {
    throw new Error('File locking not supported');
  }

  async setlk(_ino: number, _fh: number, _sleep: number): Promise<void> {
    throw new Error('File locking not supported');
  }

  async flock(_ino: number, _fh: number, _op: number): Promise<void> {
    throw new Error('File locking not supported');
  }

  async bmap(_ino: number, _blocksize: number, _idx: number): Promise<number> {
    throw new Error('Block mapping not supported');
  }

  async ioctl(
    _ino: number,
    _cmd: number,
    _in_buf: Buffer | null,
    _in_bufsz: number,
    _out_bufsz: number
  ): Promise<{ result: number; out_buf?: Buffer }> {
    throw new Error('IOCTL not supported');
  }

  async poll(_ino: number, _fh: number): Promise<number> {
    return 0x05; // POLLIN | POLLOUT
  }

  async fallocate(
    ino: number,
    fh: number,
    offset: number,
    length: number,
    mode: number
  ): Promise<void> {
    const providerFhs = this.getProviderFhs(ino, fh);
    const providerInos = this.getProviderInos(ino);
    await Promise.all(
      providerFhs.map((pfh, i) => {
        if (providerInos[i]) {
          return this.providers[i].fallocate(providerInos[i], pfh, offset, length, mode);
        }
      })
    );
  }

  async readdirplus(ino: number, size: number, offset: number): Promise<DirEntry[]> {
    return this.readdir(ino, size, offset);
  }

  async copy_file_range(
    _ino_in: number,
    _off_in: number,
    _ino_out: number,
    _off_out: number,
    _len: number,
    _flags: number
  ): Promise<number> {
    throw new Error('copy_file_range not supported');
  }

  async lseek(_ino: number, _fh: number, _off: number, _whence: number): Promise<number> {
    throw new Error('lseek not supported');
  }

  async tmpfile(parent: number, _mode: number, _flags: number): Promise<FileStat> {
    return this.create(parent, `.tmp.${Date.now()}`, _mode, _flags);
  }
}
