import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';

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

  private async executeWithMajority<T>(
    operation: (provider: FilesystemProvider) => Promise<T>
  ): Promise<T> {
    const results = await Promise.allSettled(this.providers.map((p) => operation(p)));
    const successful = results.filter((r) => r.status === 'fulfilled');
    if (successful.length >= this.majority) {
      return (successful[0] as PromiseFulfilledResult<T>).value;
    }
    throw new Error('Majority of providers failed');
  }

  async getattr(path: string): Promise<FileStat | null> {
    return this.executeWithMajority((p) => p.getattr(path));
  }

  async readdir(path: string): Promise<DirEntry[]> {
    return this.executeWithMajority((p) => p.readdir(path));
  }

  async open(path: string, flags: number, mode?: number): Promise<FileHandle> {
    return this.executeWithMajority((p) => p.open(path, flags, mode));
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    return this.executeWithMajority((p) => p.read(handle, buffer, offset, length));
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    // For writes, use first available (majority doesn't make sense for writes)
    for (const provider of this.providers) {
      try {
        return await provider.write(handle, buffer, offset, length);
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async create(path: string, mode: number): Promise<FileHandle> {
    return this.executeWithMajority((p) => p.create(path, mode));
  }

  async unlink(path: string): Promise<void> {
    return this.executeWithMajority((p) => p.unlink(path));
  }

  async mkdir(path: string, mode: number): Promise<void> {
    return this.executeWithMajority((p) => p.mkdir(path, mode));
  }

  async rmdir(path: string): Promise<void> {
    return this.executeWithMajority((p) => p.rmdir(path));
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    return this.executeWithMajority((p) => p.rename(oldpath, newpath));
  }

  async truncate(path: string, length: number): Promise<void> {
    return this.executeWithMajority((p) => p.truncate(path, length));
  }

  async close(handle: FileHandle): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.close(handle)));
  }
}
