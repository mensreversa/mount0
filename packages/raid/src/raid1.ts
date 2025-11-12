import { FileHandle, FilesystemProvider } from '@mount0/core';
import { BaseRaidProvider } from './base';

export interface Raid1Config {
  providers: FilesystemProvider[];
}

export class Raid1Provider extends BaseRaidProvider {
  constructor(config: Raid1Config) {
    super(config.providers);
  }

  async create(path: string, mode: number): Promise<FileHandle> {
    const handles: FileHandle[] = [];
    for (const provider of this.providers) {
      try {
        handles.push(await provider.create(path, mode));
      } catch (error) {
        // RAID 1 can tolerate some failures
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

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const info = this.getFileInfo(handle.fd);
    for (let i = 0; i < info.handles.length; i++) {
      try {
        return await this.providers[i].read(info.handles[i], buffer, offset, length);
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed to read');
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const info = this.getFileInfo(handle.fd);
    await Promise.all(
      info.handles.map((h, i) => this.providers[i].write(h, buffer, offset, length))
    );
    return length;
  }

  async unlink(path: string): Promise<void> {
    const results = await Promise.allSettled(this.providers.map((p) => p.unlink(path)));
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(`Failed to unlink on ${failures.length} providers`);
    }
  }
}
