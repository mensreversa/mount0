import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';

export interface S3Config {
  bucket: string;
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export class S3Provider implements FilesystemProvider {
  private config: S3Config;

  constructor(config: S3Config) {
    this.config = {
      region: 'us-east-1',
      ...config,
    };
  }

  async getattr(_path: string): Promise<FileStat | null> {
    throw new Error('S3Provider not implemented');
  }

  async readdir(_path: string): Promise<DirEntry[]> {
    throw new Error('S3Provider not implemented');
  }

  async open(_path: string, _flags: number, _mode?: number): Promise<FileHandle> {
    throw new Error('S3Provider not implemented');
  }

  async read(
    _handle: FileHandle,
    _buffer: Buffer,
    _offset: number,
    _length: number
  ): Promise<number> {
    throw new Error('S3Provider not implemented');
  }

  async write(
    _handle: FileHandle,
    _buffer: Buffer,
    _offset: number,
    _length: number
  ): Promise<number> {
    throw new Error('S3Provider not implemented');
  }

  async create(_path: string, _mode: number): Promise<FileHandle> {
    throw new Error('S3Provider not implemented');
  }

  async unlink(_path: string): Promise<void> {
    throw new Error('S3Provider not implemented');
  }

  async mkdir(_path: string, _mode: number): Promise<void> {
    throw new Error('S3Provider not implemented');
  }

  async rmdir(_path: string): Promise<void> {
    throw new Error('S3Provider not implemented');
  }

  async rename(_oldpath: string, _newpath: string): Promise<void> {
    throw new Error('S3Provider not implemented');
  }

  async truncate(_path: string, _length: number): Promise<void> {
    throw new Error('S3Provider not implemented');
  }

  async close(_handle: FileHandle): Promise<void> {
    throw new Error('S3Provider not implemented');
  }
}
