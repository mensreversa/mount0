import { DirEntry, FileHandle, FileStat } from './types';

export interface FilesystemProvider {
  getattr(path: string): Promise<FileStat | null>;
  readdir(path: string): Promise<DirEntry[]>;
  open(path: string, flags: number, mode?: number): Promise<FileHandle>;
  read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number>;
  write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number>;
  create(path: string, mode: number): Promise<FileHandle>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, mode: number): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(oldpath: string, newpath: string): Promise<void>;
  truncate(path: string, length: number): Promise<void>;
  close(handle: FileHandle): Promise<void>;
}
