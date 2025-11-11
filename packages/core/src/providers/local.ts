import { Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FilesystemProvider } from '../provider';
import { DirEntry, FileHandle, FileStat } from '../types';

export class LocalProvider implements FilesystemProvider {
  private root: string;
  private openFiles: Map<number, fs.FileHandle>;
  private nextFd: number;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.openFiles = new Map();
    this.nextFd = 1;
  }

  private resolvePath(filePath: string): string {
    const resolved = path.resolve(this.root, filePath.replace(/^\//, ''));
    if (!resolved.startsWith(this.root)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  async getattr(filePath: string): Promise<FileStat | null> {
    try {
      const fullPath = this.resolvePath(filePath);
      const stats = await fs.stat(fullPath);

      return {
        mode: stats.mode,
        size: stats.size,
        mtime: Math.floor(stats.mtimeMs / 1000),
        ctime: Math.floor(stats.ctimeMs / 1000),
        atime: Math.floor(stats.atimeMs / 1000),
        uid: stats.uid,
        gid: stats.gid,
        dev: stats.dev,
        ino: stats.ino,
        nlink: stats.nlink,
        rdev: stats.rdev,
        blksize: stats.blksize,
        blocks: stats.blocks,
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async readdir(filePath: string): Promise<DirEntry[]> {
    const fullPath = this.resolvePath(filePath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    return Promise.all(
      entries.map(async (entry: Dirent) => {
        const stats = await fs.stat(path.join(fullPath, entry.name));
        return {
          name: entry.name,
          mode: stats.mode,
          ino: stats.ino,
        };
      })
    );
  }

  async open(filePath: string, flags: number, mode?: number): Promise<FileHandle> {
    const fullPath = this.resolvePath(filePath);
    const fileHandle = await fs.open(fullPath, flags, mode);
    const fd = this.nextFd++;
    this.openFiles.set(fd, fileHandle);

    return {
      fd,
      path: fullPath,
      flags,
    };
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const fileHandle = this.openFiles.get(handle.fd);
    if (!fileHandle) {
      throw new Error('File not open');
    }
    const result = await fileHandle.read(buffer, 0, length, offset);
    return result.bytesRead;
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const fileHandle = this.openFiles.get(handle.fd);
    if (!fileHandle) {
      throw new Error('File not open');
    }
    const result = await fileHandle.write(buffer, 0, length, offset);
    return result.bytesWritten;
  }

  async create(filePath: string, mode: number): Promise<FileHandle> {
    const fullPath = this.resolvePath(filePath);
    const fileHandle = await fs.open(fullPath, 'w', mode);
    const fd = this.nextFd++;
    this.openFiles.set(fd, fileHandle);

    return {
      fd,
      path: fullPath,
      flags: 0o2,
    };
  }

  async unlink(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.unlink(fullPath);
  }

  async mkdir(filePath: string, mode: number): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(fullPath, mode);
  }

  async rmdir(filePath: string): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    await fs.rmdir(fullPath);
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    const oldFull = this.resolvePath(oldpath);
    const newFull = this.resolvePath(newpath);
    await fs.rename(oldFull, newFull);
  }

  async truncate(filePath: string, length: number): Promise<void> {
    const fullPath = this.resolvePath(filePath);
    const fileHandle = await fs.open(fullPath, 'r+');
    try {
      await fileHandle.truncate(length);
    } finally {
      await fileHandle.close();
    }
  }

  async close(handle: FileHandle): Promise<void> {
    const fileHandle = this.openFiles.get(handle.fd);
    if (fileHandle) {
      await fileHandle.close();
      this.openFiles.delete(handle.fd);
    }
  }
}
