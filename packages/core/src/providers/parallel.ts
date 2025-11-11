import { FilesystemProvider } from '../provider';
import { DirEntry, FileHandle, FileStat } from '../types';

export interface ParallelProviderConfig {
  providers: FilesystemProvider[];
  strategy?: 'first' | 'all' | 'majority';
}

export class ParallelProvider implements FilesystemProvider {
  private providers: FilesystemProvider[];
  private strategy: 'first' | 'all' | 'majority';

  constructor(config: ParallelProviderConfig) {
    this.providers = config.providers;
    this.strategy = config.strategy || 'first';
  }

  private async executeFirst<T>(
    operation: (provider: FilesystemProvider) => Promise<T>
  ): Promise<T> {
    for (const provider of this.providers) {
      try {
        return await operation(provider);
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  private async executeAll<T>(
    operation: (provider: FilesystemProvider) => Promise<T>
  ): Promise<T[]> {
    return Promise.all(this.providers.map((p) => operation(p)));
  }

  private async executeMajority<T>(
    operation: (provider: FilesystemProvider) => Promise<T>
  ): Promise<T> {
    const results = await Promise.allSettled(this.providers.map((p) => operation(p)));

    const successful = results.filter((r) => r.status === 'fulfilled');
    const majority = Math.floor(this.providers.length / 2) + 1;

    if (successful.length >= majority) {
      return (successful[0] as PromiseFulfilledResult<T>).value;
    }

    throw new Error('Majority of providers failed');
  }

  async getattr(path: string): Promise<FileStat | null> {
    if (this.strategy === 'first') {
      return this.executeFirst((p) => p.getattr(path));
    } else if (this.strategy === 'all') {
      const results = await this.executeAll((p) => p.getattr(path));
      return results.find((r) => r !== null) || null;
    } else {
      return this.executeMajority((p) => p.getattr(path));
    }
  }

  async readdir(path: string): Promise<DirEntry[]> {
    if (this.strategy === 'first') {
      return this.executeFirst((p) => p.readdir(path));
    } else if (this.strategy === 'all') {
      const results = await this.executeAll((p) => p.readdir(path));
      // Merge unique entries
      const merged = new Map<string, DirEntry>();
      for (const entries of results) {
        for (const entry of entries) {
          merged.set(entry.name, entry);
        }
      }
      return Array.from(merged.values());
    } else {
      return this.executeMajority((p) => p.readdir(path));
    }
  }

  async open(path: string, flags: number, mode?: number): Promise<FileHandle> {
    if (this.strategy === 'first') {
      return this.executeFirst((p) => p.open(path, flags, mode));
    } else {
      // For write operations, use first available
      return this.executeFirst((p) => p.open(path, flags, mode));
    }
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    if (this.strategy === 'first') {
      return this.executeFirst((p) => p.read(handle, buffer, offset, length));
    } else if (this.strategy === 'all') {
      // Read from first, but verify with others if needed
      return this.executeFirst((p) => p.read(handle, buffer, offset, length));
    } else {
      return this.executeMajority((p) => p.read(handle, buffer, offset, length));
    }
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    if (this.strategy === 'all') {
      // Write to all providers
      await this.executeAll((p) => p.write(handle, buffer, offset, length));
      return length;
    } else {
      // Write to first available
      return this.executeFirst((p) => p.write(handle, buffer, offset, length));
    }
  }

  async create(path: string, mode: number): Promise<FileHandle> {
    if (this.strategy === 'all') {
      const handles = await this.executeAll((p) => p.create(path, mode));
      return handles[0]; // Return first handle
    } else {
      return this.executeFirst((p) => p.create(path, mode));
    }
  }

  async unlink(path: string): Promise<void> {
    if (this.strategy === 'all') {
      await this.executeAll((p) => p.unlink(path));
    } else {
      await this.executeFirst((p) => p.unlink(path));
    }
  }

  async mkdir(path: string, mode: number): Promise<void> {
    if (this.strategy === 'all') {
      await this.executeAll((p) => p.mkdir(path, mode));
    } else {
      await this.executeFirst((p) => p.mkdir(path, mode));
    }
  }

  async rmdir(path: string): Promise<void> {
    if (this.strategy === 'all') {
      await this.executeAll((p) => p.rmdir(path));
    } else {
      await this.executeFirst((p) => p.rmdir(path));
    }
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    if (this.strategy === 'all') {
      await this.executeAll((p) => p.rename(oldpath, newpath));
    } else {
      await this.executeFirst((p) => p.rename(oldpath, newpath));
    }
  }

  async truncate(path: string, length: number): Promise<void> {
    if (this.strategy === 'all') {
      await this.executeAll((p) => p.truncate(path, length));
    } else {
      await this.executeFirst((p) => p.truncate(path, length));
    }
  }

  async close(handle: FileHandle): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.close(handle)));
  }
}
