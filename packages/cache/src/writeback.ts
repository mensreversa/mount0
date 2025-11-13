import { BaseCacheConfig, BaseCacheProvider } from './base';

export type WriteBackCacheConfig = BaseCacheConfig;

export class WriteBackCacheProvider extends BaseCacheProvider {
  constructor(config: WriteBackCacheConfig) {
    super(config);
  }

  async write(
    ino: number,
    fh: number,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number> {
    const slaveIno = this.getSlaveIno(ino);
    await this.slave.write(slaveIno, fh, buffer, offset, length);
    const masterIno = this.getMasterIno(ino);
    this.master.write(masterIno, fh, buffer, offset, length).catch(() => {});
    return length;
  }
}
