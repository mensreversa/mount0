import { DirEntry, FileHandle, FileStat, FilesystemProvider } from '@mount0/core';

export interface SambaConfig {
  host: string;
  share: string;
  username?: string;
  password?: string;
}

export class SambaProvider implements FilesystemProvider {
  private config: SambaConfig;

  constructor(config: SambaConfig) {
    this.config = config;
  }

  async getattr(_path: string): Promise<FileStat | null> {
    throw new Error('SambaProvider not implemented');
  }

  async readdir(_path: string): Promise<DirEntry[]> {
    throw new Error('SambaProvider not implemented');
  }

  async open(_path: string, _flags: number, _mode?: number): Promise<FileHandle> {
    throw new Error('SambaProvider not implemented');
  }

  async read(
    _handle: FileHandle,
    _buffer: Buffer,
    _offset: number,
    _length: number
  ): Promise<number> {
    throw new Error('SambaProvider not implemented');
  }

  async write(
    _handle: FileHandle,
    _buffer: Buffer,
    _offset: number,
    _length: number
  ): Promise<number> {
    throw new Error('SambaProvider not implemented');
  }

  async create(_path: string, _mode: number): Promise<FileHandle> {
    throw new Error('SambaProvider not implemented');
  }

  async unlink(_path: string): Promise<void> {
    throw new Error('SambaProvider not implemented');
  }

  async mkdir(_path: string, _mode: number): Promise<void> {
    throw new Error('SambaProvider not implemented');
  }

  async rmdir(_path: string): Promise<void> {
    throw new Error('SambaProvider not implemented');
  }

  async rename(_oldpath: string, _newpath: string): Promise<void> {
    throw new Error('SambaProvider not implemented');
  }

  async truncate(_path: string, _length: number): Promise<void> {
    throw new Error('SambaProvider not implemented');
  }

  async close(_handle: FileHandle): Promise<void> {
    throw new Error('SambaProvider not implemented');
  }
}
