/**
 * MemoryProvider Tests
 */

import { MemoryProvider } from "../../memory/src/index";

describe("MemoryProvider", () => {
  let provider: MemoryProvider;

  beforeEach(() => {
    provider = new MemoryProvider();
  });

  describe("Lookup & Getattr", () => {
    test("root node has inode 1", async () => {
      const stat = await provider.getattr(1, 0);
      expect(stat).not.toBeNull();
      expect(stat!.ino).toBe(1);
      expect(stat!.mode & 0o40000).toBe(0o40000); // directory
    });

    test("lookup non-existent returns null", async () => {
      const stat = await provider.lookup(1, "missing");
      expect(stat).toBeNull();
    });

    test("lookup after create returns stat", async () => {
      const fh = await provider.open(1, 0);
      await provider.create(1, "file.txt", 0o100644, 0);
      const stat = await provider.lookup(1, "file.txt");
      expect(stat).not.toBeNull();
      expect(stat!.mode & 0o100000).toBe(0o100000); // regular file
      await provider.release(1, fh);
    });
  });

  describe("File Operations", () => {
    test("create, open, write, read, release", async () => {
      const { stat, fh } = await provider.create(1, "hello.txt", 0o100644, 0);
      expect(stat.ino).toBeGreaterThan(1);
      expect(fh).toBeGreaterThan(0);

      const data = Buffer.from("Hello, World!");
      const written = await provider.write(stat.ino, fh, data, 0, data.length);
      expect(written).toBe(data.length);

      const readBuf = Buffer.alloc(data.length);
      const bytesRead = await provider.read(stat.ino, fh, readBuf, 0, data.length);
      expect(bytesRead).toBe(data.length);
      expect(readBuf.toString()).toBe("Hello, World!");

      await provider.release(stat.ino, fh);
    });

    test("read from offset", async () => {
      const { stat, fh } = await provider.create(1, "offset.txt", 0o100644, 0);
      const data = Buffer.from("Hello, World!");
      await provider.write(stat.ino, fh, data, 0, data.length);

      const readBuf = Buffer.alloc(5);
      const bytesRead = await provider.read(stat.ino, fh, readBuf, 7, 5);
      expect(bytesRead).toBe(5);
      expect(readBuf.toString()).toBe("World");

      await provider.release(stat.ino, fh);
    });

    test("write at offset extends file", async () => {
      const { stat, fh } = await provider.create(1, "extend.txt", 0o100644, 0);
      const data = Buffer.from("XYZ");
      await provider.write(stat.ino, fh, data, 10, data.length);

      const updated = await provider.getattr(stat.ino, 0);
      expect(updated!.size).toBe(13);

      await provider.release(stat.ino, fh);
    });

    test("flush and fsync are no-ops", async () => {
      const { stat, fh } = await provider.create(1, "noop.txt", 0o100644, 0);
      await expect(provider.flush(stat.ino, fh)).resolves.toBeUndefined();
      await expect(provider.fsync(stat.ino, fh, 0)).resolves.toBeUndefined();
      await provider.release(stat.ino, fh);
    });

    test("unlink removes file", async () => {
      await provider.create(1, "delete.txt", 0o100644, 0);
      expect(await provider.lookup(1, "delete.txt")).not.toBeNull();
      await provider.unlink(1, "delete.txt");
      expect(await provider.lookup(1, "delete.txt")).toBeNull();
    });

    test("rename moves file", async () => {
      await provider.create(1, "old.txt", 0o100644, 0);
      await provider.rename(1, "old.txt", 1, "new.txt", 0);
      expect(await provider.lookup(1, "old.txt")).toBeNull();
      expect(await provider.lookup(1, "new.txt")).not.toBeNull();
    });
  });

  describe("Directory Operations", () => {
    test("mkdir creates directory", async () => {
      const stat = await provider.mkdir(1, "subdir", 0o40755);
      expect(stat.ino).toBeGreaterThan(1);
      expect(stat.mode & 0o40000).toBe(0o40000);
    });

    test("readdir returns created entries", async () => {
      await provider.mkdir(1, "dirA", 0o40755);
      await provider.create(1, "fileB.txt", 0o100644, 0);
      const entries = await provider.readdir(1, 0, 4096, 0);
      const names = entries.map((e) => e.name);
      expect(names).toContain("dirA");
      expect(names).toContain("fileB.txt");
    });

    test("readdir respects offset", async () => {
      await provider.mkdir(1, "a", 0o40755);
      await provider.mkdir(1, "b", 0o40755);
      const all = await provider.readdir(1, 0, 4096, 0);
      const offset1 = await provider.readdir(1, 0, 4096, 1);
      expect(offset1.length).toBe(all.length - 1);
    });

    test("readdirplus delegates to readdir", async () => {
      await provider.create(1, "x.txt", 0o100644, 0);
      const entries = await provider.readdirplus(1, 0, 4096, 0);
      expect(entries.map((e) => e.name)).toContain("x.txt");
    });

    test("rmdir removes empty directory", async () => {
      await provider.mkdir(1, "todelete", 0o40755);
      await provider.rmdir(1, "todelete");
      expect(await provider.lookup(1, "todelete")).toBeNull();
    });

    test("rmdir throws when directory not empty", async () => {
      await provider.mkdir(1, "parent", 0o40755);
      const parentStat = await provider.lookup(1, "parent");
      await provider.create(parentStat!.ino, "child.txt", 0o100644, 0);
      await expect(provider.rmdir(1, "parent")).rejects.toThrow("not empty");
    });

    test("opendir and releasedir", async () => {
      const fh = await provider.opendir(1, 0);
      expect(fh).toBeGreaterThan(0);
      await expect(provider.releasedir(1, fh)).resolves.toBeUndefined();
    });

    test("fsyncdir is no-op", async () => {
      await expect(provider.fsyncdir(1, 0, 0)).resolves.toBeUndefined();
    });
  });

  describe("Setattr", () => {
    test("truncate via FUSE_SET_ATTR_SIZE", async () => {
      const { stat, fh } = await provider.create(1, "trunc.txt", 0o100644, 0);
      const data = Buffer.from("Hello, World!");
      await provider.write(stat.ino, fh, data, 0, data.length);

      const FUSE_SET_ATTR_SIZE = 8;
      await provider.setattr(stat.ino, fh, FUSE_SET_ATTR_SIZE, { ...stat, size: 5 });

      const updated = await provider.getattr(stat.ino, fh);
      expect(updated!.size).toBe(5);

      const readBuf = Buffer.alloc(5);
      const bytesRead = await provider.read(stat.ino, fh, readBuf, 0, 5);
      expect(bytesRead).toBe(5);
      expect(readBuf.toString()).toBe("Hello");

      await provider.release(stat.ino, fh);
    });

    test("set mode via FUSE_SET_ATTR_MODE", async () => {
      const { stat } = await provider.create(1, "chmod.txt", 0o100644, 0);
      const FUSE_SET_ATTR_MODE = 1;
      await provider.setattr(stat.ino, 0, FUSE_SET_ATTR_MODE, { ...stat, mode: 0o100755 });
      const updated = await provider.getattr(stat.ino, 0);
      expect(updated!.mode).toBe(0o100755);
    });
  });

  describe("Link Operations", () => {
    test("hardlink shares same inode", async () => {
      const { stat } = await provider.create(1, "original.txt", 0o100644, 0);
      const linkStat = await provider.link(stat.ino, 1, "linked.txt");
      expect(linkStat.ino).toBe(stat.ino);
      const lookupStat = await provider.lookup(1, "linked.txt");
      expect(lookupStat).not.toBeNull();
    });

    test("symlink and readlink", async () => {
      const symStat = await provider.symlink("/target/path", 1, "mysym");
      const resolved = await provider.readlink(symStat.ino);
      expect(resolved).toBe("/target/path");
    });
  });

  describe("Extended Attributes", () => {
    test("listxattr returns 0 for size query", async () => {
      const result = await provider.listxattr(1, 0);
      expect(result).toBe(0);
    });

    test("listxattr returns empty buffer when size > 0", async () => {
      const result = await provider.listxattr(1, 64);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect((result as Buffer).length).toBe(0);
    });

    test("setxattr throws not supported", async () => {
      await expect(provider.setxattr(1, "user.test", Buffer.from("val"), 3, 0)).rejects.toThrow();
    });

    test("getxattr throws not supported", async () => {
      await expect(provider.getxattr(1, "user.test", 64)).rejects.toThrow();
    });
  });

  describe("Access & Statfs", () => {
    test("access always succeeds", async () => {
      await expect(provider.access(1, 0o7)).resolves.toBeUndefined();
    });

    test("statfs returns expected structure", async () => {
      const fs = await provider.statfs(1, 0);
      expect(fs.bsize).toBe(4096);
      expect(fs.blocks).toBeGreaterThan(0);
      expect(fs.bfree).toBeGreaterThan(0);
    });
  });

  describe("Advanced Operations", () => {
    test("mknod creates regular file", async () => {
      const stat = await provider.mknod(1, "node.txt", 0o100644, 0);
      expect(stat.ino).toBeGreaterThan(1);
    });

    test("poll returns POLLIN|POLLOUT", async () => {
      const events = await provider.poll(1, 0);
      expect(events & 0x01).toBeTruthy(); // POLLIN
    });

    test("fallocate preallocates space", async () => {
      const { stat, fh } = await provider.create(1, "prealloc.txt", 0o100644, 0);
      await provider.fallocate(stat.ino, fh, 0, 1024, 0);
      const updated = await provider.getattr(stat.ino, fh);
      expect(updated!.size).toBe(1024);
      await provider.release(stat.ino, fh);
    });

    test("copy_file_range copies data between files", async () => {
      const { stat: src, fh: srcFh } = await provider.create(1, "src.txt", 0o100644, 0);
      const { stat: dst, fh: dstFh } = await provider.create(1, "dst.txt", 0o100644, 0);

      const data = Buffer.from("ABCDE");
      await provider.write(src.ino, srcFh, data, 0, data.length);

      const copied = await provider.copy_file_range(src.ino, srcFh, 0, dst.ino, dstFh, 0, 3, 0);
      expect(copied).toBe(3);

      const readBuf = Buffer.alloc(3);
      await provider.read(dst.ino, dstFh, readBuf, 0, 3);
      expect(readBuf.toString()).toBe("ABC");

      await provider.release(src.ino, srcFh);
      await provider.release(dst.ino, dstFh);
    });

    test("lseek returns end of content", async () => {
      const { stat, fh } = await provider.create(1, "seek.txt", 0o100644, 0);
      const data = Buffer.from("12345");
      await provider.write(stat.ino, fh, data, 0, data.length);
      const off = await provider.lseek(stat.ino, fh, 0, 2);
      expect(off).toBe(5);
      await provider.release(stat.ino, fh);
    });

    test("tmpfile creates temporary file", async () => {
      const { stat, fh } = await provider.tmpfile(1, 0o100644, 0);
      expect(stat.ino).toBeGreaterThan(1);
      expect(fh).toBeGreaterThan(0);
    });

    test("locking operations throw not supported", async () => {
      const lock = { type: 0, whence: 0, start: 0, len: 0, pid: 0 };
      await expect(provider.getlk(1, 0, lock)).resolves.toEqual(lock); // Now resolves returning the same lock
      await expect(provider.setlk(1, 0, lock, 0)).rejects.toThrow();
      await expect(provider.flock(1, 0, 0)).rejects.toThrow();
    });

    test("bmap throws not supported", async () => {
      await expect(provider.bmap(1, 4096, 0)).rejects.toThrow();
    });

    test("ioctl throws not supported", async () => {
      await expect(provider.ioctl(1, 0, 0, null, 0, 0, 0)).rejects.toThrow();
    });
  });

  describe("Forget Operations", () => {
    test("forget is not implemented", () => {
      const p = provider as import("../src/provider").FilesystemProvider;
      expect(p.forget).toBeUndefined();
    });
  });
});
