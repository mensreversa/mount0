import { DirEntry, FileStat, FilesystemProvider, Flock, Statfs } from "@mount0/core";

export interface BaseCacheConfig {
  master: FilesystemProvider;
  slave: FilesystemProvider;
}

export abstract class BaseCacheProvider implements FilesystemProvider {
  protected master: FilesystemProvider;
  protected slave: FilesystemProvider;
  private inoToMasterIno: Map<number, number> = new Map();
  private inoToSlaveIno: Map<number, number> = new Map();
  private masterInoToIno: Map<number, number> = new Map();
  private slaveInoToIno: Map<number, number> = new Map();
  private nextIno: number = 2;

  constructor(config: BaseCacheConfig) {
    this.master = config.master;
    this.slave = config.slave;
  }

  protected getMasterIno(ino: number): number {
    return this.inoToMasterIno.get(ino) || ino;
  }

  protected getSlaveIno(ino: number): number {
    return this.inoToSlaveIno.get(ino) || ino;
  }

  private setInoMapping(ino: number, masterIno: number, slaveIno?: number): void {
    this.inoToMasterIno.set(ino, masterIno);
    this.masterInoToIno.set(masterIno, ino);
    if (slaveIno !== undefined) {
      this.inoToSlaveIno.set(ino, slaveIno);
      this.slaveInoToIno.set(slaveIno, ino);
    }
  }

  async lookup(parent: number, name: string): Promise<FileStat | null> {
    const masterParent = this.getMasterIno(parent);
    const slaveParent = this.getSlaveIno(parent);
    const slaveStat = await this.slave.lookup(slaveParent, name);
    if (slaveStat) {
      const ino = this.nextIno++;
      const masterStat = await this.master.lookup(masterParent, name);
      this.setInoMapping(ino, masterStat?.ino || slaveStat.ino, slaveStat.ino);
      return { ...slaveStat, ino };
    }
    const masterStat = await this.master.lookup(masterParent, name);
    if (masterStat) {
      const ino = this.nextIno++;
      this.setInoMapping(ino, masterStat.ino);
      return { ...masterStat, ino };
    }
    return null;
  }

  async getattr(ino: number, fh: number): Promise<FileStat | null> {
    if (ino === 1) {
      const stat = await this.slave.getattr(1, fh);
      return stat || this.master.getattr(1, fh);
    }
    const slaveIno = this.getSlaveIno(ino);
    const stat = await this.slave.getattr(slaveIno, fh);
    if (stat) {
      this.setInoMapping(ino, this.getMasterIno(ino), stat.ino);
      return { ...stat, ino };
    }
    const masterIno = this.getMasterIno(ino);
    const masterStat = await this.master.getattr(masterIno, fh);
    if (masterStat) {
      this.setInoMapping(ino, masterStat.ino);
      return { ...masterStat, ino };
    }
    return null;
  }

