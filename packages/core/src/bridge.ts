import { createRequire } from "module";
import { FilesystemProvider } from "./provider";

const requireNative = createRequire(import.meta.url);
const mount0_fuse = requireNative("../build/Release/mount0_fuse.node");

export class FuseBridge {
  private provider: FilesystemProvider;
  private mounted: boolean = false;

  constructor(provider: FilesystemProvider) {
    this.provider = provider;
  }

  async mount(mountpoint: string, options: Record<string, string> = {}): Promise<void> {
    if (this.mounted) throw new Error("Already mounted");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = async (reqPtr: number, params: Record<string, any>) => {
      try {
        await this.handleOperation(reqPtr, params);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        let errno: number;
        if (err.errno !== undefined && err.errno !== null) {
          errno = err.errno < 0 ? -err.errno : err.errno > 0 ? err.errno : 5;
        } else if (err.code === "ENOENT") {
          errno = 2;
        } else if (err.code === "ENODATA" || err.code === "ENOATTR") {
          errno = 61;
        } else if (err.code === "EIO") {
          errno = 5;
        } else if (err.code === "ENOSYS") {
          errno = 38;
        } else if (err.message && (err.message.includes("not supported") || err.message.includes("not implemented"))) {
          errno = 38;
        } else {
          errno = 5;
        }
        if (process.env.MOUNT0_DEBUG === "1") {
          const op = params?.op || "unknown";
          const errMsg = err?.message || (typeof err === "string" ? err : JSON.stringify(err));
          console.error(`[FUSE:error] op=${op}, err=${errMsg}, errno=${err.errno}, code=${err.code}, final_errno=${errno}`);
        }
        mount0_fuse.reply_err(reqPtr, errno);
      }
    };

    await mount0_fuse.mount(mountpoint, { allow_other: "0", ...options }, handler);
    this.mounted = true;
  }

