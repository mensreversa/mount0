import { FileHandle, FilesystemProvider } from '@mount0/core';
import { BaseRaidProvider } from './base';

export interface Raid0Config {
  providers: FilesystemProvider[];
  stripeSize?: number;
}

export class Raid0Provider extends BaseRaidProvider {
  constructor(config: Raid0Config) {
    super(config.providers, config.stripeSize);
  }

  async mkdir(path: string, mode: number): Promise<void> {
    await this.providers[0].mkdir(path, mode);
  }

  async rmdir(path: string): Promise<void> {
    await this.providers[0].rmdir(path);
  }

  async rename(oldpath: string, newpath: string): Promise<void> {
    await this.providers[0].rename(oldpath, newpath);
  }

  async truncate(path: string, length: number): Promise<void> {
    await this.providers[0].truncate(path, length);
  }

  private getProviderIndex(stripeIndex: number): number {
    return stripeIndex % this.providers.length;
  }

  async read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const info = this.getFileInfo(handle.fd);
    let bytesRead = 0;
    let currentOffset = offset;
    const totalRead = Math.min(length, buffer.length);

    while (bytesRead < totalRead) {
      const stripeIndex = Math.floor(currentOffset / this.stripeSize);
      const stripeOffset = currentOffset % this.stripeSize;
      const remaining = totalRead - bytesRead;
      const toRead = Math.min(remaining, this.stripeSize - stripeOffset);

      const providerIndex = this.getProviderIndex(stripeIndex);
      const stripeData = Buffer.alloc(toRead);
      await this.providers[providerIndex].read(
        info.handles[providerIndex],
        stripeData,
        stripeOffset,
        toRead
      );
      stripeData.copy(buffer, bytesRead);

      bytesRead += toRead;
      currentOffset += toRead;
    }

    return bytesRead;
  }

  async write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number> {
    const info = this.getFileInfo(handle.fd);
    let bytesWritten = 0;
    let currentOffset = offset;

    while (bytesWritten < length) {
      const stripeIndex = Math.floor(currentOffset / this.stripeSize);
      const stripeOffset = currentOffset % this.stripeSize;
      const remaining = length - bytesWritten;
      const toWrite = Math.min(remaining, this.stripeSize - stripeOffset);

      const providerIndex = this.getProviderIndex(stripeIndex);
      const stripeData = buffer.slice(bytesWritten, bytesWritten + toWrite);
      await this.providers[providerIndex].write(
        info.handles[providerIndex],
        stripeData,
        stripeOffset,
        toWrite
      );

      bytesWritten += toWrite;
      currentOffset += toWrite;
    }

    return bytesWritten;
  }

  async unlink(path: string): Promise<void> {
    const results = await Promise.allSettled(this.providers.map((p) => p.unlink(path)));
    if (!results.some((r) => r.status === 'fulfilled')) {
      throw new Error('Failed to unlink on all providers');
    }
  }
}