  async setattr(ino: number, fh: number, to_set: number, attr: FileStat): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    await this.master.setattr(masterIno, fh, to_set, attr);
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.setattr(slaveIno, fh, to_set, attr);
    } catch {
      // Ignore slave errors
    }
  }

  async readdir(ino: number, fh: number, size: number, offset: number): Promise<DirEntry[]> {
    const slaveIno = this.getSlaveIno(ino);
    const entries = await this.slave.readdir(slaveIno, fh, size, offset);
    if (entries.length > 0) {
      return entries.map((entry) => {
        const ino = this.nextIno++;
        this.setInoMapping(ino, entry.ino, entry.ino);
        return { ...entry, ino };
      });
    }
    const masterIno = this.getMasterIno(ino);
    const masterEntries = await this.master.readdir(masterIno, fh, size, offset);
    return masterEntries.map((entry) => {
      const ino = this.nextIno++;
      this.setInoMapping(ino, entry.ino);
      return { ...entry, ino };
    });
  }

  async opendir(ino: number, flags: number): Promise<number> {
    const slaveIno = this.getSlaveIno(ino);
    try {
      return await this.slave.opendir(slaveIno, flags);
    } catch {
      const masterIno = this.getMasterIno(ino);
      return await this.master.opendir(masterIno, flags);
    }
  }

  async releasedir(ino: number, fh: number): Promise<void> {
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.releasedir(slaveIno, fh);
    } catch {
      // Ignore
    }
    const masterIno = this.getMasterIno(ino);
    try {
      await this.master.releasedir(masterIno, fh);
    } catch {
      // Ignore
    }
  }

  async fsyncdir(ino: number, fh: number, datasync: number): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    await this.master.fsyncdir(masterIno, fh, datasync);
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.fsyncdir(slaveIno, fh, datasync);
    } catch {
      // Ignore
    }
  }

  async open(ino: number, flags: number, mode?: number): Promise<number> {
    const slaveIno = this.getSlaveIno(ino);
    try {
      return await this.slave.open(slaveIno, flags, mode);
    } catch {
      const masterIno = this.getMasterIno(ino);
      return await this.master.open(masterIno, flags, mode);
    }
  }

  async read(ino: number, fh: number, buffer: Buffer, offset: number, length: number): Promise<number> {
    const slaveIno = this.getSlaveIno(ino);
    try {
      return await this.slave.read(slaveIno, fh, buffer, offset, length);
    } catch {
      const masterIno = this.getMasterIno(ino);
      return await this.master.read(masterIno, fh, buffer, offset, length);
    }
  }

  async create(parent: number, name: string, mode: number, flags: number): Promise<{ stat: FileStat; fh: number }> {
    const masterParent = this.getMasterIno(parent);
    const masterResult = await this.master.create(masterParent, name, mode, flags);
    const ino = this.nextIno++;
    this.setInoMapping(ino, masterResult.stat.ino);
    try {
      const slaveParent = this.getSlaveIno(parent);
      const slaveResult = await this.slave.create(slaveParent, name, mode, flags);
      this.setInoMapping(ino, masterResult.stat.ino, slaveResult.stat.ino);
    } catch {
      // Ignore slave errors
    }
    return { stat: { ...masterResult.stat, ino }, fh: masterResult.fh };
  }

  async mknod(parent: number, name: string, mode: number, rdev: number): Promise<FileStat> {
    const masterParent = this.getMasterIno(parent);
    const stat = await this.master.mknod(masterParent, name, mode, rdev);
    const ino = this.nextIno++;
    this.setInoMapping(ino, stat.ino);
    try {
      const slaveParent = this.getSlaveIno(parent);
      await this.slave.mknod(slaveParent, name, mode, rdev);
    } catch {
      // Ignore slave errors
    }
    return { ...stat, ino };
  }

  async mkdir(parent: number, name: string, mode: number): Promise<FileStat> {
    const masterParent = this.getMasterIno(parent);
    const stat = await this.master.mkdir(masterParent, name, mode);
    const ino = this.nextIno++;
    this.setInoMapping(ino, stat.ino);
    try {
      const slaveParent = this.getSlaveIno(parent);
      await this.slave.mkdir(slaveParent, name, mode);
    } catch {
      // Ignore slave errors
    }
    return { ...stat, ino };
  }

  async unlink(parent: number, name: string): Promise<void> {
    const masterParent = this.getMasterIno(parent);
    await this.master.unlink(masterParent, name);
    try {
      const slaveParent = this.getSlaveIno(parent);
      await this.slave.unlink(slaveParent, name);
    } catch {
      // Ignore slave errors
    }
  }

  async rmdir(parent: number, name: string): Promise<void> {
    const masterParent = this.getMasterIno(parent);
    await this.master.rmdir(masterParent, name);
    try {
      const slaveParent = this.getSlaveIno(parent);
      await this.slave.rmdir(slaveParent, name);
    } catch {
      // Ignore slave errors
    }
  }

  async rename(parent: number, name: string, newparent: number, newname: string, flags: number): Promise<void> {
    const masterParent = this.getMasterIno(parent);
    const masterNewParent = this.getMasterIno(newparent);
    await this.master.rename(masterParent, name, masterNewParent, newname, flags);
    try {
      const slaveParent = this.getSlaveIno(parent);
      const slaveNewParent = this.getSlaveIno(newparent);
      await this.slave.rename(slaveParent, name, slaveNewParent, newname, flags);
    } catch {
      // Ignore slave errors
    }
  }

  async link(ino: number, newparent: number, newname: string): Promise<FileStat> {
    const masterIno = this.getMasterIno(ino);
    const masterNewParent = this.getMasterIno(newparent);
    const stat = await this.master.link(masterIno, masterNewParent, newname);
    const newIno = this.nextIno++;
    this.setInoMapping(newIno, stat.ino);
    return { ...stat, ino: newIno };
  }

  async symlink(link: string, parent: number, name: string): Promise<FileStat> {
    const masterParent = this.getMasterIno(parent);
    const stat = await this.master.symlink(link, masterParent, name);
    const ino = this.nextIno++;
    this.setInoMapping(ino, stat.ino);
    try {
      const slaveParent = this.getSlaveIno(parent);
      await this.slave.symlink(link, slaveParent, name);
    } catch {
      // Ignore slave errors
    }
    return { ...stat, ino };
  }

  async readlink(ino: number): Promise<string> {
    const slaveIno = this.getSlaveIno(ino);
    try {
      return await this.slave.readlink(slaveIno);
    } catch {
      const masterIno = this.getMasterIno(ino);
      return await this.master.readlink(masterIno);
    }
  }

  async setxattr(ino: number, name: string, value: Buffer, size: number, flags: number): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    await this.master.setxattr(masterIno, name, value, size, flags);
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.setxattr(slaveIno, name, value, size, flags);
    } catch {
      // Ignore
    }
  }

  async getxattr(ino: number, name: string, size: number): Promise<Buffer | number> {
    const slaveIno = this.getSlaveIno(ino);
    try {
      return await this.slave.getxattr(slaveIno, name, size);
    } catch {
      const masterIno = this.getMasterIno(ino);
      return await this.master.getxattr(masterIno, name, size);
    }
  }

  async listxattr(ino: number, size: number): Promise<Buffer | number> {
    const slaveIno = this.getSlaveIno(ino);
    try {
      return await this.slave.listxattr(slaveIno, size);
    } catch {
      const masterIno = this.getMasterIno(ino);
      return await this.master.listxattr(masterIno, size);
    }
  }

  async removexattr(ino: number, name: string): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    await this.master.removexattr(masterIno, name);
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.removexattr(slaveIno, name);
    } catch {
      // Ignore
    }
  }

  async access(ino: number, mask: number): Promise<void> {
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.access(slaveIno, mask);
      return;
    } catch {
      const masterIno = this.getMasterIno(ino);
      await this.master.access(masterIno, mask);
    }
  }

  async statfs(ino: number, fh: number): Promise<Statfs> {
    const masterIno = this.getMasterIno(ino);
    return this.master.statfs(masterIno, fh);
  }

  async getlk(ino: number, fh: number, lock: Flock): Promise<Flock> {
    const masterIno = this.getMasterIno(ino);
    return this.master.getlk(masterIno, fh, lock);
  }

  async setlk(ino: number, fh: number, lock: Flock, sleep: number): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    return this.master.setlk(masterIno, fh, lock, sleep);
  }

  async flock(ino: number, fh: number, op: number): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    return this.master.flock(masterIno, fh, op);
  }

  async bmap(ino: number, blocksize: number, idx: number): Promise<number> {
    const masterIno = this.getMasterIno(ino);
    return this.master.bmap(masterIno, blocksize, idx);
  }

  async ioctl(ino: number, fh: number, cmd: number, in_buf: Buffer | null, in_bufsz: number, out_bufsz: number, flags: number): Promise<{ result: number; out_buf?: Buffer }> {
    const masterIno = this.getMasterIno(ino);
    return this.master.ioctl(masterIno, fh, cmd, in_buf, in_bufsz, out_bufsz, flags);
  }

  async poll(ino: number, fh: number): Promise<number> {
    const masterIno = this.getMasterIno(ino);
    return this.master.poll(masterIno, fh);
  }

  async fallocate(ino: number, fh: number, offset: number, length: number, mode: number): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    await this.master.fallocate(masterIno, fh, offset, length, mode);
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.fallocate(slaveIno, fh, offset, length, mode);
    } catch {
      // Ignore
    }
  }

  async readdirplus(ino: number, fh: number, size: number, offset: number): Promise<DirEntry[]> {
    return this.readdir(ino, fh, size, offset);
  }

  async copy_file_range(ino_in: number, fh_in: number, off_in: number, ino_out: number, fh_out: number, off_out: number, len: number, flags: number): Promise<number> {
    const masterInoIn = this.getMasterIno(ino_in);
    const masterInoOut = this.getMasterIno(ino_out);
    return this.master.copy_file_range(masterInoIn, fh_in, off_in, masterInoOut, fh_out, off_out, len, flags);
  }

  async lseek(ino: number, fh: number, off: number, whence: number): Promise<number> {
    const masterIno = this.getMasterIno(ino);
    return this.master.lseek(masterIno, fh, off, whence);
  }

  async tmpfile(parent: number, mode: number, flags: number): Promise<{ stat: FileStat; fh: number }> {
    const masterParent = this.getMasterIno(parent);
    const result = await this.master.tmpfile(masterParent, mode, flags);
    const ino = this.nextIno++;
    this.setInoMapping(ino, result.stat.ino);
    return { stat: { ...result.stat, ino }, fh: result.fh };
  }

  async flush(ino: number, fh: number): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    await this.master.flush(masterIno, fh);
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.flush(slaveIno, fh);
    } catch {
      // Ignore
    }
  }

  async fsync(ino: number, fh: number, datasync: number): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    await this.master.fsync(masterIno, fh, datasync);
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.fsync(slaveIno, fh, datasync);
    } catch {
      // Ignore
    }
  }

  async release(ino: number, fh: number): Promise<void> {
    const masterIno = this.getMasterIno(ino);
    try {
      await this.master.release(masterIno, fh);
    } catch {
      // Ignore
    }
    const slaveIno = this.getSlaveIno(ino);
    try {
      await this.slave.release(slaveIno, fh);
    } catch {
      // Ignore
    }
  }

  abstract write(ino: number, fh: number, buffer: Buffer, offset: number, length: number): Promise<number>;
}
