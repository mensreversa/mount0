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
  private debug: boolean;

  constructor(fs: FileSystem) {
    this.fs = fs;
    this.debug = process.env.MOUNT0_DEBUG === '1';
  }

  private debugLog(...args: any[]): void {
    if (this.debug) {
      console.log('[FuseBridge]', ...args);
    }
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
    this.debugLog(`[${op}] called with args:`, JSON.stringify(args, (key, value) => {
      if (value instanceof Buffer) {
        return `<Buffer ${value.length} bytes>`;
      }
      return value;
    }));

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
        // Map Node.js error codes to errno values (same as in handleOperation)
        const errnoMap: Record<string, number> = {
          ENOENT: 2,    // No such file or directory
          EIO: 5,       // Input/output error
          EACCES: 13,   // Permission denied
          EEXIST: 17,   // File exists
          ENOTDIR: 20,  // Not a directory
          EISDIR: 21,   // Is a directory
          EINVAL: 22,   // Invalid argument
          ENOSPC: 28,   // No space left on device
        };
        const errno = syncError.errno || (syncError.code && errnoMap[syncError.code]) || 5;
        this.debugLog(`[${op}] failed (sync):`, {
          error: syncError.message || syncError,
          code: syncError.code,
          errno: syncError.errno,
          mappedErrno: errno,
          stack: syncError.stack
        });
        console.error(`Operation ${op} failed (sync):`, syncError.message || syncError, `(errno: ${errno})`);
        return -errno;
      }

      this.debugLog(`[${op}] success (sync):`, this.formatResult(syncResult));
      return syncResult;
    }

    this.debugLog(`[${op}] success (sync, non-promise):`, this.formatResult(result));
    return result;
  }

  private formatResult(result: any): any {
    if (result instanceof Buffer) {
      return `<Buffer ${result.length} bytes>`;
    }
    if (typeof result === 'object' && result !== null) {
      if (Array.isArray(result)) {
        return `[Array ${result.length} items]`;
      }
      if (result.stat && Array.isArray(result.stat)) {
        return `{ stat: [Array ${result.stat.length} items] }`;
      }
      return JSON.stringify(result, (key, value) => {
        if (value instanceof Buffer) {
          return `<Buffer ${value.length} bytes>`;
        }
        return value;
      });
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
          this.debugLog(`[${op}] getattr(${path})`);
          const stat = await this.fs.getattr(path);
          if (!stat) {
            this.debugLog(`[${op}] path not found: ${path}`);
            return { stat: null };
          }
          this.debugLog(`[${op}] found:`, { mode: stat.mode, size: stat.size, ino: stat.ino });
          return { stat: this.statToArray(stat) };
        }

        case 'readdir': {
          const [path] = args;
          this.debugLog(`[${op}] readdir(${path})`);
          const entries = await this.fs.readdir(path);
          this.debugLog(`[${op}] found ${entries.length} entries`);
          return entries.map((e) => ({
            name: e.name,
            mode: e.mode,
            ino: e.ino,
          }));
        }

        case 'open': {
          const [path, flags] = args;
          this.debugLog(`[${op}] open(${path}, flags=${flags})`);
          await this.fs.open(path, flags);
          this.debugLog(`[${op}] opened successfully`);
          return 0;
        }

        case 'read': {
          const [path, , offset, length] = args;
          this.debugLog(`[${op}] read(${path}, offset=${offset}, length=${length})`);
          const handle = { path, fd: 0, flags: 0 };
          const resultBuffer = Buffer.alloc(length);
          const bytesRead = await this.fs.read(handle, resultBuffer, offset, length);
          this.debugLog(`[${op}] read ${bytesRead} bytes`);
          return resultBuffer.subarray(0, bytesRead);
        }

        case 'write': {
          const [path, buffer, offset, length] = args;
          this.debugLog(`[${op}] write(${path}, offset=${offset}, length=${length})`);
          const handle = { path, fd: 0, flags: 0 };
          const writeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
          const bytesWritten = await this.fs.write(handle, writeBuffer, offset, length);
          this.debugLog(`[${op}] wrote ${bytesWritten} bytes`);
          return bytesWritten;
        }

        case 'create': {
          const [path, mode] = args;
          this.debugLog(`[${op}] create(${path}, mode=${mode.toString(8)})`);
          await this.fs.create(path, mode);
          this.debugLog(`[${op}] created successfully`);
          return 0;
        }

        case 'unlink': {
          const [path] = args;
          this.debugLog(`[${op}] unlink(${path})`);
          await this.fs.unlink(path);
          this.debugLog(`[${op}] unlinked successfully`);
          return 0;
        }

        case 'mkdir': {
          const [path, mode] = args;
          this.debugLog(`[${op}] mkdir(${path}, mode=${mode.toString(8)})`);
          await this.fs.mkdir(path, mode);
          this.debugLog(`[${op}] created directory successfully`);
          return 0;
        }

        case 'rmdir': {
          const [path] = args;
          this.debugLog(`[${op}] rmdir(${path})`);
          await this.fs.rmdir(path);
          this.debugLog(`[${op}] removed directory successfully`);
          return 0;
        }

        case 'rename': {
          const [oldpath, newpath] = args;
          this.debugLog(`[${op}] rename(${oldpath} -> ${newpath})`);
          await this.fs.rename(oldpath, newpath);
          this.debugLog(`[${op}] renamed successfully`);
          return 0;
        }

        case 'truncate': {
          const [path, length] = args;
          this.debugLog(`[${op}] truncate(${path}, length=${length})`);
          await this.fs.truncate(path, length);
          this.debugLog(`[${op}] truncated successfully`);
          return 0;
        }

        default:
          this.debugLog(`[${op}] unknown operation`);
          return -38;
      }
    } catch (err: any) {
      // Map Node.js error codes to errno values
      const errnoMap: Record<string, number> = {
        ENOENT: 2,    // No such file or directory
        EIO: 5,       // Input/output error
        EACCES: 13,   // Permission denied
        EEXIST: 17,   // File exists
        ENOTDIR: 20,  // Not a directory
        EISDIR: 21,   // Is a directory
        EINVAL: 22,   // Invalid argument
        ENOSPC: 28,   // No space left on device
      };
      
      const errno = err.errno || (err.code && errnoMap[err.code]) || 5; // Default to EIO
      this.debugLog(`[${op}] failed:`, {
        error: err.message || err,
        code: err.code,
        errno: err.errno,
        mappedErrno: errno,
        stack: err.stack
      });
      console.error(`Operation ${op} failed:`, err.message || err, `(errno: ${errno})`);
      return -errno;
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
