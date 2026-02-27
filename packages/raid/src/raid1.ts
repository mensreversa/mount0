import { FileStat, FilesystemProvider } from "@mount0/core";
import { BaseRaidProvider } from "./base";

export interface Raid1Config {
  providers: FilesystemProvider[];
}

export class Raid1Provider extends BaseRaidProvider {
  constructor(config: Raid1Config) {
    super(config.providers);
  }

  async create(parent: number, name: string, mode: number, flags: number): Promise<{ stat: FileStat; fh: number }> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error("Parent not found");

    const stats: FileStat[] = [];
    const providerFhs: number[] = [];

    for (let i = 0; i < this.providers.length && i < providerInos.length; i++) {
      try {
        const result = await this.providers[i].create(providerInos[i], name, mode, flags);
        stats.push(result.stat);
        providerFhs.push(result.fh);
      } catch (error) {
        if (stats.length === 0) throw error;
      }
    }

    if (stats.length === 0) {
      throw new Error("Failed to create file on any provider");
    }

    const raidIno = this.nextIno++;
    const newProviderInos = stats.map((s) => s.ino);
    this.setProviderInos(raidIno, newProviderInos);

    const fh = this.nextFh++;
    if (!this.openFiles.has(raidIno)) {
      this.openFiles.set(raidIno, new Map());
    }
    this.openFiles.get(raidIno)!.set(fh, providerFhs);

    return { stat: { ...stats[0], ino: raidIno }, fh };
  }

  async read(ino: number, fh: number, buffer: Buffer, offset: number, length: number): Promise<number> {
    const providerFhs = this.getProviderFhs(ino, fh);
    const providerInos = this.getProviderInos(ino);
    for (let i = 0; i < providerFhs.length && i < providerInos.length; i++) {
      try {
        return await this.providers[i].read(providerInos[i], providerFhs[i], buffer, offset, length);
      } catch {
        continue;
      }
    }
    throw new Error("All providers failed to read");
  }

  async write(ino: number, fh: number, buffer: Buffer, offset: number, length: number): Promise<number> {
    const providerFhs = this.getProviderFhs(ino, fh);
    const providerInos = this.getProviderInos(ino);
    await Promise.all(
      providerFhs.map((pfh, i) => {
        if (providerInos[i]) {
          return this.providers[i].write(providerInos[i], pfh, buffer, offset, length);
        }
      })
    );
    return length;
  }

  async unlink(parent: number, name: string): Promise<void> {
    const providerInos = this.getProviderInos(parent);
    if (providerInos.length === 0) throw new Error("Parent not found");
    const results = await Promise.allSettled(
      this.providers.map((p, i) => {
        if (providerInos[i]) {
          return p.unlink(providerInos[i], name);
        }
      })
    );
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      throw new Error(`Failed to unlink on ${failures.length} providers`);
    }
  }
}
