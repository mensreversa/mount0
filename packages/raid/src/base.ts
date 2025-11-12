import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';

export abstract class BaseRaidProvider implements FilesystemProvider {
  protected providers: FilesystemProvider[];
  protected stripeSize: number;
  protected openHandles: Map<number, { handles: FileHandle[]; path: string; flags: number }>;
  protected nextFd: number;

  constructor(providers: FilesystemProvider[], stripeSize: number = 64 * 1024) {
    if (providers.length < 2) {
      throw new Error('RAID requires at least 2 providers');
    }
    this.providers = providers;
    this.stripeSize = stripeSize;
    this.openHandles = new Map();
    this.nextFd = 1;
  }

  protected getFileInfo(fd: number) {
    const info = this.openHandles.get(fd);
    if (!info) throw new Error('File handle not found');
    return info;
  }

  async getattr(path: string): Promise<FileStat | null> {
    for (const provider of this.providers) {
      try {
        const stat = await provider.getattr(path);
        if (stat) return stat;
      } catch {
        continue;
      }
    }
    return null;
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const entriesMap = new Map<string, DirEntry>();
    for (const provider of this.providers) {
      try {
        for (const entry of await provider.readdir(path)) {
          if (!entriesMap.has(entry.name)) {
            entriesMap.set(entry.name, entry);
          }
        }
      } catch {
        continue;
      }
    }
    return Array.from(entriesMap.values());
  }

  async open(path: string, flags: number, mode?: number): Promise<FileHandle> {
    const handles: FileHandle[] = [];
    const errors: Error[] = [];

    for (const provider of this.providers) {
      try {
        handles.push(await provider.open(path, flags, mode));
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (handles.length === 0) {
      throw new Error(`Failed to open: ${errors.map((e) => e.message).join(', ')}`);
    }

    const fd = this.nextFd++;
    this.openHandles.set(fd, { handles, path, flags });
    return { fd, path, flags };
  }

  async create(path: string, mode: number): Promise<FileHandle> {
    const handles: FileHandle[] = [];
    for (const provider of this.providers) {
      try {
        handles.push(await provider.create(path, mode));
      } catch (error) {
        // Continue if we already have some handles (for RAID 1)
        if (handles.length === 0) {
          throw error;
        }
      }
    }
    if (handles.length === 0) {
      throw new Error('Failed to create file on any provider');
    }
    const fd = this.nextFd++;
    this.openHandles.set(fd, { handles, path, flags: 0o2 });
    return { fd, path, flags: 0o2 };
  }

  async close(handle: FileHandle): Promise<void> {
    const info = this.openHandles.get(handle.fd);
    if (!info) return;
    await Promise.allSettled(info.handles.map((h, i) => this.providers[i].close(h)));
    this.openHandles.delete(handle.fd);
  }

  async mkdir(path: string, mode: number): Promise<void> {
    await Promise.all(this.providers.map((p) => p.mkdir(path, mode)));
  }

  async rmdir(path: string): Promise<void> {
    await Promise.all(this.providers.map((p) => p.rmdir(path)));
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    await Promise.all(this.providers.map((p) => p.rename(oldpath, newpath)));
  }

  async truncate(path: string, length: number): Promise<void> {
    await Promise.all(this.providers.map((p) => p.truncate(path, length)));
  }

  abstract read(
    handle: FileHandle,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number>;
  abstract write(
    handle: FileHandle,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number>;
  abstract unlink(path: string): Promise<void>;
}
