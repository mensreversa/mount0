import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';

export interface BaseCacheConfig {
  master: FilesystemProvider;
  slave: FilesystemProvider;
}

export abstract class BaseCacheProvider implements FilesystemProvider {
  protected master: FilesystemProvider;
  protected slave: FilesystemProvider;

  constructor(config: BaseCacheConfig) {
    this.master = config.master;
    this.slave = config.slave;
  }

  async getattr(path: string): Promise<FileStat | null> {
    const stat = await this.slave.getattr(path);
    return stat || this.master.getattr(path);
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const entries = await this.slave.readdir(path);
    return entries.length > 0 ? entries : this.master.readdir(path);
  }

  async open(path: string, flags: number, mode?: number): Promise<FileHandle> {
    // Open from slave (cache) if available, otherwise from master
    try {
      return await this.slave.open(path, flags, mode);
    } catch {
      return await this.master.open(path, flags, mode);
    }
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    // Read from slave (cache) if available, otherwise from master
    try {
      return await this.slave.read(handle, buffer, offset, length);
    } catch {
      return await this.master.read(handle, buffer, offset, length);
    }
  }

  async create(path: string, mode: number): Promise<FileHandle> {
    const handle = await this.master.create(path, mode);
    // Also create in slave if possible
    try {
      await this.slave.create(path, mode);
    } catch {
      // Ignore slave errors
    }
    return handle;
  }

  async unlink(path: string): Promise<void> {
    await this.master.unlink(path);
    try {
      await this.slave.unlink(path);
    } catch {
      // Ignore slave errors
    }
  }

  async mkdir(path: string, mode: number): Promise<void> {
    await this.master.mkdir(path, mode);
    try {
      await this.slave.mkdir(path, mode);
    } catch {
      // Ignore slave errors
    }
  }

  async rmdir(path: string): Promise<void> {
    await this.master.rmdir(path);
    try {
      await this.slave.rmdir(path);
    } catch {
      // Ignore slave errors
    }
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    await this.master.rename(oldpath, newpath);
    try {
      await this.slave.rename(oldpath, newpath);
    } catch {
      // Ignore slave errors
    }
  }

  async truncate(path: string, length: number): Promise<void> {
    await this.master.truncate(path, length);
    try {
      await this.slave.truncate(path, length);
    } catch {
      // Ignore slave errors
    }
  }

  async close(handle: FileHandle): Promise<void> {
    await Promise.all([
      this.master.close(handle).catch(() => {}),
      this.slave.close(handle).catch(() => {}),
    ]);
  }

  abstract write(
    handle: FileHandle,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number>;
}
