import { createRequire } from 'module';
import * as v8 from 'v8';
import { FileSystem } from './filesystem';
import { FileStat } from './types';

const requireNative = createRequire(import.meta.url);
const mount0_fuse = requireNative('../build/Release/mount0_fuse.node');

export class FuseBridge {
  private fs: FileSystem;
  private fuseHandle: any;
  private mounted: boolean = false;

  constructor(fs: FileSystem) {
    this.fs = fs;
  }

  async mount(mountpoint: string, options: Record<string, string> = {}): Promise<void> {
    if (this.mounted) {
      throw new Error('Already mounted');
    }

    const defaultOptions: Record<string, string> = {
      allow_other: '0',
    };

    const mergedOptions = { ...defaultOptions, ...options };

    this.fuseHandle = mount0_fuse.init(mountpoint, mergedOptions, (op: string, ...args: any[]) => {
      return this.handleOperationSync(op, ...args);
    });

    this.mounted = true;
  }

  private handleOperationSync(op: string, ...args: any[]): any {
    const result = this.handleOperation(op, ...args);

    if (result instanceof Promise) {
      let syncResult: any = null;
      let syncError: any = null;
      let done = false;

      result.then(
        (val) => {
          syncResult = val;
          done = true;
        },
        (err) => {
          syncError = err;
          done = true;
        }
      );

      while (!done) {
        (v8 as any).runMicrotasks();
        if (!done) {
          process.nextTick(() => {});
          if (typeof setImmediate !== 'undefined') {
            setImmediate(() => {});
          }
        }
      }

      if (syncError) {
        return -5;
      }

      return syncResult;
    }

    return result;
  }

  async loop(): Promise<void> {
    if (!this.mounted) {
      throw new Error('Not mounted');
    }
    mount0_fuse.loop(this.fuseHandle);
  }

  async unmount(): Promise<void> {
    if (!this.mounted) {
      return;
    }
    mount0_fuse.unmount(this.fuseHandle);
    this.mounted = false;
  }

  private async handleOperation(op: string, ...args: any[]): Promise<any> {
    try {
      switch (op) {
        case 'getattr': {
          const [path] = args;
          const stat = await this.fs.getattr(path);
          if (!stat) {
            return { stat: null };
          }
          return { stat: this.statToArray(stat) };
        }

        case 'readdir': {
          const [path] = args;
          const entries = await this.fs.readdir(path);
          return entries.map((e) => ({
            name: e.name,
            mode: e.mode,
            ino: e.ino,
          }));
        }

        case 'open': {
          const [path, flags] = args;
          const handle = await this.fs.open(path, flags);
          return { fd: handle.fd };
        }

        case 'read': {
          const [path, , offset, length] = args;
          const handle = { path, fd: 0, flags: 0 };
          const resultBuffer = Buffer.alloc(length);
          const bytesRead = await this.fs.read(handle, resultBuffer, offset, length);
          return resultBuffer.subarray(0, bytesRead);
        }

        case 'write': {
          const [path, buffer, offset, length] = args;
          const handle = { path, fd: 0, flags: 0 };
          const writeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
          const bytesWritten = await this.fs.write(handle, writeBuffer, offset, length);
          return bytesWritten;
        }

        case 'create': {
          const [path, mode] = args;
          const handle = await this.fs.create(path, mode);
          return { fd: handle.fd };
        }

        case 'unlink': {
          const [path] = args;
          await this.fs.unlink(path);
          return 0;
        }

        case 'mkdir': {
          const [path, mode] = args;
          await this.fs.mkdir(path, mode);
          return 0;
        }

        case 'rmdir': {
          const [path] = args;
          await this.fs.rmdir(path);
          return 0;
        }

        case 'rename': {
          const [oldpath, newpath] = args;
          await this.fs.rename(oldpath, newpath);
          return 0;
        }

        case 'truncate': {
          const [path, length] = args;
          await this.fs.truncate(path, length);
          return 0;
        }

        default:
          return -38;
      }
    } catch (err: any) {
      console.error(`Operation ${op} error:`, err);
      return -err.errno || -5;
    }
  }

  private statToArray(stat: FileStat): number[] {
    return [
      stat.mode,
      stat.ino,
      stat.dev,
      stat.nlink,
      stat.uid,
      stat.gid,
      stat.rdev,
      stat.size,
      stat.atime,
      stat.mtime,
      stat.ctime,
      stat.blksize,
      stat.blocks,
    ];
  }
}
