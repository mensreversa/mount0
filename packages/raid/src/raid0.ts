import { FileStat, FilesystemProvider } from '@mount0/core';
import { BaseRaidProvider } from './base';

export interface Raid0Config {
  providers: FilesystemProvider[];
  stripeSize?: number;
}

export class Raid0Provider extends BaseRaidProvider {
  constructor(config: Raid0Config) {
    super(config.providers, config.stripeSize);
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error('Parent not found');
    return this.providers[0].mkdir(providerInos[0], name, mode);
  }

  async rmdir(parent: number, name: string): Promise<void> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error('Parent not found');
    return this.providers[0].rmdir(providerInos[0], name);
  }

  async rename(
    parent: number,
    name: string,
    newparent: number,
    newname: string,
    flags: number
  ): Promise<void> {
    const providerInos = this.getProviderInos(parent);
    const newProviderInos = this.getProviderInos(newparent);
    if (providerInos.length === 0 || newProviderInos.length === 0) {
      throw new Error('Source or destination not found');
    }
    return this.providers[0].rename(providerInos[0], name, newProviderInos[0], newname, flags);
  }

  private getProviderIndex(stripeIndex: number): number {
    return stripeIndex % this.providers.length;
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
    let bytesRead = 0;
    let currentOffset = offset;
    const totalRead = Math.min(length, buffer.length);

    while (bytesRead < totalRead) {
      const stripeIndex = Math.floor(currentOffset / this.stripeSize);
      const stripeOffset = currentOffset % this.stripeSize;
      const remaining = totalRead - bytesRead;
      const toRead = Math.min(remaining, this.stripeSize - stripeOffset);

      const providerIndex = this.getProviderIndex(stripeIndex);
      if (providerIndex >= providerFhs.length || providerIndex >= providerInos.length) {
        break;
      }

      const stripeData = Buffer.alloc(toRead);
      const read = await this.providers[providerIndex].read(
        providerInos[providerIndex],
        providerFhs[providerIndex],
        stripeData,
        stripeOffset,
        toRead
      );
      stripeData.copy(buffer, bytesRead, 0, read);

      bytesRead += read;
      currentOffset += read;
      if (read < toRead) break;
    }

    return bytesRead;
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
    let bytesWritten = 0;
    let currentOffset = offset;

    while (bytesWritten < length) {
      const stripeIndex = Math.floor(currentOffset / this.stripeSize);
      const stripeOffset = currentOffset % this.stripeSize;
      const remaining = length - bytesWritten;
      const toWrite = Math.min(remaining, this.stripeSize - stripeOffset);

      const providerIndex = this.getProviderIndex(stripeIndex);
      if (providerIndex >= providerFhs.length || providerIndex >= providerInos.length) {
        break;
      }

      const stripeData = buffer.subarray(bytesWritten, bytesWritten + toWrite);
      await this.providers[providerIndex].write(
        providerInos[providerIndex],
        providerFhs[providerIndex],
        stripeData,
        stripeOffset,
        toWrite
      );

      bytesWritten += toWrite;
      currentOffset += toWrite;
    }

    return bytesWritten;
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
    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Error('Failed to unlink on all providers');
    }
  }
}
