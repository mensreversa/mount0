import { createRequire } from 'module';
import { FileSystem } from './filesystem';

const requireNative = createRequire(import.meta.url);
const mount0_fuse = requireNative('../build/Release/mount0_fuse.node');

export class FuseBridge {
  private fs: FileSystem;
  private mounted: boolean = false;

  constructor(fs: FileSystem) {
    this.fs = fs;
  }

  async mount(mountpoint: string, options: Record<string, string> = {}): Promise<void> {
    if (this.mounted) throw new Error('Already mounted');

    const handler = async (id: number, params: Record<string, any>) => {
      const op = params.op;
      if (process.env.MOUNT0_DEBUG === '1') console.log(`[${op}]`, params);

      try {
        await this.handleOperation(id, op, params);
      } catch (err: any) {
        const errnoMap: Record<string, number> = {
          ENOENT: 2,
          EIO: 5,
          EACCES: 13,
          EEXIST: 17,
          ENOTDIR: 20,
          EISDIR: 21,
          EINVAL: 22,
          ENOSPC: 28,
        };
        const errno = err.errno || (err.code && errnoMap[err.code]) || 5;
        mount0_fuse.reply_err(id, errno);
      }
    };

    await mount0_fuse.mount(mountpoint, { allow_other: '0', ...options }, handler);
    this.mounted = true;
  }

  async unmount(): Promise<void> {
    if (!this.mounted) return;
    mount0_fuse.unmount();
    this.mounted = false;
  }

  private async handleOperation(
    id: number,
    op: string,
    params: Record<string, any>
  ): Promise<void> {
    switch (op) {
      case 'lookup': {
        const stat = await this.fs.getattr(params.path);
        if (!stat) throw { code: 'ENOENT', errno: 2 };
        mount0_fuse.reply_lookup(id, stat);
        break;
      }

      case 'getattr': {
        const stat = await this.fs.getattr(params.path);
        if (!stat) throw { code: 'ENOENT', errno: 2 };
        mount0_fuse.reply_getattr(id, stat);
        break;
      }

      case 'readdir': {
        const entries = await this.fs.readdir(params.path);
        mount0_fuse.reply_readdir(
          id,
          entries.map((e) => e.name)
        );
        break;
      }

      case 'open': {
        await this.fs.open(params.path, params.flags);
        mount0_fuse.reply_open(id, 0);
        break;
      }

      case 'read': {
        const handle = { path: params.path, fd: 0, flags: 0 };
        const buf = Buffer.alloc(params.size);
        const bytesRead = await this.fs.read(handle, buf, params.offset, params.size);
        mount0_fuse.reply_read(id, buf.subarray(0, bytesRead).toString('binary'));
        break;
      }

      case 'write': {
        const handle = { path: params.path, fd: 0, flags: 0 };
        const buf = Buffer.from(params.data, 'binary');
        const bytesWritten = await this.fs.write(handle, buf, params.offset, params.size);
        mount0_fuse.reply_write(id, bytesWritten);
        break;
      }

      case 'create': {
        await this.fs.create(params.path, params.mode);
        mount0_fuse.reply_create(id, 0);
        break;
      }

      case 'unlink': {
        await this.fs.unlink(params.path);
        mount0_fuse.reply_unlink(id, 0);
        break;
      }

      case 'mkdir': {
        await this.fs.mkdir(params.path, params.mode);
        mount0_fuse.reply_mkdir(id, 0);
        break;
      }

      case 'rmdir': {
        await this.fs.rmdir(params.path);
        mount0_fuse.reply_rmdir(id, 0);
        break;
      }

      case 'rename': {
        await this.fs.rename(params.oldpath, params.newpath);
        mount0_fuse.reply_rename(id, 0);
        break;
      }

      case 'truncate': {
        await this.fs.truncate(params.path, params.length);
        mount0_fuse.reply_truncate(id, 0);
        break;
      }

      default:
        throw new Error(`Unknown operation: ${op}`);
    }
  }
}
