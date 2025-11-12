import { createRequire } from 'module';
import { FileSystem } from './filesystem';
import { FileStat } from './types';

const requireNative = createRequire(import.meta.url);
const mount0_fuse = requireNative('../build/Release/mount0_fuse.node');

export class FuseBridge {
  private fs: FileSystem;
  private fuseHandle: any;
  private mounted: boolean = false;
  private debug: boolean;
  private pendingRequests: Map<number, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();

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

    // Set up the handler for async operations
    const handler = async (id: number, op: string, params: Record<string, any>) => {
      try {
        const result = await this.handleOperation(op, params);
        mount0_fuse.resolve(id, result);
      } catch (err: any) {
        const errnoMap: Record<string, number> = {
          ENOENT: 2, EIO: 5, EACCES: 13, EEXIST: 17,
          ENOTDIR: 20, EISDIR: 21, EINVAL: 22, ENOSPC: 28,
        };
        const errno = err.errno || (err.code && errnoMap[err.code]) || 5;
        mount0_fuse.resolve(id, `-${errno}`);
      }
    };

    await mount0_fuse.mount(mountpoint, mergedOptions, handler);
    this.mounted = true;
  }

  async loop(): Promise<void> {
    if (!this.mounted) {
      throw new Error('Not mounted');
    }
    // Loop is handled by the native worker thread
  }

  async unmount(): Promise<void> {
    if (!this.mounted) {
      return;
    }
    mount0_fuse.unmount(this.fuseHandle);
    this.mounted = false;
  }

  private async handleOperation(op: string, params: Record<string, any>): Promise<string> {
    try {
      switch (op) {
        case 'lookup':
        case 'getattr': {
          const path = params.path;
          this.debugLog(`[${op}] ${op}(${path})`);
          const stat = await this.fs.getattr(path);
          if (!stat) {
            this.debugLog(`[${op}] path not found: ${path}`);
            return 'ENOENT';
          }
          this.debugLog(`[${op}] found:`, { mode: stat.mode, size: stat.size, ino: stat.ino });
          const statArr = this.statToArray(stat);
          return statArr.join(',');
        }

        case 'readdir': {
          const path = params.path;
          this.debugLog(`[${op}] readdir(${path})`);
          const entries = await this.fs.readdir(path);
          this.debugLog(`[${op}] found ${entries.length} entries`);
          return entries.map(e => e.name).join(',');
        }

        case 'open': {
          const path = params.path;
          const flags = typeof params.flags === 'number' ? params.flags : parseInt(params.flags || '0');
          this.debugLog(`[${op}] open(${path}, flags=${flags})`);
          await this.fs.open(path, flags);
          this.debugLog(`[${op}] opened successfully`);
          return '0';
        }

        case 'read': {
          const path = params.path;
          const offset = typeof params.offset === 'number' ? params.offset : parseInt(params.offset || '0');
          const size = typeof params.size === 'number' ? params.size : parseInt(params.size || '0');
          this.debugLog(`[${op}] read(${path}, offset=${offset}, length=${size})`);
          const handle = { path, fd: 0, flags: 0 };
          const resultBuffer = Buffer.alloc(size);
          const bytesRead = await this.fs.read(handle, resultBuffer, offset, size);
          this.debugLog(`[${op}] read ${bytesRead} bytes`);
          return resultBuffer.subarray(0, bytesRead).toString('binary');
        }

        case 'write': {
          const path = params.path;
          const data = params.data;
          const offset = typeof params.offset === 'number' ? params.offset : parseInt(params.offset || '0');
          const size = typeof params.size === 'number' ? params.size : parseInt(params.size || '0');
          this.debugLog(`[${op}] write(${path}, offset=${offset}, length=${size})`);
          const handle = { path, fd: 0, flags: 0 };
          const writeBuffer = Buffer.from(data, 'binary');
          const bytesWritten = await this.fs.write(handle, writeBuffer, offset, size);
          this.debugLog(`[${op}] wrote ${bytesWritten} bytes`);
          return bytesWritten.toString();
        }

        case 'create': {
          const path = params.path;
          const mode = typeof params.mode === 'number' ? params.mode : parseInt(params.mode || '0');
          this.debugLog(`[${op}] create(${path}, mode=${mode.toString(8)})`);
          await this.fs.create(path, mode);
          this.debugLog(`[${op}] created successfully`);
          return '0';
        }

        case 'unlink': {
          const path = params.path;
          this.debugLog(`[${op}] unlink(${path})`);
          await this.fs.unlink(path);
          this.debugLog(`[${op}] unlinked successfully`);
          return '0';
        }

        case 'mkdir': {
          const path = params.path;
          const mode = typeof params.mode === 'number' ? params.mode : parseInt(params.mode || '0');
          this.debugLog(`[${op}] mkdir(${path}, mode=${mode.toString(8)})`);
          await this.fs.mkdir(path, mode);
          this.debugLog(`[${op}] created directory successfully`);
          return '0';
        }

        case 'rmdir': {
          const path = params.path;
          this.debugLog(`[${op}] rmdir(${path})`);
          await this.fs.rmdir(path);
          this.debugLog(`[${op}] removed directory successfully`);
          return '0';
        }

        case 'rename': {
          const oldpath = params.oldpath;
          const newpath = params.newpath;
          this.debugLog(`[${op}] rename(${oldpath} -> ${newpath})`);
          await this.fs.rename(oldpath, newpath);
          this.debugLog(`[${op}] renamed successfully`);
          return '0';
        }

        case 'truncate': {
          const path = params.path;
          const length = typeof params.length === 'number' ? params.length : parseInt(params.length || '0');
          this.debugLog(`[${op}] truncate(${path}, length=${length})`);
          await this.fs.truncate(path, length);
          this.debugLog(`[${op}] truncated successfully`);
          return '0';
        }

        default:
          this.debugLog(`[${op}] unknown operation`);
          return '-38';
      }
    } catch (err: any) {
      const errnoMap: Record<string, number> = {
        ENOENT: 2, EIO: 5, EACCES: 13, EEXIST: 17,
        ENOTDIR: 20, EISDIR: 21, EINVAL: 22, ENOSPC: 28,
      };
      const errno = err.errno || (err.code && errnoMap[err.code]) || 5;
      this.debugLog(`[${op}] failed:`, {
        error: err.message || err,
        code: err.code,
        errno: err.errno,
        mappedErrno: errno,
        stack: err.stack
      });
      console.error(`Operation ${op} failed:`, err.message || err, `(errno: ${errno})`);
      return `-${errno}`;
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
