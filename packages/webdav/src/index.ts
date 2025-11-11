import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';

export interface WebdavConfig {
  url: string;
  username?: string;
  password?: string;
}

export class WebdavProvider implements FilesystemProvider {
  private config: WebdavConfig;

  constructor(config: WebdavConfig) {
    this.config = config;
  }

  async getattr(_path: string): Promise<FileStat | null> {
    throw new Error('WebdavProvider not implemented');
  }

  async readdir(_path: string): Promise<DirEntry[]> {
    throw new Error('WebdavProvider not implemented');
  }

  async open(_path: string, _flags: number, _mode?: number): Promise<FileHandle> {
    throw new Error('WebdavProvider not implemented');
  }

  async read(
    _handle: FileHandle,
    _buffer: Buffer,
    _offset: number,
    _length: number
  ): Promise<number> {
    throw new Error('WebdavProvider not implemented');
  }

  async write(
    _handle: FileHandle,
    _buffer: Buffer,
    _offset: number,
    _length: number
  ): Promise<number> {
    throw new Error('WebdavProvider not implemented');
  }

  async create(_path: string, _mode: number): Promise<FileHandle> {
    throw new Error('WebdavProvider not implemented');
  }

  async unlink(_path: string): Promise<void> {
    throw new Error('WebdavProvider not implemented');
  }

  async mkdir(_path: string, _mode: number): Promise<void> {
    throw new Error('WebdavProvider not implemented');
  }

  async rmdir(_path: string): Promise<void> {
    throw new Error('WebdavProvider not implemented');
  }

  async rename(_oldpath: string, _newpath: string): Promise<void> {
    throw new Error('WebdavProvider not implemented');
  }

  async truncate(_path: string, _length: number): Promise<void> {
    throw new Error('WebdavProvider not implemented');
  }

  async close(_handle: FileHandle): Promise<void> {
    throw new Error('WebdavProvider not implemented');
  }
}