  async unmount(): Promise<void> {
    if (!this.mounted) return;
    mount0_fuse.unmount();
    this.mounted = false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async handleOperation(reqPtr: number, params: Record<string, any>): Promise<void> {
    if (!params) throw new Error("params is undefined");
    const op = params.op;

    if (op === "init" || op === "destroy") {
      if (op === "init" && this.provider.init) await this.provider.init();
      else if (op === "destroy" && this.provider.destroy) await this.provider.destroy();
      return;
    }

    switch (op) {
      case "forget": {
        if (this.provider.forget) {
          await this.provider.forget(params.ino, params.nlookup);
        }
        mount0_fuse.reply_none(reqPtr);
        break;
      }

      case "forget_multi": {
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

      case "retrieve_reply": {
        if (this.provider.retrieve_reply) {
          const buf = params.data || Buffer.alloc(0);
          await this.provider.retrieve_reply(params.ino, params.cookie, params.offset, buf);
        }
        mount0_fuse.reply_none(reqPtr);
        break;
      }

      // Core operations
      case "lookup": {
        const stat = await this.provider.lookup(params.parent, params.name);
        if (!stat) throw { code: "ENOENT", errno: -2 };
        mount0_fuse.reply_lookup(reqPtr, stat);
        break;
      }

      case "getattr": {
        const stat = await this.provider.getattr(params.ino, params.fh);
        if (!stat) throw { code: "ENOENT", errno: -2 };
        mount0_fuse.reply_getattr(reqPtr, stat);
        break;
      }

      case "setattr": {
        await this.provider.setattr(params.ino, params.fh, params.to_set, params.attr);
        mount0_fuse.reply_getattr(reqPtr, await this.provider.getattr(params.ino, params.fh));
        break;
      }

      // Directory operations
      case "readdir": {
        const entries = await this.provider.readdir(params.ino, params.fh, params.size, params.off);
        mount0_fuse.reply_readdir(reqPtr, entries || []);
        break;
      }

      case "opendir": {
        const fh = await this.provider.opendir(params.ino, params.flags);
        mount0_fuse.reply_opendir(reqPtr, fh);
        break;
      }

      case "releasedir": {
        await this.provider.releasedir(params.ino, params.fh);
        mount0_fuse.reply_releasedir(reqPtr, 0);
        break;
      }

      case "fsyncdir": {
        await this.provider.fsyncdir(params.ino, params.fh, params.datasync);
        mount0_fuse.reply_fsyncdir(reqPtr, 0);
        break;
      }

      // File operations
      case "open": {
        const fh = await this.provider.open(params.ino, params.flags);
        mount0_fuse.reply_open(reqPtr, fh);
        break;
      }

      case "read": {
        const buf = Buffer.alloc(params.size);
        const bytesRead = await this.provider.read(params.ino, params.fh, buf, params.off, params.size);
        mount0_fuse.reply_read(reqPtr, buf.subarray(0, bytesRead));
        break;
      }

      case "write": {
        const buf = params.data || Buffer.alloc(0);
        const bytesWritten = await this.provider.write(params.ino, params.fh, buf, params.off, params.size);
        mount0_fuse.reply_write(reqPtr, bytesWritten);
        break;
      }

      case "write_buf": {
        const buf = params.data || Buffer.alloc(0);
        const bytesWritten = await this.provider.write(params.ino, params.fh, buf, params.off, params.size);
        mount0_fuse.reply_write(reqPtr, bytesWritten);
        break;
      }

      case "flush": {
        await this.provider.flush(params.ino, params.fh);
        mount0_fuse.reply_flush(reqPtr, 0);
        break;
      }

      case "fsync": {
        await this.provider.fsync(params.ino, params.fh, params.datasync);
        mount0_fuse.reply_fsync(reqPtr, 0);
        break;
      }

      case "release": {
        await this.provider.release(params.ino, params.fh);
        mount0_fuse.reply_release(reqPtr);
        break;
      }

      // Create operations
      case "create": {
        const result = await this.provider.create(params.parent, params.name, params.mode, params.flags);
        mount0_fuse.reply_create(reqPtr, result.stat, result.fh);
        break;
      }

      case "mknod": {
        const stat = await this.provider.mknod(params.parent, params.name, params.mode, params.rdev);
        mount0_fuse.reply_mknod(reqPtr, stat);
        break;
      }

      case "mkdir": {
        const stat = await this.provider.mkdir(params.parent, params.name, params.mode);
        mount0_fuse.reply_lookup(reqPtr, stat);
        break;
      }

      // Remove operations
      case "unlink": {
        await this.provider.unlink(params.parent, params.name);
        mount0_fuse.reply_unlink(reqPtr, 0);
        break;
      }

      case "rmdir": {
        await this.provider.rmdir(params.parent, params.name);
        mount0_fuse.reply_rmdir(reqPtr, 0);
        break;
      }

      // Link operations
      case "link": {
        const stat = await this.provider.link(params.ino, params.newparent, params.newname);
        mount0_fuse.reply_link(reqPtr, stat);
        break;
      }

      case "symlink": {
        const stat = await this.provider.symlink(params.link, params.parent, params.name);
        mount0_fuse.reply_symlink(reqPtr, stat);
        break;
      }

      case "readlink": {
        const link = await this.provider.readlink(params.ino);
        mount0_fuse.reply_readlink(reqPtr, link);
        break;
      }

      // Rename
      case "rename": {
        await this.provider.rename(params.parent, params.name, params.newparent, params.newname, params.flags);
        mount0_fuse.reply_rename(reqPtr, 0);
        break;
      }

      // Extended attributes
      case "setxattr": {
        const value = params.value || Buffer.alloc(0);
        await this.provider.setxattr(params.ino, params.name, value, params.size, params.flags);
        mount0_fuse.reply_setxattr(reqPtr, 0);
        break;
      }

      case "getxattr": {
        const result = await this.provider.getxattr(params.ino, params.name, params.size);
        if (typeof result === "number") {
          mount0_fuse.reply_xattr(reqPtr, result);
        } else {
          mount0_fuse.reply_getxattr(reqPtr, result);
        }
        break;
      }

      case "listxattr": {
        const result = await this.provider.listxattr(params.ino, params.size);
        if (typeof result === "number") {
          mount0_fuse.reply_xattr(reqPtr, result);
        } else {
          mount0_fuse.reply_listxattr(reqPtr, result);
        }
        break;
      }

      case "removexattr": {
        await this.provider.removexattr(params.ino, params.name);
        mount0_fuse.reply_removexattr(reqPtr, 0);
        break;
      }

      // Other operations
      case "access": {
        await this.provider.access(params.ino, params.mask);
        mount0_fuse.reply_access(reqPtr, 0);
        break;
      }

      case "statfs": {
        const statfs = await this.provider.statfs(params.ino, params.fh);
        mount0_fuse.reply_statfs(reqPtr, statfs);
        break;
      }

      // Locking
      case "getlk": {
        const lock = await this.provider.getlk(params.ino, params.fh, params.lock);
        mount0_fuse.reply_getlk(reqPtr, lock);
        break;
      }

      case "setlk": {
        await this.provider.setlk(params.ino, params.fh, params.lock, params.sleep);
        mount0_fuse.reply_setlk(reqPtr, 0);
        break;
      }

      case "flock": {
        await this.provider.flock(params.ino, params.fh, params.op);
        mount0_fuse.reply_flock(reqPtr, 0);
        break;
      }

      // Advanced operations
      case "bmap": {
        const idx = await this.provider.bmap(params.ino, params.blocksize, params.idx);
        mount0_fuse.reply_bmap(reqPtr, idx);
        break;
      }

      case "ioctl": {
        const inBuf = params.in_buf || null;
        const result = await this.provider.ioctl(params.ino, params.fh, params.cmd, inBuf, params.in_bufsz, params.out_bufsz, params.flags);
        mount0_fuse.reply_ioctl(reqPtr, result.result, result.out_buf);
        break;
      }

      case "poll": {
        const revents = await this.provider.poll(params.ino, params.fh);
        mount0_fuse.reply_poll(reqPtr, revents);
        break;
      }

      case "fallocate": {
        await this.provider.fallocate(params.ino, params.fh, params.offset, params.length, params.mode);
        mount0_fuse.reply_fallocate(reqPtr, 0);
        break;
      }

      case "readdirplus": {
        const entries = await this.provider.readdirplus(params.ino, params.fh, params.size, params.off);
        mount0_fuse.reply_readdirplus(reqPtr, entries || []);
        break;
      }

      case "statx": {
        if (this.provider.statx) {
          await this.provider.statx(params.ino, params.flags, params.mask);
          const stat = await this.provider.getattr(params.ino, 0);
          if (stat) mount0_fuse.reply_getattr(reqPtr, stat);
          else mount0_fuse.reply_err(reqPtr, 2);
        } else {
          mount0_fuse.reply_err(reqPtr, 38);
        }
        break;
      }

      case "copy_file_range": {
        const bytesWritten = await this.provider.copy_file_range(params.ino_in, params.fh_in, params.off_in, params.ino_out, params.fh_out, params.off_out, params.len, params.flags);
        mount0_fuse.reply_copy_file_range(reqPtr, bytesWritten);
        break;
      }

      case "lseek": {
        const off = await this.provider.lseek(params.ino, params.fh, params.off, params.whence);
        mount0_fuse.reply_lseek(reqPtr, off);
        break;
      }

      case "tmpfile": {
        const result = await this.provider.tmpfile(params.parent, params.mode, params.flags);
        mount0_fuse.reply_tmpfile(reqPtr, result.stat, result.fh);
        break;
      }

      default:
        throw new Error(`Unknown operation: ${op}`);
    }
  }
}
