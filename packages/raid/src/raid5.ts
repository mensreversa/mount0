import { FilesystemProvider } from '@mount0/core';
import { BaseRaidProvider } from './base';

export interface Raid5Config {
  providers: FilesystemProvider[];
  stripeSize?: number;
}

export class Raid5Provider extends BaseRaidProvider {
  private dataProviders: number;

  constructor(config: Raid5Config) {
    super(config.providers, config.stripeSize);
    if (this.providers.length < 3) {
      throw new Error('RAID 5 requires at least 3 providers');
    }
    this.dataProviders = this.providers.length - 1;
  }

  private getProviderIndex(stripeIndex: number): number {
    return stripeIndex % this.dataProviders;
  }

  private getParityIndex(stripeIndex: number): number {
    const stripeGroup = Math.floor(stripeIndex / this.dataProviders);
    return (stripeGroup * this.dataProviders + this.dataProviders) % this.providers.length;
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

  async read(
    ino: number,
    fh: number,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number> {
    const providerFhs = this.getProviderFhs(ino, fh);
    const providerInos = this.getProviderInos(ino);
    for (
      let i = 0;
      i < this.dataProviders && i < providerFhs.length && i < providerInos.length;
      i++
    ) {
      try {
        return await this.providers[i].read(
          providerInos[i],
          providerFhs[i],
          buffer,
          offset,
          length
        );
      } catch {
        continue;
      }
    }
    throw new Error('RAID 5: Insufficient providers for read');
  }

  async write(
    ino: number,
    fh: number,
    buffer: Buffer,
    offset: number,
    length: number
  ): Promise<number> {
    const providerFhs = this.getProviderFhs(ino, fh);
    const providerInos = this.getProviderInos(ino);
    const stripeIndex = Math.floor(offset / this.stripeSize);
    const stripeOffset = offset % this.stripeSize;
    const stripeData = buffer.subarray(0, Math.min(length, this.stripeSize - stripeOffset));

    const dataIndex = this.getProviderIndex(stripeIndex);
    if (dataIndex >= providerFhs.length || dataIndex >= providerInos.length) {
      throw new Error('Invalid provider index');
    }

    await this.providers[dataIndex].write(
      providerInos[dataIndex],
      providerFhs[dataIndex],
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
          if (blockProviderIndex < providerInos.length && blockProviderIndex < providerFhs.length) {
            await this.providers[blockProviderIndex].read(
              providerInos[blockProviderIndex],
              providerFhs[blockProviderIndex],
              existingData,
              stripeOffset,
              this.stripeSize
            );
            dataBlocks.push(existingData);
          } else {
            dataBlocks.push(Buffer.alloc(this.stripeSize));
          }
        } catch {
          dataBlocks.push(Buffer.alloc(this.stripeSize));
        }
      }
    }

    const parity = this.calculateParity(dataBlocks);
    const parityIndex = this.getParityIndex(stripeIndex);
    if (parityIndex < providerInos.length && parityIndex < providerFhs.length) {
      await this.providers[parityIndex].write(
        providerInos[parityIndex],
        providerFhs[parityIndex],
        parity,
        stripeOffset,
        parity.length
      );
    }

    return stripeData.length;
  }

  async unlink(parent: number, name: string): Promise<void> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error('Parent not found');
    const results = await Promise.allSettled(
      this.providers.map((p, i) => {
        if (providerInos[i]) {
          return p.unlink(providerInos[i], name);
        }
      })
    );
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      throw new Error(`Failed to unlink on ${failures.length} providers`);
    }
  }
}
