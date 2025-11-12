import { FileHandle, FilesystemProvider } from '@mount0/core';
import { BaseRaidProvider } from './base';

export interface Raid6Config {
  providers: FilesystemProvider[];
  stripeSize?: number;
}

export class Raid6Provider extends BaseRaidProvider {
  private dataProviders: number;

  constructor(config: Raid6Config) {
    super(config.providers, config.stripeSize);
    if (this.providers.length < 4) {
      throw new Error('RAID 6 requires at least 4 providers');
    }
    this.dataProviders = this.providers.length - 2;
  }

  async open(path: string, flags: number, mode?: number): Promise<FileHandle> {
    const handle = await super.open(path, flags, mode);
    const info = this.openHandles.get(handle.fd);
    if (info && info.handles.length < this.dataProviders) {
      throw new Error(
        `RAID 6 requires at least ${this.dataProviders} providers, got ${info.handles.length}`
      );
    }
    return handle;
  }

  private getProviderIndex(stripeIndex: number): number {
    return stripeIndex % this.dataProviders;
  }

  private getParityIndices(stripeIndex: number): [number, number] {
    const stripeGroup = Math.floor(stripeIndex / this.dataProviders);
    const baseParity = this.dataProviders + (stripeGroup % 2);
    return [baseParity % this.providers.length, (baseParity + 1) % this.providers.length];
  }

  private calculateParity(data: Buffer[]): Buffer {
    if (data.length === 0) return Buffer.alloc(this.stripeSize);
    const parity = Buffer.from(data[0]);
    for (let i = 1; i < data.length; i++) {
      for (let j = 0; j < parity.length && j < data[i].length; j++) {
        parity[j] ^= data[i][j];
      }
    }
    return parity;
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const info = this.getFileInfo(handle.fd);
    for (let i = 0; i < this.dataProviders && i < info.handles.length; i++) {
      try {
        return await this.providers[i].read(info.handles[i], buffer, offset, length);
      } catch {
        continue;
      }
    }
    throw new Error('RAID 6: Insufficient providers for read');
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const info = this.getFileInfo(handle.fd);
    const stripeIndex = Math.floor(offset / this.stripeSize);
    const stripeOffset = offset % this.stripeSize;
    const stripeData = buffer.slice(0, Math.min(length, this.stripeSize - stripeOffset));

    const dataIndex = this.getProviderIndex(stripeIndex);
    await this.providers[dataIndex].write(
      info.handles[dataIndex],
      stripeData,
      stripeOffset,
      stripeData.length
    );

    const stripeGroup = Math.floor(stripeIndex / this.dataProviders);
    const stripeStart = stripeGroup * this.dataProviders;
    const dataBlocks: Buffer[] = [];

    for (let i = 0; i < this.dataProviders; i++) {
      const blockStripeIndex = stripeStart + i;
      if (blockStripeIndex === stripeIndex) {
        dataBlocks.push(stripeData);
      } else {
        const existingData = Buffer.alloc(this.stripeSize);
        try {
          const blockProviderIndex = this.getProviderIndex(blockStripeIndex);
          await this.providers[blockProviderIndex].read(
            info.handles[blockProviderIndex],
            existingData,
            stripeOffset,
            this.stripeSize
          );
          dataBlocks.push(existingData);
        } catch {
          dataBlocks.push(Buffer.alloc(this.stripeSize));
        }
      }
    }

    const parity1 = this.calculateParity(dataBlocks);
    const parity2 = this.calculateParity([...dataBlocks, parity1]);
    const [parity1Index, parity2Index] = this.getParityIndices(stripeIndex);
    await Promise.all([
      this.providers[parity1Index].write(
        info.handles[parity1Index],
        parity1,
        stripeOffset,
        parity1.length
      ),
      this.providers[parity2Index].write(
        info.handles[parity2Index],
        parity2,
        stripeOffset,
        parity2.length
      ),
    ]);

    return stripeData.length;
  }

  async unlink(path: string): Promise<void> {
    const results = await Promise.allSettled(this.providers.map((p) => p.unlink(path)));
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(`Failed to unlink on ${failures.length} providers`);
    }
  }
}
