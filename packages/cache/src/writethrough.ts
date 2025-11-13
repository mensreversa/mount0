import { BaseCacheConfig, BaseCacheProvider } from './base';

export type WriteThroughCacheConfig = BaseCacheConfig;

export class WriteThroughCacheProvider extends BaseCacheProvider {
  constructor(config: WriteThroughCacheConfig) {
    super(config);
  }

  async write(
    ino: number,
    fh: number,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number> {
    const masterIno = this.getMasterIno(ino);
    const slaveIno = this.getSlaveIno(ino);
    await Promise.all([
      this.master.write(masterIno, fh, buffer, offset, length),
      this.slave.write(slaveIno, fh, buffer, offset, length).catch(() => {}),
    ]);
    return length;
  }
}
