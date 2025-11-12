import * as path from 'path';
import { FilesystemProvider } from './provider';
import { DirEntry, FileHandle, FileStat } from './types';

export class FileSystem {
  private handlers: Map<string, FilesystemProvider>;
  private sortedPaths: string[];

  constructor(handlers: Map<string, FilesystemProvider>) {
    this.handlers = handlers;
    // Sort paths by length (longest first) for proper matching
    this.sortedPaths = Array.from(handlers.keys()).sort((a, b) => b.length - a.length);
  }

  private findProvider(
    filePath: string
  ): { provider: FilesystemProvider; mountPath: string } | null {
    const normalized = path.normalize(filePath);

    for (const mountPath of this.sortedPaths) {
      const normalizedMount = path.normalize(mountPath);
      if (normalized === normalizedMount || normalized.startsWith(normalizedMount + '/')) {
        const provider = this.handlers.get(mountPath);
        if (provider) {
          return { provider, mountPath: normalizedMount };
        }
      }
    }

    return null;
  }

  async getattr(filePath: string): Promise<FileStat | null> {
    const result = this.findProvider(filePath);
    if (!result) {
      return null;
    }

    const relPath = this.getRelativePath(filePath, result.mountPath);
    return result.provider.getattr(relPath);
  }

  async readdir(filePath: string): Promise<DirEntry[]> {
    const result = this.findProvider(filePath);
    if (!result) {
      return [];
    }

    const relPath = this.getRelativePath(filePath, result.mountPath);
    return result.provider.readdir(relPath);
  }

  async open(filePath: string, flags: number, mode?: number): Promise<FileHandle> {
    const result = this.findProvider(filePath);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, result.mountPath);
    return result.provider.open(relPath, flags, mode);
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const result = this.findProvider(handle.path);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(handle.path, result.mountPath);
    const newHandle = { ...handle, path: relPath };
    return result.provider.read(newHandle, buffer, offset, length);
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const result = this.findProvider(handle.path);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(handle.path, result.mountPath);
    const newHandle = { ...handle, path: relPath };
    return result.provider.write(newHandle, buffer, offset, length);
  }

  async create(filePath: string, mode: number): Promise<FileHandle> {
    const result = this.findProvider(filePath);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, result.mountPath);
    return result.provider.create(relPath, mode);
  }

  async unlink(filePath: string): Promise<void> {
    const result = this.findProvider(filePath);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, result.mountPath);
    return result.provider.unlink(relPath);
  }

  async mkdir(filePath: string, mode: number): Promise<void> {
    const result = this.findProvider(filePath);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, result.mountPath);
    return result.provider.mkdir(relPath, mode);
  }

  async rmdir(filePath: string): Promise<void> {
    const result = this.findProvider(filePath);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, result.mountPath);
    return result.provider.rmdir(relPath);
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    const result = this.findProvider(oldpath);
    if (!result) {
      throw new Error('No provider found');
    }

    const relOld = this.getRelativePath(oldpath, result.mountPath);
    const relNew = this.getRelativePath(newpath, result.mountPath);
    return result.provider.rename(relOld, relNew);
  }

  async truncate(filePath: string, length: number): Promise<void> {
    const result = this.findProvider(filePath);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(filePath, result.mountPath);
    return result.provider.truncate(relPath, length);
  }

  async close(handle: FileHandle): Promise<void> {
    const result = this.findProvider(handle.path);
    if (!result) {
      throw new Error('No provider found');
    }

    const relPath = this.getRelativePath(handle.path, result.mountPath);
    const newHandle = { ...handle, path: relPath };
    return result.provider.close(newHandle);
  }

  private getRelativePath(filePath: string, mountPath: string): string {
    const normalized = path.normalize(filePath);
    const normalizedMount = path.normalize(mountPath);

    if (normalized === normalizedMount) {
      return '/';
    }
    return normalized.substring(normalizedMount.length);
  }
}
