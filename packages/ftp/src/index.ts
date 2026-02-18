import { DirEntry, FileStat, FilesystemProvider, Flock, Statfs } from "@mount0/core";

export interface FtpConfig {
  host: string;
  port?: number;
  username?: string;
  password?: string;
}

export class FtpProvider implements FilesystemProvider {
  private config: FtpConfig;

  constructor(config: FtpConfig) {
    this.config = {
      port: 21,
      ...config,
    };
  }

  async lookup(_parent: number, _name: string): Promise<FileStat | null> {
    throw new Error("FtpProvider not implemented");
  }

  async getattr(_ino: number): Promise<FileStat | null> {
    throw new Error("FtpProvider not implemented");
  }

  async setattr(_ino: number, _to_set: number, _attr: FileStat): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async readdir(_ino: number, _size: number, _off: number): Promise<DirEntry[]> {
    throw new Error("FtpProvider not implemented");
  }

  async opendir(_ino: number, _flags: number): Promise<number> {
    throw new Error("FtpProvider not implemented");
  }

  async releasedir(_ino: number, _fh: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async fsyncdir(_ino: number, _fh: number, _datasync: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async open(_ino: number, _flags: number, _mode?: number): Promise<number> {
    throw new Error("FtpProvider not implemented");
  }

  async read(_ino: number, _fh: number, _buffer: Buffer, _off: number, _length: number): Promise<number> {
    throw new Error("FtpProvider not implemented");
  }

  async write(_ino: number, _fh: number, _buffer: Buffer, _off: number, _length: number): Promise<number> {
    throw new Error("FtpProvider not implemented");
  }

  async flush(_ino: number, _fh: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async fsync(_ino: number, _fh: number, _datasync: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async release(_ino: number, _fh: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async create(_parent: number, _name: string, _mode: number, _flags: number): Promise<FileStat> {
    throw new Error("FtpProvider not implemented");
  }

  async mknod(_parent: number, _name: string, _mode: number, _rdev: number): Promise<FileStat> {
    throw new Error("FtpProvider not implemented");
  }

  async mkdir(_parent: number, _name: string, _mode: number): Promise<FileStat> {
    throw new Error("FtpProvider not implemented");
  }

  async unlink(_parent: number, _name: string): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async rmdir(_parent: number, _name: string): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async link(_ino: number, _newparent: number, _newname: string): Promise<FileStat> {
    throw new Error("FtpProvider not implemented");
  }

  async symlink(_link: string, _parent: number, _name: string): Promise<FileStat> {
    throw new Error("FtpProvider not implemented");
  }

  async readlink(_ino: number): Promise<string> {
    throw new Error("FtpProvider not implemented");
  }

  async rename(_parent: number, _name: string, _newparent: number, _newname: string, _flags: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async setxattr(_ino: number, _name: string, _value: Buffer, _size: number, _flags: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async getxattr(_ino: number, _name: string, _size: number): Promise<Buffer | number> {
    throw new Error("FtpProvider not implemented");
  }

  async listxattr(_ino: number, _size: number): Promise<Buffer | number> {
    throw new Error("FtpProvider not implemented");
  }

  async removexattr(_ino: number, _name: string): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async access(_ino: number, _mask: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async statfs(_ino: number): Promise<Statfs> {
    throw new Error("FtpProvider not implemented");
  }

  async getlk(_ino: number, _fh: number): Promise<Flock> {
    throw new Error("FtpProvider not implemented");
  }

  async setlk(_ino: number, _fh: number, _sleep: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async flock(_ino: number, _fh: number, _op: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async bmap(_ino: number, _blocksize: number, _idx: number): Promise<number> {
    throw new Error("FtpProvider not implemented");
  }

  async ioctl(_ino: number, _cmd: number, _in_buf: Buffer | null, _in_bufsz: number, _out_bufsz: number): Promise<{ result: number; out_buf?: Buffer }> {
    throw new Error("FtpProvider not implemented");
  }

  async poll(_ino: number, _fh: number): Promise<number> {
    throw new Error("FtpProvider not implemented");
  }

  async fallocate(_ino: number, _fh: number, _off: number, _to_set: number, _mode: number): Promise<void> {
    throw new Error("FtpProvider not implemented");
  }

  async readdirplus(_ino: number, _size: number, _off: number): Promise<DirEntry[]> {
    throw new Error("FtpProvider not implemented");
  }

  async copy_file_range(_ino_in: number, _off_in: number, _ino_out: number, _off_out: number, _len: number, _flags: number): Promise<number> {
    throw new Error("FtpProvider not implemented");
  }

  async lseek(_ino: number, _fh: number, _off: number, _whence: number): Promise<number> {
    throw new Error("FtpProvider not implemented");
  }

  async tmpfile(_parent: number, _mode: number, _flags: number): Promise<FileStat> {
    throw new Error("FtpProvider not implemented");
  }
}
