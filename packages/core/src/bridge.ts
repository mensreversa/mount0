import { createRequire } from 'module';
import { FilesystemProvider } from './provider';

const requireNative = createRequire(import.meta.url);
const mount0_fuse = requireNative('../build/Release/mount0_fuse.node');

export class FuseBridge {
  private provider: FilesystemProvider;
  private mounted: boolean = false;

  constructor(provider: FilesystemProvider) {
    this.provider = provider;
  }

  async mount(mountpoint: string, options: Record<string, string> = {}): Promise<void> {
    if (this.mounted) throw new Error('Already mounted');

    const handler = async (reqPtr: number, params: Record<string, any>) => {
      try {
        await this.handleOperation(reqPtr, params);
      } catch (err: any) {
        // Based on FUSE reference implementations, fuse_reply_err expects positive errno values
        // (like the C errno variable). We should pass positive values.
        let errno: number;
        if (err.errno !== undefined && err.errno !== null) {
          // err.errno might be positive (like 5 for EIO) or negative, convert to positive
          errno = err.errno < 0 ? -err.errno : err.errno > 0 ? err.errno : 5;
        } else if (err.code === 'ENOENT') {
          errno = 2; // ENOENT
        } else if (err.code === 'ENODATA' || err.code === 'ENOATTR') {
          errno = 61; // ENODATA (No data available)
        } else if (err.code === 'EIO') {
          errno = 5; // EIO
        } else if (err.code === 'ENOSYS') {
          errno = 38; // ENOSYS (Function not implemented)
        } else if (
          err.message &&
          (err.message.includes('not supported') || err.message.includes('not implemented'))
        ) {
          errno = 38; // ENOSYS for unsupported operations
        } else {
          errno = 5; // Default to EIO
        }
        if (process.env.MOUNT0_DEBUG === '1') {
          const op = params?.op || 'unknown';
          const errMsg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err));
          console.error(
            `[FUSE:error] op=${op}, err=${errMsg}, errno=${err.errno}, code=${err.code}, final_errno=${errno}`
          );
        }
        mount0_fuse.reply_err(reqPtr, errno);
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

  private async handleOperation(reqPtr: number, params: Record<string, any>): Promise<void> {
    // reqPtr can be 0 for operations like init/destroy that don't have a request
    // params should always be defined
    if (!params) {
      throw new Error('params is undefined');
    }
    const op = params.op;

    // For init and destroy, there's no request to reply to
    if (op === 'init' || op === 'destroy') {
      if (op === 'init' && this.provider.init) {
        await this.provider.init();
      } else if (op === 'destroy' && this.provider.destroy) {
        await this.provider.destroy();
      }
      return; // No reply needed for init/destroy
    }

    switch (op) {
      // Lifecycle operations (init and destroy are handled above)

      case 'forget': {
        if (this.provider.forget) {
          await this.provider.forget(params.ino, params.nlookup);
        }
        mount0_fuse.reply_none(reqPtr);
        break;
      }

      case 'forget_multi': {
        if (this.provider.forget_multi) {
          const forgets: Array<{ ino: number; nlookup: number }> = [];
          const inos = params.inos || [];
          const nlookups = params.nlookups || [];
          for (let i = 0; i < params.count && i < inos.length && i < nlookups.length; i++) {
            forgets.push({ ino: inos[i], nlookup: nlookups[i] });
          }
          await this.provider.forget_multi(forgets);
        }
        mount0_fuse.reply_none(reqPtr);
        break;
      }

      case 'retrieve_reply': {
        if (this.provider.retrieve_reply) {
          const buf = Buffer.from(params.data || '', 'binary');
          await this.provider.retrieve_reply(params.ino, params.cookie, params.offset, buf);
        }
        mount0_fuse.reply_none(reqPtr);
        break;
      }

      // Core operations
      case 'lookup': {
        const stat = await this.provider.lookup(params.parent, params.name);
        if (!stat) throw { code: 'ENOENT', errno: -2 };
        mount0_fuse.reply_lookup(reqPtr, stat);
        break;
      }

      case 'getattr': {
        const stat = await this.provider.getattr(params.ino);
        if (!stat) throw { code: 'ENOENT', errno: -2 };
        mount0_fuse.reply_getattr(reqPtr, stat);
        break;
      }

      case 'setattr': {
        await this.provider.setattr(params.ino, params.to_set, params.attr);
        mount0_fuse.reply_getattr(reqPtr, await this.provider.getattr(params.ino));
        break;
      }

      // Directory operations
      case 'readdir': {
        const entries = await this.provider.readdir(params.ino, params.size, params.off);
        mount0_fuse.reply_readdir(reqPtr, entries ? entries.map((e) => e.name) : []);
        break;
      }

      case 'opendir': {
        const fh = await this.provider.opendir(params.ino, params.flags);
        mount0_fuse.reply_opendir(reqPtr, fh);
        break;
      }

      case 'releasedir': {
        await this.provider.releasedir(params.ino, params.fh);
        mount0_fuse.reply_releasedir(reqPtr, 0);
        break;
      }

      case 'fsyncdir': {
        await this.provider.fsyncdir(params.ino, params.fh, params.datasync);
        mount0_fuse.reply_fsyncdir(reqPtr, 0);
        break;
      }

      // File operations
      case 'open': {
        const fh = await this.provider.open(params.ino, params.flags);
        mount0_fuse.reply_open(reqPtr, fh);
        break;
      }

      case 'read': {
        const buf = Buffer.alloc(params.size);
        const bytesRead = await this.provider.read(
          params.ino,
          params.fh,
          buf,
          params.off,
          params.size
        );
        mount0_fuse.reply_read(reqPtr, buf.subarray(0, bytesRead).toString('binary'));
        break;
      }

      case 'write': {
        const buf = Buffer.from(params.data, 'binary');
        const bytesWritten = await this.provider.write(
          params.ino,
          params.fh,
          buf,
          params.off,
          params.size
        );
        mount0_fuse.reply_write(reqPtr, bytesWritten);
        break;
      }

      case 'write_buf': {
        const buf = Buffer.from(params.data || '', 'binary');
        const bytesWritten = await this.provider.write(
          params.ino,
          params.fh,
          buf,
          params.off,
          params.size
        );
        mount0_fuse.reply_write(reqPtr, bytesWritten);
        break;
      }

      case 'flush': {
        await this.provider.flush(params.ino, params.fh);
        mount0_fuse.reply_flush(reqPtr, 0);
        break;
      }

      case 'fsync': {
        await this.provider.fsync(params.ino, params.fh, params.datasync);
        mount0_fuse.reply_fsync(reqPtr, 0);
        break;
      }

      case 'release': {
        await this.provider.release(params.ino, params.fh);
        mount0_fuse.reply_release(reqPtr);
        break;
      }

      // Create operations
      case 'create': {
        const stat = await this.provider.create(
          params.parent,
          params.name,
          params.mode,
          params.flags
        );
        mount0_fuse.reply_create(reqPtr, stat);
        break;
      }

      case 'mknod': {
        const stat = await this.provider.mknod(
          params.parent,
          params.name,
          params.mode,
          params.rdev
        );
        mount0_fuse.reply_mknod(reqPtr, stat);
        break;
      }

      case 'mkdir': {
        await this.provider.mkdir(params.parent, params.name, params.mode);
        mount0_fuse.reply_mkdir(reqPtr, 0);
        break;
      }

      // Remove operations
      case 'unlink': {
        await this.provider.unlink(params.parent, params.name);
        mount0_fuse.reply_unlink(reqPtr, 0);
        break;
      }

      case 'rmdir': {
        await this.provider.rmdir(params.parent, params.name);
        mount0_fuse.reply_rmdir(reqPtr, 0);
        break;
      }

      // Link operations
      case 'link': {
        const stat = await this.provider.link(params.ino, params.newparent, params.newname);
        mount0_fuse.reply_link(reqPtr, stat);
        break;
      }

      case 'symlink': {
        const stat = await this.provider.symlink(params.link, params.parent, params.name);
        mount0_fuse.reply_symlink(reqPtr, stat);
        break;
      }

      case 'readlink': {
        const link = await this.provider.readlink(params.ino);
        mount0_fuse.reply_readlink(reqPtr, link);
        break;
      }

      // Rename
      case 'rename': {
        await this.provider.rename(
          params.parent,
          params.name,
          params.newparent,
          params.newname,
          params.flags
        );
        mount0_fuse.reply_rename(reqPtr, 0);
        break;
      }

      // Extended attributes
      case 'setxattr': {
        const value = Buffer.from(params.value, 'binary');
        await this.provider.setxattr(params.ino, params.name, value, params.size, params.flags);
        mount0_fuse.reply_setxattr(reqPtr, 0);
        break;
      }

      case 'getxattr': {
        const result = await this.provider.getxattr(params.ino, params.name, params.size);
        if (typeof result === 'number') {
          mount0_fuse.reply_xattr(reqPtr, result);
        } else {
          mount0_fuse.reply_getxattr(reqPtr, result.toString('binary'));
        }
        break;
      }

      case 'listxattr': {
        const result = await this.provider.listxattr(params.ino, params.size);
        if (typeof result === 'number') {
          mount0_fuse.reply_xattr(reqPtr, result);
        } else {
          mount0_fuse.reply_listxattr(reqPtr, result.toString('binary'));
        }
        break;
      }

      case 'removexattr': {
        await this.provider.removexattr(params.ino, params.name);
        mount0_fuse.reply_removexattr(reqPtr, 0);
        break;
      }

      // Other operations
      case 'access': {
        await this.provider.access(params.ino, params.mask);
        mount0_fuse.reply_access(reqPtr, 0);
        break;
      }

      case 'statfs': {
        const statfs = await this.provider.statfs(params.ino);
        mount0_fuse.reply_statfs(reqPtr, statfs);
        break;
      }

      // Locking
      case 'getlk': {
        const lock = await this.provider.getlk(params.ino, params.fh);
        mount0_fuse.reply_getlk(reqPtr, lock);
        break;
      }

      case 'setlk': {
        await this.provider.setlk(params.ino, params.fh, params.sleep);
        mount0_fuse.reply_setlk(reqPtr, 0);
        break;
      }

      case 'flock': {
        await this.provider.flock(params.ino, params.fh, params.op);
        mount0_fuse.reply_flock(reqPtr, 0);
        break;
      }

      // Advanced operations
      case 'bmap': {
        const idx = await this.provider.bmap(params.ino, params.blocksize, params.idx);
        mount0_fuse.reply_bmap(reqPtr, idx);
        break;
      }

      case 'ioctl': {
        const inBuf = params.in_buf ? Buffer.from(params.in_buf, 'binary') : null;
        const result = await this.provider.ioctl(
          params.ino,
          params.cmd,
          inBuf,
          params.in_bufsz,
          params.out_bufsz
        );
        mount0_fuse.reply_ioctl(
          reqPtr,
          result.result,
          result.out_buf ? result.out_buf.toString('binary') : undefined
        );
        break;
      }

      case 'poll': {
        const revents = await this.provider.poll(params.ino, params.fh);
        mount0_fuse.reply_poll(reqPtr, revents);
        break;
      }

      case 'fallocate': {
        await this.provider.fallocate(
          params.ino,
          params.fh,
          params.offset,
          params.length,
          params.mode
        );
        mount0_fuse.reply_fallocate(reqPtr, 0);
        break;
      }

      case 'readdirplus': {
        const entries = await this.provider.readdirplus(params.ino, params.size, params.off);
        mount0_fuse.reply_readdirplus(reqPtr, entries ? entries.map((e) => e.name) : []);
        break;
      }

      case 'statx': {
        if (this.provider.statx) {
          await this.provider.statx(params.ino, params.flags, params.mask);
          // Note: statx reply needs special handling - for now use getattr
          const stat = await this.provider.getattr(params.ino);
          if (stat) {
            mount0_fuse.reply_getattr(reqPtr, stat);
          } else {
            mount0_fuse.reply_err(reqPtr, 2); // ENOENT
          }
        } else {
          mount0_fuse.reply_err(reqPtr, 38); // ENOSYS
        }
        break;
      }

      case 'copy_file_range': {
        const bytesWritten = await this.provider.copy_file_range(
          params.ino_in,
          params.off_in,
          params.ino_out,
          params.off_out,
          params.len,
          params.flags
        );
        mount0_fuse.reply_copy_file_range(reqPtr, bytesWritten);
        break;
      }

      case 'lseek': {
        const off = await this.provider.lseek(params.ino, params.fh, params.off, params.whence);
        mount0_fuse.reply_lseek(reqPtr, off);
        break;
      }

      case 'tmpfile': {
        const stat = await this.provider.tmpfile(params.parent, params.mode, params.flags);
        mount0_fuse.reply_tmpfile(reqPtr, stat);
        break;
      }

      default:
        throw new Error(`Unknown operation: ${op}`);
    }
  }
}
