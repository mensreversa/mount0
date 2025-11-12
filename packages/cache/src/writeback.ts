import { FileHandle } from '@mount0/core';
import { BaseCacheConfig, BaseCacheProvider } from './base';

export type WriteBackCacheConfig = BaseCacheConfig;

export class WriteBackCacheProvider extends BaseCacheProvider {
  constructor(config: WriteBackCacheConfig) {
    super(config);
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    // Write-back: write to slave first, then asynchronously to master
    await this.slave.write(handle, buffer, offset, length);
    this.master.write(handle, buffer, offset, length).catch(() => {});
    return length;
  }
}
