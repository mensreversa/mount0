export interface FileStat {
  mode: number;
  size: number;
  mtime: number;
  ctime: number;
  atime: number;
  uid: number;
  gid: number;
  dev: number;
  ino: number;
  nlink: number;
  rdev: number;
  blksize: number;
  blocks: number;
}

export interface DirEntry {
  name: string;
  mode: number;
  ino: number;
}

export interface FileHandle {
  fd: number;
  path: string;
  flags: number;
}
