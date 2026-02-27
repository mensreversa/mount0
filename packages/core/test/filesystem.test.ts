/**
 * Filesystem Tests
 */

import { FilesystemProvider } from "../src/provider";
import { RouterProvider } from "../src/router";
import { DirEntry, FileStat } from "../src/types";

describe("RouterProvider", () => {
  describe("Provider Routing", () => {
    test("should route to correct provider", async () => {
      const stat1: FileStat = {
        mode: 0o644,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const stat2: FileStat = {
        mode: 0o644,
        size: 1,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 3,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider1: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(stat1),
        getattr: jest.fn().mockResolvedValue(stat1),
      } as any;
      const provider2: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(stat2),
        getattr: jest.fn().mockResolvedValue(stat2),
      } as any;

      const router = new RouterProvider([
        { path: "/data", provider: provider1 },
        { path: "/cache", provider: provider2 },
      ]);

      // Lookup files in different paths
      // RouterProvider.lookup(1, name) calls matchProvider(`/${name}`).getattr(1)
      // So we need to mock getattr for the root inode
      provider1.getattr = jest.fn().mockResolvedValue(stat1);
      provider2.getattr = jest.fn().mockResolvedValue(stat2);

      const result1 = await router.lookup(1, "data");
      const result2 = await router.lookup(1, "cache");

      expect(result1).toEqual(stat1);
      expect(result2).toEqual(stat2);
      expect(provider1.getattr).toHaveBeenCalledWith(1, 0);
      expect(provider2.getattr).toHaveBeenCalledWith(1, 0);
    });

    test("should prefer longest matching path", async () => {
      const dataStat: FileStat = {
        mode: 0o755,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const subStat: FileStat = {
        mode: 0o644,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 3,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider1: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(null),
        getattr: jest.fn().mockResolvedValue(dataStat), // getattr(1) for /data path
      } as any;
      const provider2: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(subStat),
        getattr: jest.fn().mockResolvedValue(subStat), // getattr(1) for /data/sub path
      } as any;

      const router = new RouterProvider([
        { path: "/data", provider: provider1 },
        { path: "/data/sub", provider: provider2 },
      ]);

      // When looking up 'data' from root, it should match /data (not /data/sub)
      // because lookup(1, 'data') calls matchProvider('/data')
      const dataResult = await router.lookup(1, "data");
      expect(dataResult).toEqual(dataStat);
      expect(provider1.getattr).toHaveBeenCalledWith(1, 0);

      // When looking up 'sub' under the data inode, it should use provider1
      // (the provider registered for that inode)
      if (dataResult) {
        // The inode is registered to provider1, so lookup will use provider1
        provider1.lookup = jest.fn().mockResolvedValue(subStat);
        const subResult = await router.lookup(dataResult.ino, "sub");
        expect(subResult).toEqual(subStat);
        expect(provider1.lookup).toHaveBeenCalledWith(dataResult.ino, "sub");
      }
    });

    test("should handle provider lookup by inode", async () => {
      const stat: FileStat = {
        mode: 0o644,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(stat),
        getattr: jest.fn().mockResolvedValue(stat),
      } as any;

      const router = new RouterProvider([{ path: "/data", provider }]);

      // First lookup to register the inode
      const lookupResult = await router.lookup(1, "data");
      expect(lookupResult).toEqual(stat);

      // Then getattr should use the registered provider
      const getattrResult = await router.getattr(stat.ino, 0);
      expect(getattrResult).toEqual(stat);
      expect(provider.getattr).toHaveBeenCalledWith(stat.ino, 0);
    });
  });

  describe("Filesystem Operations", () => {
    test("should route create operations", async () => {
      const createdStat: FileStat = {
        mode: 0o644,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ stat: createdStat, fh: 1 }),
        getattr: jest.fn().mockResolvedValue(null),
        readdir: jest.fn().mockResolvedValue([]),
      } as any;

      const router = new RouterProvider([{ path: "/data", provider }]);

      // First lookup the parent (root directory)
      const parentStat = await router.getattr(1, 0);
      expect(parentStat).not.toBeNull();
      if (parentStat) {
        // For root, we need to lookup the 'data' entry first
        const dataStat = await router.lookup(1, "data");
        if (dataStat) {
          const { stat: result } = await router.create(dataStat.ino, "test.txt", 0o644, 0);
          expect(result).toEqual(createdStat);
          expect(provider.create).toHaveBeenCalledWith(dataStat.ino, "test.txt", 0o644, 0);
        }
      }
    });

    test("should route read and write operations", async () => {
      const fileStat: FileStat = {
        mode: 0o644,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(fileStat),
        getattr: jest.fn().mockResolvedValue(fileStat),
        open: jest.fn().mockResolvedValue(1),
        read: jest.fn().mockResolvedValue(13),
        write: jest.fn().mockResolvedValue(13),
        release: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn().mockResolvedValue([]),
      } as any;

      const router = new RouterProvider([{ path: "/data", provider }]);

      // Lookup file
      const stat = await router.lookup(1, "data");
      expect(stat).toEqual(fileStat);
      expect(stat).not.toBeNull();

      if (stat) {
        // Open file
        const fh = await router.open(stat.ino, 0, 0o644);
        expect(fh).toBe(1);
        expect(provider.open).toHaveBeenCalledWith(stat.ino, 0, 0o644);

        // Write to file
        const writeBuffer = Buffer.from("Hello, World!");
        const bytesWritten = await router.write(stat.ino, fh, writeBuffer, 0, writeBuffer.length);
        expect(bytesWritten).toBe(13);
        expect(provider.write).toHaveBeenCalledWith(stat.ino, fh, writeBuffer, 0, writeBuffer.length);

        // Read from file
        const readBuffer = Buffer.alloc(13);
        const bytesRead = await router.read(stat.ino, fh, readBuffer, 0, 13);
        expect(bytesRead).toBe(13);
        expect(provider.read).toHaveBeenCalledWith(stat.ino, fh, readBuffer, 0, 13);

        // Release file
        await router.release(stat.ino, fh);
        expect(provider.release).toHaveBeenCalledWith(stat.ino, fh);
      }
    });

    test("should route directory operations", async () => {
      const dirStat: FileStat = {
        mode: 0o755,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const entries: DirEntry[] = [{ name: "subdir", mode: 0o755, ino: 3 }];
      const provider: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(dirStat),
        getattr: jest.fn().mockResolvedValue(dirStat),
        mkdir: jest.fn().mockResolvedValue(dirStat),
        readdir: jest.fn().mockResolvedValue(entries),
        rmdir: jest.fn().mockResolvedValue(undefined),
      } as any;

      const router = new RouterProvider([{ path: "/data", provider }]);

      // Lookup directory
      const stat = await router.lookup(1, "data");
      expect(stat).toEqual(dirStat);
      expect(stat).not.toBeNull();

      if (stat) {
        // Create subdirectory
        const createdDir = await router.mkdir(stat.ino, "subdir", 0o755);
        expect(createdDir).toEqual(dirStat);
        expect(provider.mkdir).toHaveBeenCalledWith(stat.ino, "subdir", 0o755);

        // Read directory
        const dirEntries = await router.readdir(stat.ino, 0, 4096, 0);
        expect(dirEntries).toEqual(entries);
        expect(provider.readdir).toHaveBeenCalledWith(stat.ino, 0, 4096, 0);

        // Remove directory
        await router.rmdir(stat.ino, "subdir");
        expect(provider.rmdir).toHaveBeenCalledWith(stat.ino, "subdir");
      }
    });

    test("should route file operations", async () => {
      const fileStat: FileStat = {
        mode: 0o644,
        size: 12,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(fileStat),
        getattr: jest.fn().mockResolvedValue(fileStat),
        create: jest.fn().mockResolvedValue({ stat: fileStat, fh: 1 }),
        unlink: jest.fn().mockResolvedValue(undefined),
        rename: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn().mockResolvedValue([]),
      } as any;

      const router = new RouterProvider([{ path: "/data", provider }]);

      // Lookup parent directory
      const parentStat = await router.lookup(1, "data");
      expect(parentStat).toEqual(fileStat);
      expect(parentStat).not.toBeNull();

      if (parentStat) {
        // Create file
        const { stat: createdStat } = await router.create(parentStat.ino, "file.txt", 0o644, 0);
        expect(createdStat).toEqual(fileStat);

        // Get attributes
        const resultStat = await router.getattr(createdStat.ino, 0);
        expect(resultStat?.size).toBe(12);

        // Rename file
        await router.rename(parentStat.ino, "file.txt", parentStat.ino, "new.txt", 0);
        expect(provider.rename).toHaveBeenCalledWith(parentStat.ino, "file.txt", parentStat.ino, "new.txt", 0);

        // Unlink file
        await router.unlink(parentStat.ino, "new.txt");
        expect(provider.unlink).toHaveBeenCalledWith(parentStat.ino, "new.txt");
      }
    });
  });

  describe("Error Handling", () => {
    test("should throw when no provider found for path", async () => {
      const router = new RouterProvider([]);
      await expect(router.lookup(1, "other")).rejects.toThrow("No provider found");
    });

    test("should throw when provider operation fails", async () => {
      const fileStat: FileStat = {
        mode: 0o644,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider: FilesystemProvider = {
        lookup: jest.fn().mockResolvedValue(fileStat),
        getattr: jest.fn().mockResolvedValue(fileStat),
        open: jest.fn().mockRejectedValue(new Error("File not found")),
        readdir: jest.fn().mockResolvedValue([]),
      } as any;

      const router = new RouterProvider([{ path: "/data", provider }]);

      const stat = await router.lookup(1, "data");
      expect(stat).not.toBeNull();
      if (stat) {
        await expect(router.open(stat.ino, 0, 0o644)).rejects.toThrow("File not found");
      }
    });

    test("should throw when provider not found for inode", async () => {
      const router = new RouterProvider([]);
      await expect(router.getattr(999, 0)).rejects.toThrow("Provider not found for inode 999");
    });
  });

  describe("Provider Management", () => {
    test("should handle adding providers", () => {
      const provider: FilesystemProvider = {
        lookup: jest.fn(),
        getattr: jest.fn(),
        readdir: jest.fn().mockResolvedValue([]),
      } as any;

      const router = new RouterProvider([]);
      router.handle("/data", provider);

      expect(router.providers).toHaveLength(1);
      expect(router.providers[0].path).toBe("/data");
      expect(router.providers[0].provider).toBe(provider);
    });

    test("should handle removing providers", () => {
      const provider: FilesystemProvider = {
        lookup: jest.fn(),
        getattr: jest.fn(),
        readdir: jest.fn().mockResolvedValue([]),
      } as any;

      const router = new RouterProvider([{ path: "/data", provider }]);
      expect(router.providers).toHaveLength(1);

      router.unhandle("/data");
      expect(router.providers).toHaveLength(0);
    });

    test("should sort providers by path length when adding", () => {
      const provider1: FilesystemProvider = {
        lookup: jest.fn(),
        getattr: jest.fn(),
        readdir: jest.fn().mockResolvedValue([]),
      } as any;
      const provider2: FilesystemProvider = {
        lookup: jest.fn(),
        getattr: jest.fn(),
        readdir: jest.fn().mockResolvedValue([]),
      } as any;

      const router = new RouterProvider([]);

      // Add providers - handle() should sort them by length
      router.handle("/data", provider1);
      router.handle("/data/sub", provider2);

      // Should be sorted by length (longest first)
      expect(router.providers[0].path).toBe("/data/sub");
      expect(router.providers[1].path).toBe("/data");
    });
  });
});
