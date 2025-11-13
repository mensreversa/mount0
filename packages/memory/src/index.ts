import { DirEntry, FileStat, FilesystemProvider, Flock, Statfs } from '@mount0/core';

interface MemoryNode {
  stat: FileStat;
  content?: Buffer;
  children?: Map<string, MemoryNode>;
}

export class MemoryProvider implements FilesystemProvider {
  private root: MemoryNode;
  private inoToNode: Map<number, MemoryNode> = new Map();
  private inoToPath: Map<number, string> = new Map();
  private pathToIno: Map<string, number> = new Map();
  private openFiles: Map<number, Map<number, MemoryNode>> = new Map(); // ino -> fh -> node
  private nextFh: number = 1;
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
    this.inoToNode.set(this.root.stat.ino, this.root);
    this.inoToPath.set(this.root.stat.ino, '/');
    this.pathToIno.set('/', this.root.stat.ino);
  }

  private getNode(ino: number): MemoryNode | null {
    return this.inoToNode.get(ino) || null;
  }

  private setNode(ino: number, node: MemoryNode, path: string): void {
    this.inoToNode.set(ino, node);
    this.inoToPath.set(ino, path);
    this.pathToIno.set(path, ino);
  }

  private pathFromParent(parent: number, name: string): string {
    const parentPath = this.inoToPath.get(parent) || '/';
    return parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
  }

  async lookup(parent: number, name: string): Promise<FileStat | null> {
    const parentNode = this.getNode(parent);
    if (!parentNode?.children) return null;

    const child = parentNode.children.get(name);
    if (!child) return null;

    const path = this.pathFromParent(parent, name);
    this.setNode(child.stat.ino, child, path);
    return { ...child.stat };
  }

  async getattr(ino: number): Promise<FileStat | null> {
    const node = this.getNode(ino);
    return node ? { ...node.stat } : null;
  }

  async readdir(ino: number, size: number, offset: number): Promise<DirEntry[]> {
    const node = this.getNode(ino);
    if (!node?.children) return [];

    const entries = Array.from(node.children.entries()).map(([name, child]) => {
      const path = this.pathFromParent(ino, name);
      this.setNode(child.stat.ino, child, path);
      return {
        name,
        mode: child.stat.mode,
        ino: child.stat.ino,
      };
    });
    return entries.slice(offset);
  }

  async open(ino: number, _flags: number, _mode?: number): Promise<number> {
    const node = this.getNode(ino);
    if (!node) throw new Error('File not found');

    const fh = this.nextFh++;
    if (!this.openFiles.has(ino)) {
      this.openFiles.set(ino, new Map());
    }
    this.openFiles.get(ino)!.set(fh, node);
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
    const node = handles.get(fh);
    if (!node) throw new Error('File handle not found');

    if (!node.content) return 0;

    const available = node.content.length - offset;
    const toRead = Math.min(length, available);
    if (toRead > 0) {
      node.content.copy(buffer, 0, offset, offset + toRead);
    }
    return toRead;
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
    const node = handles.get(fh);
    if (!node) throw new Error('File handle not found');

    if (!node.content) node.content = Buffer.alloc(0);

    const newSize = Math.max(node.content.length, offset + length);
    const newContent = Buffer.alloc(newSize);
    node.content.copy(newContent);
    buffer.copy(newContent, offset, 0, length);
    node.content = newContent;
    node.stat.size = newSize;
    node.stat.mtime = Math.floor(Date.now() / 1000);

    return length;
  }

  async create(parent: number, name: string, mode: number, _flags: number): Promise<FileStat> {
    const parentNode = this.getNode(parent);
    if (!parentNode?.children) throw new Error('Directory not found');

    if (!parentNode.children.has(name)) {
      const newNode: MemoryNode = {
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
      };
      parentNode.children.set(name, newNode);
      const path = this.pathFromParent(parent, name);
      this.setNode(newNode.stat.ino, newNode, path);

      const fh = this.nextFh++;
      if (!this.openFiles.has(newNode.stat.ino)) {
        this.openFiles.set(newNode.stat.ino, new Map());
      }
      this.openFiles.get(newNode.stat.ino)!.set(fh, newNode);
    }

    const node = parentNode.children.get(name);
    if (!node) throw new Error('Failed to create file');
    return { ...node.stat };
  }

  async unlink(parent: number, name: string): Promise<void> {
    const parentNode = this.getNode(parent);
    if (!parentNode?.children) throw new Error('Directory not found');
    const node = parentNode.children.get(name);
    if (node) {
      const ino = node.stat.ino;
      this.inoToNode.delete(ino);
      const path = this.inoToPath.get(ino);
      if (path) {
        this.inoToPath.delete(ino);
        this.pathToIno.delete(path);
      }
    }
    parentNode.children.delete(name);
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    const parentNode = this.getNode(parent);
    if (!parentNode?.children) throw new Error('Directory not found');

    if (!parentNode.children.has(name)) {
      const newNode: MemoryNode = {
        stat: {
          mode: mode || 0o40755,
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
      parentNode.children.set(name, newNode);
      const path = this.pathFromParent(parent, name);
      this.setNode(newNode.stat.ino, newNode, path);
      return { ...newNode.stat };
    }

    const node = parentNode.children.get(name);
    if (!node) throw new Error('Failed to create directory');
    return { ...node.stat };
  }

  async rmdir(parent: number, name: string): Promise<void> {
    const parentNode = this.getNode(parent);
    if (!parentNode?.children) throw new Error('Directory not found');
    const node = parentNode.children.get(name);
    if (!node) throw new Error('Directory not found');
    if (node.children?.size) throw new Error('Directory not empty');

    const ino = node.stat.ino;
    this.inoToNode.delete(ino);
    const path = this.inoToPath.get(ino);
    if (path) {
      this.inoToPath.delete(ino);
      this.pathToIno.delete(path);
    }
    parentNode.children.delete(name);
  }

  async rename(
    parent: number,
    name: string,
    newparent: number,
    newname: string,
    _flags: number
  ): Promise<void> {
    const oldParentNode = this.getNode(parent);
    if (!oldParentNode?.children) throw new Error('Source not found');
    const node = oldParentNode.children.get(name);
    if (!node) throw new Error('Source not found');

    const newParentNode = this.getNode(newparent);
    if (!newParentNode?.children) throw new Error('Destination not found');

    const oldPath = this.pathFromParent(parent, name);
    const newPath = this.pathFromParent(newparent, newname);

    newParentNode.children.set(newname, node);
    oldParentNode.children.delete(name);

    // Update path mappings
    const ino = node.stat.ino;
    this.inoToPath.set(ino, newPath);
    this.pathToIno.delete(oldPath);
    this.pathToIno.set(newPath, ino);
  }

  async setattr(ino: number, length: number): Promise<void> {
    const node = this.getNode(ino);
    if (!node) throw new Error('File not found');
    if (node.content) {
      node.content = Buffer.from(node.content.subarray(0, length));
      node.stat.size = length;
      node.stat.mtime = Math.floor(Date.now() / 1000);
    }
  }

  async release(ino: number, fh: number): Promise<void> {
    const handles = this.openFiles.get(ino);
    if (!handles) return;
    handles.delete(fh);
    if (handles.size === 0) {
      this.openFiles.delete(ino);
    }
  }

  // Directory operations
  async opendir(ino: number, flags: number): Promise<number> {
    return this.open(ino, flags);
  }

  async releasedir(ino: number, fh: number): Promise<void> {
    return this.release(ino, fh);
  }

  async fsyncdir(_ino: number, _fh: number, _datasync: number): Promise<void> {
    // No-op for memory filesystem
  }

  // File operations
  async flush(_ino: number, _fh: number): Promise<void> {
    // No-op for memory filesystem
  }

  async fsync(_ino: number, _fh: number, _datasync: number): Promise<void> {
    // No-op for memory filesystem
  }

  // Create operations
  async mknod(parent: number, name: string, mode: number, _rdev: number): Promise<FileStat> {
    // For regular files, use create
    return this.create(parent, name, mode, 0);
  }

  // Link operations
  async link(ino: number, newparent: number, newname: string): Promise<FileStat> {
    const node = this.getNode(ino);
    if (!node) throw new Error('Source not found');
    const newParentNode = this.getNode(newparent);
    if (!newParentNode?.children) throw new Error('Destination not found');

    newParentNode.children.set(newname, node);
    const newPath = this.pathFromParent(newparent, newname);
    this.setNode(ino, node, newPath);
    return { ...node.stat };
  }

  async symlink(link: string, parent: number, name: string): Promise<FileStat> {
    // Memory filesystem doesn't support symlinks - create a regular file with link content
    const stat = await this.create(parent, name, 0o120644, 0);
    const node = this.getNode(stat.ino);
    if (node) {
      node.content = Buffer.from(link);
      node.stat.size = link.length;
    }
    return stat;
  }

  async readlink(ino: number): Promise<string> {
    const node = this.getNode(ino);
    if (!node?.content) throw new Error('Not a symlink');
    return node.content.toString('utf8');
  }

  // Extended attributes
  async setxattr(
    _ino: number,
    _name: string,
    _value: Buffer,
    _size: number,
    _flags: number
  ): Promise<void> {
    throw new Error('Extended attributes not supported');
  }

  async getxattr(_ino: number, _name: string, _size: number): Promise<Buffer | number> {
    throw new Error('Extended attributes not supported');
  }

  async listxattr(_ino: number, size: number): Promise<Buffer | number> {
    if (size === 0) return 0;
    return Buffer.alloc(0);
  }

  async removexattr(_ino: number, _name: string): Promise<void> {
    throw new Error('Extended attributes not supported');
  }

  // Other operations
  async access(_ino: number, _mask: number): Promise<void> {
    // Always allow access in memory filesystem
  }

  async statfs(_ino: number): Promise<Statfs> {
    return {
      bsize: 4096,
      blocks: 1000000,
      bfree: 1000000,
      bavail: 1000000,
      files: 1000000,
      ffree: 1000000,
    };
  }

  // Locking
  async getlk(_ino: number, _fh: number): Promise<Flock> {
    throw new Error('File locking not supported');
  }

  async setlk(_ino: number, _fh: number, _sleep: number): Promise<void> {
    throw new Error('File locking not supported');
  }

  async flock(_ino: number, _fh: number, _op: number): Promise<void> {
    throw new Error('File locking not supported');
  }

  // Advanced operations
  async bmap(_ino: number, _blocksize: number, _idx: number): Promise<number> {
    throw new Error('Block mapping not supported');
  }

  async ioctl(
    _ino: number,
    _cmd: number,
    _in_buf: Buffer | null,
    _in_bufsz: number,
    _out_bufsz: number
  ): Promise<{ result: number; out_buf?: Buffer }> {
    throw new Error('IOCTL not supported');
  }

  async poll(_ino: number, _fh: number): Promise<number> {
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
    const node = handles.get(fh);
    if (!node) throw new Error('File handle not found');

    if (!node.content) node.content = Buffer.alloc(0);
    const newSize = Math.max(node.content.length, offset + length);
    const newContent = Buffer.alloc(newSize);
    node.content.copy(newContent);
    node.content = newContent;
    node.stat.size = newSize;
  }

  async readdirplus(ino: number, size: number, off: number): Promise<DirEntry[]> {
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
    const inNode = this.getNode(ino_in);
    const outNode = this.getNode(ino_out);
    if (!inNode?.content || !outNode) throw new Error('Invalid nodes');

    if (!outNode.content) outNode.content = Buffer.alloc(0);
    const available = inNode.content.length - off_in;
    const toCopy = Math.min(len, available);
    if (toCopy > 0) {
      const newSize = Math.max(outNode.content.length, off_out + toCopy);
      const newContent = Buffer.alloc(newSize);
      outNode.content.copy(newContent);
      inNode.content.copy(newContent, off_out, off_in, off_in + toCopy);
      outNode.content = newContent;
      outNode.stat.size = newSize;
    }
    return toCopy;
  }

  async lseek(ino: number, _fh: number, _off: number, _whence: number): Promise<number> {
    const node = this.getNode(ino);
    if (!node) throw new Error('File not found');
    return node.content?.length || 0;
  }

  async tmpfile(parent: number, mode: number, flags: number): Promise<FileStat> {
    const name = `.tmp.${Date.now()}.${Math.random().toString(36).substring(7)}`;
    return this.create(parent, name, mode, flags);
  }
}
