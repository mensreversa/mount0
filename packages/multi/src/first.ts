import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';

export interface FirstProviderConfig {
  providers: FilesystemProvider[];
}

export class FirstProvider implements FilesystemProvider {
  private providers: FilesystemProvider[];

  constructor(config: FirstProviderConfig) {
    this.providers = config.providers;
  }

  async getattr(path: string): Promise<FileStat | null> {
    for (const provider of this.providers) {
      try {
        return await provider.getattr(path);
      } catch {
        continue;
      }
    }
    return null;
  }

  async readdir(path: string): Promise<DirEntry[]> {
    for (const provider of this.providers) {
      try {
        return await provider.readdir(path);
      } catch {
        continue;
      }
    }
    return [];
  }

  async open(path: string, flags: number, mode?: number): Promise<FileHandle> {
    for (const provider of this.providers) {
      try {
        return await provider.open(path, flags, mode);
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    for (const provider of this.providers) {
      try {
        return await provider.read(handle, buffer, offset, length);
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
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
    for (const provider of this.providers) {
      try {
        return await provider.create(path, mode);
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async unlink(path: string): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.unlink(path);
        return;
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async mkdir(path: string, mode: number): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.mkdir(path, mode);
        return;
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async rmdir(path: string): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.rmdir(path);
        return;
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.rename(oldpath, newpath);
        return;
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async truncate(path: string, length: number): Promise<void> {
    for (const provider of this.providers) {
      try {
        await provider.truncate(path, length);
        return;
      } catch {
        continue;
      }
    }
    throw new Error('All providers failed');
  }

  async close(handle: FileHandle): Promise<void> {
    await Promise.allSettled(this.providers.map((p) => p.close(handle)));
  }
}
