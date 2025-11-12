import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';

interface MemoryNode {
  stat: FileStat;
  content?: Buffer;
  children?: Map<string, MemoryNode>;
}

export class MemoryProvider implements FilesystemProvider {
  private root: MemoryNode;
  private openFiles: Map<number, { node: MemoryNode }>;
  private nextFd: number;
  private inoCounter: number;

  constructor() {
    this.inoCounter = 1;
    this.root = {
      stat: {
        mode: 0o40755, // directory
        size: 0,
        mtime: Math.floor(Date.now() / 1000),
        ctime: Math.floor(Date.now() / 1000),
        atime: Math.floor(Date.now() / 1000),
        uid: process.getuid?.() || 0,
        gid: process.getgid?.() || 0,
        dev: 0,
        ino: this.inoCounter++,
        nlink: 1,
        rdev: 0,
        blksize: 4096,
        blocks: 0,
      },
      children: new Map(),
    };
    this.openFiles = new Map();
    this.nextFd = 1;
    this.inoCounter = 1;
  }

  private resolvePath(path: string): MemoryNode | null {
    const parts = path.split('/').filter((p) => p);
    let current = this.root;

    for (const part of parts) {
      if (!current.children || !current.children.has(part)) {
        return null;
      }
      current = current.children.get(part)!;
    }

    return current;
  }

  private ensurePath(path: string): MemoryNode {
    const parts = path.split('/').filter((p) => p);
    let current = this.root;

    for (const part of parts) {
      if (!current.children) {
        current.children = new Map();
      }
      if (!current.children.has(part)) {
        current.children.set(part, {
          stat: {
            mode: 0o40755,
            size: 0,
            mtime: Math.floor(Date.now() / 1000),
            ctime: Math.floor(Date.now() / 1000),
            atime: Math.floor(Date.now() / 1000),
            uid: process.getuid?.() || 0,
            gid: process.getgid?.() || 0,
            dev: 0,
            ino: this.inoCounter++,
            nlink: 1,
            rdev: 0,
            blksize: 4096,
            blocks: 0,
          },
          children: new Map(),
        });
      }
      current = current.children.get(part)!;
    }

    return current;
  }

  async getattr(path: string): Promise<FileStat | null> {
    const node = path === '/' ? this.root : this.resolvePath(path);
    return node ? { ...node.stat } : null;
  }

  async readdir(path: string): Promise<DirEntry[]> {
    const node = path === '/' ? this.root : this.resolvePath(path);
    if (!node || !node.children) {
      return [];
    }

    return Array.from(node.children.entries()).map(([name, child]) => ({
      name,
      mode: child.stat.mode,
      ino: child.stat.ino,
    }));
  }

  async open(path: string, flags: number, _mode?: number): Promise<FileHandle> {
    const node = this.resolvePath(path);
    if (!node) throw new Error('File not found');

    const fd = this.nextFd++;
    this.openFiles.set(fd, { node });
    return { fd, path, flags };
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const file = this.openFiles.get(handle.fd);
    if (!file) throw new Error('File not open');

    if (!file.node.content) return 0;

    const available = file.node.content.length - offset;
    const toRead = Math.min(length, available);
    if (toRead > 0) {
      file.node.content.copy(buffer, 0, offset, offset + toRead);
    }
    return toRead;
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const file = this.openFiles.get(handle.fd);
    if (!file) throw new Error('File not open');

    if (!file.node.content) file.node.content = Buffer.alloc(0);

    const newSize = Math.max(file.node.content.length, offset + length);
    const newContent = Buffer.alloc(newSize);
    file.node.content.copy(newContent);
    buffer.copy(newContent, offset, 0, length);
    file.node.content = newContent;
    file.node.stat.size = newSize;
    file.node.stat.mtime = Math.floor(Date.now() / 1000);

    return length;
  }

  async create(path: string, mode: number): Promise<FileHandle> {
    const parts = path.split('/').filter((p) => p);
    const fileName = parts.pop();
    const dirPath = parts.join('/') || '/';
    const dir = dirPath === '/' ? this.root : this.resolvePath(dirPath);
    if (!dir?.children) throw new Error('Directory not found');

    if (fileName && !dir.children.has(fileName)) {
      dir.children.set(fileName, {
        stat: {
          mode: mode || 0o100644,
          size: 0,
          mtime: Math.floor(Date.now() / 1000),
          ctime: Math.floor(Date.now() / 1000),
          atime: Math.floor(Date.now() / 1000),
          uid: process.getuid?.() || 0,
          gid: process.getgid?.() || 0,
          dev: 0,
          ino: this.inoCounter++,
          nlink: 1,
          rdev: 0,
          blksize: 4096,
          blocks: 0,
        },
        content: Buffer.alloc(0),
      });
    }

    const node = this.resolvePath(path);
    if (!node) throw new Error('Failed to create file');

    const fd = this.nextFd++;
    this.openFiles.set(fd, { node });
    return { fd, path, flags: 0o2 };
  }

  async unlink(path: string): Promise<void> {
    const parts = path.split('/').filter((p) => p);
    const fileName = parts.pop();
    const dirPath = parts.join('/') || '/';
    const dir = dirPath === '/' ? this.root : this.resolvePath(dirPath);
    if (!dir?.children || !fileName) throw new Error('File not found');
    dir.children.delete(fileName);
  }

  async mkdir(path: string, mode: number): Promise<void> {
    const node = this.ensurePath(path);
    node.stat.mode = mode || 0o40755;
    node.stat.mtime = Math.floor(Date.now() / 1000);
    node.stat.ctime = Math.floor(Date.now() / 1000);
  }

  async rmdir(path: string): Promise<void> {
    const parts = path.split('/').filter((p) => p);
    const dirName = parts.pop();
    const parentPath = parts.join('/') || '/';
    const parent = parentPath === '/' ? this.root : this.resolvePath(parentPath);
    if (!parent?.children || !dirName) throw new Error('Directory not found');

    const dir = parent.children.get(dirName);
    if (!dir || dir.children?.size) throw new Error('Directory not empty');
    parent.children.delete(dirName);
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    const oldNode = this.resolvePath(oldpath);
    if (!oldNode) throw new Error('Source not found');

    const oldParts = oldpath.split('/').filter((p) => p);
    const oldName = oldParts.pop();
    const oldDir = oldParts.length === 0 ? this.root : this.resolvePath(oldParts.join('/'));
    const newParts = newpath.split('/').filter((p) => p);
    const newName = newParts.pop();
    const newDir = newParts.length === 0 ? this.root : this.resolvePath(newParts.join('/'));

    if (!oldDir?.children || !oldName || !newDir?.children || !newName) {
      throw new Error('Invalid path');
    }

    const node = oldDir.children.get(oldName);
    if (!node) throw new Error('Source not found');
    newDir.children.set(newName, node);
    oldDir.children.delete(oldName);
  }

  async truncate(path: string, length: number): Promise<void> {
    const node = this.resolvePath(path);
    if (!node) throw new Error('File not found');
    if (node.content) {
      node.content = Buffer.from(node.content.subarray(0, length));
      node.stat.size = length;
      node.stat.mtime = Math.floor(Date.now() / 1000);
    }
  }

  async close(handle: FileHandle): Promise<void> {
    this.openFiles.delete(handle.fd);
  }
}
