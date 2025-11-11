import * as path from 'path';
import { MountConfig, PathMapping } from './config';
import { FilesystemProvider } from './provider';
import { DirEntry, FileHandle, FileStat } from './types';

export class FileSystem {
  private providers: Map<string, FilesystemProvider>;
  private mappings: PathMapping[];

  constructor(config: MountConfig, providers: Map<string, FilesystemProvider>) {
    this.providers = providers;
    this.mappings = config.mappings.sort((a, b) => b.path.length - a.path.length);
  }

  private findProvider(filePath: string): FilesystemProvider | null {
    const normalized = path.normalize(filePath);

    for (const mapping of this.mappings) {
      const mappedPath = path.normalize(mapping.path);
      if (normalized === mappedPath || normalized.startsWith(mappedPath + '/')) {
        const provider = this.providers.get(mapping.backend);
        if (provider) {
          return provider;
        }
      }
    }

    return null;
  }

  async getattr(filePath: string): Promise<FileStat | null> {
    const provider = this.findProvider(filePath);
    if (!provider) {
      return null;
    }

    const relPath = this.getRelativePath(filePath, provider);
    return provider.getattr(relPath);
  }

  async readdir(filePath: string): Promise<DirEntry[]> {
    const provider = this.findProvider(filePath);
    if (!provider) {
      return [];
    }

    const relPath = this.getRelativePath(filePath, provider);
    return provider.readdir(relPath);
  }

  async open(filePath: string, flags: number, mode?: number): Promise<FileHandle> {
    const provider = this.findProvider(filePath);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, provider);
    return provider.open(relPath, flags, mode);
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const provider = this.findProvider(handle.path);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(handle.path, provider);
    const newHandle = { ...handle, path: relPath };
    return provider.read(newHandle, buffer, offset, length);
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const provider = this.findProvider(handle.path);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(handle.path, provider);
    const newHandle = { ...handle, path: relPath };
    return provider.write(newHandle, buffer, offset, length);
  }

  async create(filePath: string, mode: number): Promise<FileHandle> {
    const provider = this.findProvider(filePath);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, provider);
    return provider.create(relPath, mode);
  }

  async unlink(filePath: string): Promise<void> {
    const provider = this.findProvider(filePath);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, provider);
    return provider.unlink(relPath);
  }

  async mkdir(filePath: string, mode: number): Promise<void> {
    const provider = this.findProvider(filePath);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, provider);
    return provider.mkdir(relPath, mode);
  }

  async rmdir(filePath: string): Promise<void> {
    const provider = this.findProvider(filePath);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, provider);
    return provider.rmdir(relPath);
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    const provider = this.findProvider(oldpath);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relOld = this.getRelativePath(oldpath, provider);
    const relNew = this.getRelativePath(newpath, provider);
    return provider.rename(relOld, relNew);
  }

  async truncate(filePath: string, length: number): Promise<void> {
    const provider = this.findProvider(filePath);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, provider);
    return provider.truncate(relPath, length);
  }

  async close(handle: FileHandle): Promise<void> {
    const provider = this.findProvider(handle.path);
    if (!provider) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(handle.path, provider);
    const newHandle = { ...handle, path: relPath };
    return provider.close(newHandle);
  }

  private getRelativePath(filePath: string, provider: FilesystemProvider): string {
    for (const mapping of this.mappings) {
      const mappedPath = path.normalize(mapping.path);
      const normalized = path.normalize(filePath);

      if (normalized === mappedPath || normalized.startsWith(mappedPath + '/')) {
        if (this.providers.get(mapping.backend) === provider) {
          if (normalized === mappedPath) {
            return '/';
          }
          return normalized.substring(mappedPath.length);
        }
      }
    }
    return filePath;
  }
}
