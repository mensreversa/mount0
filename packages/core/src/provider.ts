import { DirEntry, FileStat } from "./types";

export interface Statfs {
  bsize: number;
  blocks: number;
  bfree: number;
  bavail: number;
  files: number;
  ffree: number;
}

export interface Flock {
  type: number;
  whence: number;
  start: number;
  len: number;
  pid: number;
}

export interface FilesystemProvider {
  // Lifecycle operations
  init?(): Promise<void>;
  destroy?(): Promise<void>;
  forget?(ino: number, nlookup: number): Promise<void>;
  forget_multi?(forgets: Array<{ ino: number; nlookup: number }>): Promise<void>;

  // Core operations
  lookup(parent: number, name: string): Promise<FileStat | null>;
  getattr(ino: number): Promise<FileStat | null>;
  setattr(ino: number, to_set: number, attr: FileStat): Promise<void>;

  // Directory operations
  readdir(ino: number, size: number, off: number): Promise<DirEntry[]>;
  opendir(ino: number, flags: number): Promise<number>;
  releasedir(ino: number, fh: number): Promise<void>;
  fsyncdir(ino: number, fh: number, datasync: number): Promise<void>;

  // File operations
  open(ino: number, flags: number, mode?: number): Promise<number>;
  read(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number>;
  write(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number>;
  write_buf?(ino: number, fh: number, buffer: Buffer, off: number, size: number): Promise<number>;
  flush(ino: number, fh: number): Promise<void>;
  fsync(ino: number, fh: number, datasync: number): Promise<void>;
  release(ino: number, fh: number): Promise<void>;

  // Create operations
  create(parent: number, name: string, mode: number, flags: number): Promise<FileStat>;
  mknod(parent: number, name: string, mode: number, rdev: number): Promise<FileStat>;
  mkdir(parent: number, name: string, mode: number): Promise<FileStat>;

  // Remove operations
  unlink(parent: number, name: string): Promise<void>;
  rmdir(parent: number, name: string): Promise<void>;

  // Link operations
  link(ino: number, newparent: number, newname: string): Promise<FileStat>;
  symlink(link: string, parent: number, name: string): Promise<FileStat>;
  readlink(ino: number): Promise<string>;

  // Rename
  rename(parent: number, name: string, newparent: number, newname: string, flags: number): Promise<void>;

  // Extended attributes
  setxattr(ino: number, name: string, value: Buffer, size: number, flags: number): Promise<void>;
  getxattr(ino: number, name: string, size: number): Promise<Buffer | number>;
  listxattr(ino: number, size: number): Promise<Buffer | number>;
  removexattr(ino: number, name: string): Promise<void>;

  // Other operations
  access(ino: number, mask: number): Promise<void>;
  statfs(ino: number): Promise<Statfs>;

  // Locking
  getlk(ino: number, fh: number): Promise<Flock>;
  setlk(ino: number, fh: number, sleep: number): Promise<void>;
  flock(ino: number, fh: number, op: number): Promise<void>;

  // Advanced operations
  bmap(ino: number, blocksize: number, idx: number): Promise<number>;
  ioctl(ino: number, cmd: number, in_buf: Buffer | null, in_bufsz: number, out_bufsz: number): Promise<{ result: number; out_buf?: Buffer }>;
  poll(ino: number, fh: number): Promise<number>;
  fallocate(ino: number, fh: number, offset: number, length: number, mode: number): Promise<void>;
  readdirplus(ino: number, size: number, off: number): Promise<DirEntry[]>;
  retrieve_reply?(ino: number, cookie: number, offset: number, buffer: Buffer): Promise<void>;
  statx?(ino: number, flags: number, mask: number): Promise<FileStat | null>;
  copy_file_range(ino_in: number, off_in: number, ino_out: number, off_out: number, len: number, flags: number): Promise<number>;
  lseek(ino: number, fh: number, off: number, whence: number): Promise<number>;
  tmpfile(parent: number, mode: number, flags: number): Promise<FileStat>;
}
