import { DirEntry, FileStat, FilesystemProvider, Flock, Statfs } from '@mount0/core';
import { Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

export class LocalProvider implements FilesystemProvider {
  private root: string;
  private inoToPath: Map<number, string> = new Map();
  private pathToIno: Map<string, number> = new Map();
  private openFiles: Map<number, Map<number, fs.FileHandle>> = new Map(); // ino -> fh -> handle
  private nextFh: number = 1;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.inoToPath.set(1, '/');
    this.pathToIno.set('/', 1);
  }

  private resolvePath(filePath: string): string {
    const resolved = path.resolve(this.root, filePath.replace(/^\//, ''));
    if (!resolved.startsWith(this.root)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }

  private getPath(ino: number): string {
    return this.inoToPath.get(ino) || '/';
  }

  private setPath(ino: number, filePath: string): void {
    this.inoToPath.set(ino, filePath);
    this.pathToIno.set(filePath, ino);
  }

  private pathFromParent(parent: number, name: string): string {
    const parentPath = this.getPath(parent);
    return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
  }

  async lookup(parent: number, name: string): Promise<FileStat | null> {
    const filePath = this.pathFromParent(parent, name);
    const fullPath = this.resolvePath(filePath);
    try {
      const stats = await fs.stat(fullPath);
      this.setPath(stats.ino, filePath);
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

  async getattr(ino: number): Promise<FileStat | null> {
    const filePath = this.getPath(ino);
    const fullPath = this.resolvePath(filePath);
    try {
      const stats = await fs.stat(fullPath);
      this.setPath(stats.ino, filePath);
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

  async readdir(ino: number, size: number, offset: number): Promise<DirEntry[]> {
    const filePath = this.getPath(ino);
    const fullPath = this.resolvePath(filePath);
    const entries = await fs.readdir(fullPath, { withFileTypes: true });

    const result = await Promise.all(
      entries.map(async (entry: Dirent) => {
        const entryPath = filePath === '/' ? `/${entry.name}` : `${filePath}/${entry.name}`;
        const entryFullPath = this.resolvePath(entryPath);
        const stats = await fs.stat(entryFullPath);
        this.setPath(stats.ino, entryPath);
        return {
          name: entry.name,
          mode: stats.mode,
          ino: stats.ino,
        };
      })
    );
    return result.slice(offset);
  }

  async open(ino: number, flags: number, mode?: number): Promise<number> {
    const filePath = this.getPath(ino);
    const fullPath = this.resolvePath(filePath);
    const fileHandle = await fs.open(fullPath, flags, mode);
    const fh = this.nextFh++;
    if (!this.openFiles.has(ino)) {
      this.openFiles.set(ino, new Map());
    }
    this.openFiles.get(ino)!.set(fh, fileHandle);
    return fh;
  }

  async read(
    ino: number,
    fh: number,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number> {
    const handles = this.openFiles.get(ino);
    if (!handles) throw new Error('File not open');
    const fileHandle = handles.get(fh);
    if (!fileHandle) throw new Error('File handle not found');
    const result = await fileHandle.read(buffer, 0, length, offset);
    return result.bytesRead;
  }

  async write(
    ino: number,
    fh: number,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number> {
    const handles = this.openFiles.get(ino);
    if (!handles) throw new Error('File not open');
    const fileHandle = handles.get(fh);
    if (!fileHandle) throw new Error('File handle not found');
    const result = await fileHandle.write(buffer, 0, length, offset);
    return result.bytesWritten;
  }

  async create(parent: number, name: string, mode: number, _flags: number): Promise<FileStat> {
    const filePath = this.pathFromParent(parent, name);
    const fullPath = this.resolvePath(filePath);
    const parentDir = path.dirname(fullPath);
    try {
      await fs.mkdir(parentDir, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
    const fileHandle = await fs.open(fullPath, 'w', mode);
    const fh = this.nextFh++;
    const stats = await fs.stat(fullPath);
    this.setPath(stats.ino, filePath);
    if (!this.openFiles.has(stats.ino)) {
      this.openFiles.set(stats.ino, new Map());
    }
    this.openFiles.get(stats.ino)!.set(fh, fileHandle);
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
  }

  async unlink(parent: number, name: string): Promise<void> {
    const filePath = this.pathFromParent(parent, name);
    const fullPath = this.resolvePath(filePath);
    await fs.unlink(fullPath);
    const ino = this.pathToIno.get(filePath);
    if (ino) {
      this.inoToPath.delete(ino);
      this.pathToIno.delete(filePath);
    }
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    const filePath = this.pathFromParent(parent, name);
    const fullPath = this.resolvePath(filePath);
    await fs.mkdir(fullPath, mode);
    const stats = await fs.stat(fullPath);
    this.setPath(stats.ino, filePath);
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
  }

  async rmdir(parent: number, name: string): Promise<void> {
    const filePath = this.pathFromParent(parent, name);
    const fullPath = this.resolvePath(filePath);
    await fs.rmdir(fullPath);
    const ino = this.pathToIno.get(filePath);
    if (ino) {
      this.inoToPath.delete(ino);
      this.pathToIno.delete(filePath);
    }
  }

  async rename(
    parent: number,
    name: string,
    newparent: number,
    newname: string,
    _flags: number
  ): Promise<void> {
    const oldPath = this.pathFromParent(parent, name);
    const newPath = this.pathFromParent(newparent, newname);
    const oldFull = this.resolvePath(oldPath);
    const newFull = this.resolvePath(newPath);
    await fs.rename(oldFull, newFull);
    const ino = this.pathToIno.get(oldPath);
    if (ino) {
      this.inoToPath.set(ino, newPath);
      this.pathToIno.delete(oldPath);
      this.pathToIno.set(newPath, ino);
    }
  }

  async setattr(ino: number, length: number): Promise<void> {
    const filePath = this.getPath(ino);
    const fullPath = this.resolvePath(filePath);
    const fileHandle = await fs.open(fullPath, 'r+');
    try {
      await fileHandle.truncate(length);
    } finally {
      await fileHandle.close();
    }
  }

  async release(ino: number, fh: number): Promise<void> {
    const handles = this.openFiles.get(ino);
    if (!handles) return;
    const fileHandle = handles.get(fh);
    if (fileHandle) {
      await fileHandle.close();
      handles.delete(fh);
    }
    if (handles.size === 0) {
      this.openFiles.delete(ino);
    }
  }

  // Directory operations
  async opendir(ino: number, flags: number): Promise<number> {
    // For directories, we can use the same open mechanism
    return this.open(ino, flags);
  }

  async releasedir(ino: number, fh: number): Promise<void> {
    return this.release(ino, fh);
  }

  async fsyncdir(_ino: number, _fh: number, _datasync: number): Promise<void> {
    // Directory sync - no-op for local filesystem
  }

  // File operations
  async flush(ino: number, fh: number): Promise<void> {
    const handles = this.openFiles.get(ino);
    if (!handles) return;
    const fileHandle = handles.get(fh);
    if (fileHandle) {
      await fileHandle.sync();
    }
  }

  async fsync(ino: number, fh: number, _datasync: number): Promise<void> {
    const handles = this.openFiles.get(ino);
    if (!handles) return;
    const fileHandle = handles.get(fh);
    if (fileHandle) {
      await fileHandle.sync();
    }
  }

  // Create operations
  async mknod(parent: number, name: string, mode: number, _rdev: number): Promise<FileStat> {
    const filePath = this.pathFromParent(parent, name);
    const fullPath = this.resolvePath(filePath);
    // For regular files, use create; for devices, this would need special handling
    if (S_ISREG(mode)) {
      await fs.writeFile(fullPath, '', { mode });
    } else {
      // Device files - not fully supported on all platforms
      throw new Error('Device file creation not fully supported');
    }
    const stats = await fs.stat(fullPath);
    this.setPath(stats.ino, filePath);
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
  }

  // Link operations
  async link(ino: number, newparent: number, newname: string): Promise<FileStat> {
    const oldPath = this.getPath(ino);
    const newPath = this.pathFromParent(newparent, newname);
    const oldFull = this.resolvePath(oldPath);
    const newFull = this.resolvePath(newPath);
    await fs.link(oldFull, newFull);
    const stats = await fs.stat(newFull);
    this.setPath(stats.ino, newPath);
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
  }

  async symlink(link: string, parent: number, name: string): Promise<FileStat> {
    const filePath = this.pathFromParent(parent, name);
    const fullPath = this.resolvePath(filePath);
    await fs.symlink(link, fullPath);
    const stats = await fs.lstat(fullPath);
    this.setPath(stats.ino, filePath);
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
  }

  async readlink(ino: number): Promise<string> {
    const filePath = this.getPath(ino);
    const fullPath = this.resolvePath(filePath);
    return await fs.readlink(fullPath);
  }

  // Extended attributes
  async setxattr(
    _ino: number,
    _name: string,
    _value: Buffer,
    _size: number,
    _flags: number
  ): Promise<void> {
    // Extended attributes not fully supported - would need platform-specific code
    throw new Error('Extended attributes not supported');
  }

  async getxattr(_ino: number, _name: string, _size: number): Promise<Buffer | number> {
    // Extended attributes not fully supported
    throw new Error('Extended attributes not supported');
  }

  async listxattr(_ino: number, size: number): Promise<Buffer | number> {
    // Extended attributes not fully supported
    if (size === 0) return 0;
    return Buffer.alloc(0);
  }

  async removexattr(_ino: number, _name: string): Promise<void> {
    // Extended attributes not fully supported
    throw new Error('Extended attributes not supported');
  }

  // Other operations
  async access(ino: number, mask: number): Promise<void> {
    const filePath = this.getPath(ino);
    const fullPath = this.resolvePath(filePath);
    await fs.access(fullPath, mask);
  }

  async statfs(ino: number): Promise<Statfs> {
    const filePath = this.getPath(ino);
    const fullPath = this.resolvePath(filePath);
    const stats = await fs.statfs(fullPath);
    return {
      bsize: stats.bsize,
      blocks: stats.blocks,
      bfree: stats.bfree,
      bavail: stats.bavail,
      files: stats.files,
      ffree: stats.ffree,
    };
  }

  // Locking
  async getlk(_ino: number, _fh: number): Promise<Flock> {
    // File locking not implemented
    throw new Error('File locking not supported');
  }

  async setlk(_ino: number, _fh: number, _sleep: number): Promise<void> {
    // File locking not implemented
    throw new Error('File locking not supported');
  }

  async flock(_ino: number, _fh: number, _op: number): Promise<void> {
    // File locking not implemented
    throw new Error('File locking not supported');
  }

  // Advanced operations
  async bmap(_ino: number, _blocksize: number, _idx: number): Promise<number> {
    // Block mapping not implemented
    throw new Error('Block mapping not supported');
  }

  async ioctl(
    _ino: number,
    _cmd: number,
    _in_buf: Buffer | null,
    _in_bufsz: number,
    _out_bufsz: number
  ): Promise<{ result: number; out_buf?: Buffer }> {
    // IOCTL not implemented
    throw new Error('IOCTL not supported');
  }

  async poll(_ino: number, _fh: number): Promise<number> {
    // Poll not implemented - return default readable/writable
    return 0x05; // POLLIN | POLLOUT
  }

  async fallocate(
    ino: number,
    fh: number,
    offset: number,
    length: number,
    _mode: number
  ): Promise<void> {
    const handles = this.openFiles.get(ino);
    if (!handles) throw new Error('File not open');
    const fileHandle = handles.get(fh);
    if (!fileHandle) throw new Error('File handle not found');
    // Fallocate - ensure space is allocated
    const stats = await fileHandle.stat();
    const newSize = Math.max(stats.size, offset + length);
    await fileHandle.truncate(newSize);
  }

  async readdirplus(ino: number, size: number, off: number): Promise<DirEntry[]> {
    // Same as readdir for now
    return this.readdir(ino, size, off);
  }

  async copy_file_range(
    ino_in: number,
    off_in: number,
    ino_out: number,
    off_out: number,
    len: number,
    _flags: number
  ): Promise<number> {
    const inPath = this.getPath(ino_in);
    const outPath = this.getPath(ino_out);
    const inFull = this.resolvePath(inPath);
    const outFull = this.resolvePath(outPath);

    const inHandle = await fs.open(inFull, 'r');
    const outHandle = await fs.open(outFull, 'r+');
    try {
      const buf = Buffer.alloc(len);
      const { bytesRead } = await inHandle.read(buf, 0, len, off_in);
      if (bytesRead > 0) {
        await outHandle.write(buf, 0, bytesRead, off_out);
      }
      return bytesRead;
    } finally {
      await inHandle.close();
      await outHandle.close();
    }
  }

  async lseek(ino: number, fh: number, _off: number, _whence: number): Promise<number> {
    const handles = this.openFiles.get(ino);
    if (!handles) throw new Error('File not open');
    const fileHandle = handles.get(fh);
    if (!fileHandle) throw new Error('File handle not found');
    // lseek - return current position (simplified)
    const stats = await fileHandle.stat();
    return stats.size;
  }

  async tmpfile(parent: number, mode: number, flags: number): Promise<FileStat> {
    // Create a temporary file - use create for now
    const name = `.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`;
    return this.create(parent, name, mode, flags);
  }
}

// Helper to check file type
function S_ISREG(mode: number): boolean {
  return (mode & 0o170000) === 0o100000;
}
