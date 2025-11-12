/**
 * Filesystem Tests
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { FileSystem } from '../src/filesystem';
import { FilesystemProvider } from '../src/provider';
import { FileHandle, FileStat } from '../src/types';

describe('FileSystem', () => {
  describe('Provider Routing', () => {
    test('should route to correct provider', async () => {
      const stat1: FileStat = {
        mode: 0o644,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 1,
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
        ino: 2,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider1: FilesystemProvider = {
        getattr: jest.fn().mockResolvedValue(stat1),
      } as any;
      const provider2: FilesystemProvider = {
        getattr: jest.fn().mockResolvedValue(stat2),
      } as any;

      const fs = new FileSystem(
        new Map([
          ['/data', provider1],
          ['/cache', provider2],
        ])
      );

      await fs.getattr('/data/file.txt');
      await fs.getattr('/cache/file.txt');

      expect(provider1.getattr).toHaveBeenCalledWith('/file.txt');
      expect(provider2.getattr).toHaveBeenCalledWith('/file.txt');
    });

    test('should prefer longest matching path', async () => {
      const stat: FileStat = {
        mode: 0o644,
        size: 0,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 1,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const provider1: FilesystemProvider = {
        getattr: jest.fn().mockResolvedValue(null),
      } as any;
      const provider2: FilesystemProvider = {
        getattr: jest.fn().mockResolvedValue(stat),
      } as any;

      const fs = new FileSystem(
        new Map([
          ['/data', provider1],
          ['/data/sub', provider2],
        ])
      );

      await fs.getattr('/data/sub/file.txt');
      expect(provider2.getattr).toHaveBeenCalledWith('/file.txt');
      expect(provider1.getattr).not.toHaveBeenCalled();
    });

    test('should return null for non-existent paths', async () => {
      const provider: FilesystemProvider = {
        getattr: jest.fn().mockResolvedValue(null),
      } as any;

      const fs = new FileSystem(new Map([['/data', provider]]));
      const result = await fs.getattr('/data/nonexistent.txt');

      expect(result).toBeNull();
    });
  });

  describe('Filesystem Operations', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mount0-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('should create and read files', async () => {
      const handle: FileHandle = { fd: 1, path: '/test.txt', flags: 0o2 };
      const provider: FilesystemProvider = {
        create: jest.fn().mockResolvedValue(handle),
        write: jest.fn().mockResolvedValue(13),
        read: jest.fn().mockImplementation(async (h, buffer) => {
          Buffer.from('Hello, World!').copy(buffer);
          return 13;
        }),
        close: jest.fn().mockResolvedValue(undefined),
        getattr: jest.fn().mockResolvedValue(null),
        readdir: jest.fn().mockResolvedValue([]),
        open: jest.fn().mockResolvedValue(handle),
        unlink: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined),
        rmdir: jest.fn().mockResolvedValue(undefined),
        rename: jest.fn().mockResolvedValue(undefined),
        truncate: jest.fn().mockResolvedValue(undefined),
      } as any;

      const fs = new FileSystem(new Map([['/data', provider]]));
      const createdHandle = await fs.create('/data/test.txt', 0o644);
      const fullHandle = { ...createdHandle, path: '/data/test.txt' };

      const writeBuffer = Buffer.from('Hello, World!');
      await fs.write(fullHandle, writeBuffer, 0, writeBuffer.length);

      const readBuffer = Buffer.alloc(13);
      const bytesRead = await fs.read(fullHandle, readBuffer, 0, 13);

      expect(bytesRead).toBe(13);
      expect(readBuffer.toString()).toBe('Hello, World!');
      await fs.close(fullHandle);
    });

    test('should handle directories', async () => {
      const provider: FilesystemProvider = {
        mkdir: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn().mockResolvedValue([{ name: 'subdir', mode: 0o755, ino: 1 }]),
        rmdir: jest.fn().mockResolvedValue(undefined),
        getattr: jest.fn().mockResolvedValue(null),
        open: jest.fn().mockResolvedValue({ fd: 1, path: '/', flags: 0 }),
        read: jest.fn().mockResolvedValue(0),
        write: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ fd: 1, path: '/', flags: 0 }),
        unlink: jest.fn().mockResolvedValue(undefined),
        rename: jest.fn().mockResolvedValue(undefined),
        truncate: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      } as any;

      const fs = new FileSystem(new Map([['/data', provider]]));

      await fs.mkdir('/data/subdir', 0o755);
      const entries = await fs.readdir('/data');
      await fs.rmdir('/data/subdir');

      expect(provider.mkdir).toHaveBeenCalledWith('/subdir', 0o755);
      expect(entries).toHaveLength(1);
      expect(provider.rmdir).toHaveBeenCalledWith('/subdir');
    });

    test('should handle file operations', async () => {
      const stat: FileStat = {
        mode: 0o644,
        size: 12,
        mtime: 0,
        ctime: 0,
        atime: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        ino: 1,
        nlink: 1,
        rdev: 0,
        blksize: 0,
        blocks: 0,
      };
      const handle: FileHandle = { fd: 1, path: '/file.txt', flags: 0o2 };
      const provider: FilesystemProvider = {
        create: jest.fn().mockResolvedValue(handle),
        getattr: jest.fn().mockResolvedValue(stat),
        unlink: jest.fn().mockResolvedValue(undefined),
        rename: jest.fn().mockResolvedValue(undefined),
        truncate: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        readdir: jest.fn().mockResolvedValue([]),
        open: jest.fn().mockResolvedValue(handle),
        read: jest.fn().mockResolvedValue(0),
        write: jest.fn().mockResolvedValue(0),
        mkdir: jest.fn().mockResolvedValue(undefined),
        rmdir: jest.fn().mockResolvedValue(undefined),
      } as any;

      const fs = new FileSystem(new Map([['/data', provider]]));

      const createdHandle = await fs.create('/data/file.txt', 0o644);
      await fs.close({ ...createdHandle, path: '/data/file.txt' });

      const resultStat = await fs.getattr('/data/file.txt');
      await fs.rename('/data/file.txt', '/data/new.txt');
      await fs.truncate('/data/new.txt', 4);
      await fs.unlink('/data/new.txt');

      expect(resultStat?.size).toBe(12);
      expect(provider.rename).toHaveBeenCalledWith('/file.txt', '/new.txt');
    });
  });

  describe('Error Handling', () => {
    test('should throw when no provider found', async () => {
      const fs = new FileSystem(new Map());
      await expect(fs.create('/other/file.txt', 0o644)).rejects.toThrow('No provider found');
    });

    test('should throw when provider operation fails', async () => {
      const provider: FilesystemProvider = {
        open: jest.fn().mockRejectedValue(new Error('File not found')),
        getattr: jest.fn().mockResolvedValue(null),
        readdir: jest.fn().mockResolvedValue([]),
        read: jest.fn().mockResolvedValue(0),
        write: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ fd: 1, path: '/', flags: 0 }),
        unlink: jest.fn().mockResolvedValue(undefined),
        mkdir: jest.fn().mockResolvedValue(undefined),
        rmdir: jest.fn().mockResolvedValue(undefined),
        rename: jest.fn().mockResolvedValue(undefined),
        truncate: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
      } as any;

      const fs = new FileSystem(new Map([['/data', provider]]));
      await expect(fs.open('/data/nonexistent.txt', 0, 0o644)).rejects.toThrow('File not found');
    });
  });
});
