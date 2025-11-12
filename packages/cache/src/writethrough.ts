import { FileHandle } from '@mount0/core';
import { BaseCacheConfig, BaseCacheProvider } from './base';

export type WriteThroughCacheConfig = BaseCacheConfig;

export class WriteThroughCacheProvider extends BaseCacheProvider {
  constructor(config: WriteThroughCacheConfig) {
    super(config);
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    // Write-through: write to both master and slave simultaneously
    await Promise.all([
      this.master.write(handle, buffer, offset, length),
      this.slave.write(handle, buffer, offset, length).catch(() => {}),
    ]);
    return length;
  }
}
