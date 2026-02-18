# mount0

> High-performance virtual filesystem for developers

Mount0 is a powerful TypeScript library that enables you to mount remote resources (S3 buckets, FTP servers, SSH file systems, WebDAV, Samba shares, and more) as local filesystems using FUSE (Filesystem in Userspace) on macOS/Linux and WinFsp on Windows. Built with performance and developer experience in mind, mount0 bridges the gap between web services and traditional file access.

## Features

- 🚀 **High Performance**: Native FUSE/WinFsp bindings with zero-copy streaming
- 🪟 **Cross-Platform**: Supports macOS, Linux, and Windows
- 🔌 **Multiple Backends**: Support for S3, FTP, SSH, WebDAV, Samba, and custom providers
- 💾 **Caching**: Built-in caching layer with configurable strategies
- 🔄 **Multi-Provider**: Failover and quorum strategies for high availability
- 🛡️ **RAID Support**: RAID 0, 1, 5, and 6 implementations for redundancy and performance
- 🔐 **Encryption**: Transparent encryption/decryption for secure storage
- 📦 **TypeScript First**: Full TypeScript support with comprehensive type definitions
- 🛠️ **Extensible**: Easy to create custom filesystem providers
- 🎯 **Simple API**: Clean, intuitive API for mounting and managing filesystems

## Requirements

- **Node.js**: v20.x or higher
- **FUSE/WinFsp**:
  - **macOS**: [macFUSE](https://osxfuse.github.io/) 4.10.1+ (includes libfuse3 3.17.1+) - install via `brew install macfuse`
  - **Linux**: `libfuse3-dev` 3.17.1+ (install via `sudo apt-get install libfuse3-dev`)
  - **Windows**: [WinFsp](https://winfsp.dev/) (download and install from [winfsp.dev](https://winfsp.dev/rel/))

## Installation

```bash
npm install @mount0/core
```

### Core Providers

```bash
npm install @mount0/local      # Local filesystem provider
npm install @mount0/memory     # In-memory filesystem provider
```

### Advanced Providers

```bash
npm install @mount0/cache      # Caching providers (write-through, write-back)
npm install @mount0/raid       # RAID providers (RAID 0, 1, 5, 6)
npm install @mount0/multi     # Multi-provider strategies (failover, quorum)
npm install @mount0/encrypted  # Encrypted filesystem provider
```

### Backend Providers

```bash
npm install @mount0/s3      # AWS S3 support
npm install @mount0/ftp      # FTP support
npm install @mount0/ssh      # SSH/SFTP support
npm install @mount0/webdav   # WebDAV support
npm install @mount0/samba    # Samba/CIFS support
```

## Quick Start

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";

async function main() {
  const fs = mount0();
  fs.handle("/", new LocalProvider("/tmp"));

  await fs.mount("/tmp/mount0");
  console.log("Filesystem mounted at /tmp/mount0");

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    await fs.unmount();
    process.exit(0);
  });
}

main().catch(console.error);
```

## Usage

### Basic Mounting

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";

const fs = mount0();
fs.handle("/", new LocalProvider("/path/to/data"));

await fs.mount("/mnt/myfs");
// Filesystem is now accessible at /mnt/myfs
```

### Multiple Backends

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";
import { MemoryProvider } from "@mount0/memory";

const fs = mount0();
fs.handle("/data", new LocalProvider("/var/data"));
fs.handle("/cache", new MemoryProvider());

await fs.mount("/mnt/multi");
```

### With Caching

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";
import { MemoryProvider } from "@mount0/memory";
import { WriteThroughCacheProvider } from "@mount0/cache";

const cachedProvider = new WriteThroughCacheProvider({
  master: new LocalProvider("/path/to/data"),
  slave: new MemoryProvider(),
});

const fs = mount0();
fs.handle("/", cachedProvider);

await fs.mount("/mnt/cached");
```

Or use write-back caching:

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";
import { MemoryProvider } from "@mount0/memory";
import { WriteBackCacheProvider } from "@mount0/cache";

const cachedProvider = new WriteBackCacheProvider({
  master: new LocalProvider("/path/to/data"),
  slave: new MemoryProvider(),
});
```

### RAID Storage

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";
import { Raid0Provider, Raid1Provider, Raid5Provider, Raid6Provider } from "@mount0/raid";

const fs = mount0();

// RAID 0 (Striping) - Performance
fs.handle(
  "/fast",
  new Raid0Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2")],
    stripeSize: 128 * 1024,
  })
);

// RAID 1 (Mirroring) - Redundancy
fs.handle(
  "/backup",
  new Raid1Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2")],
  })
);

// RAID 5 (Parity) - Balance of performance and redundancy
fs.handle(
  "/data",
  new Raid5Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2"), new LocalProvider("/disk3")],
  })
);

// RAID 6 (Double Parity) - High redundancy
fs.handle(
  "/critical",
  new Raid6Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2"), new LocalProvider("/disk3"), new LocalProvider("/disk4")],
  })
);
```

### Multi-Provider Strategies

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";
import { MemoryProvider } from "@mount0/memory";
import { FirstProvider, MajorityProvider } from "@mount0/multi";

const fs = mount0();

// Failover - Try providers sequentially
fs.handle(
  "/failover",
  new FirstProvider({
    providers: [new LocalProvider("/primary"), new LocalProvider("/secondary")],
  })
);

// Quorum - Require majority consensus
fs.handle(
  "/quorum",
  new MajorityProvider({
    providers: [new MemoryProvider(), new MemoryProvider(), new MemoryProvider()],
  })
);
```

### Combining Providers

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";
import { Raid1Provider } from "@mount0/raid";
import { EncryptedProvider } from "@mount0/encrypted";
import { FirstProvider } from "@mount0/multi";

const fs = mount0();

// RAID 1 for redundancy
fs.handle(
  "/backup",
  new Raid1Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2")],
  })
);

// Encrypted storage
fs.handle(
  "/secure",
  new EncryptedProvider({
    provider: new LocalProvider("/secure-data"),
    password: "my-secret-password",
  })
);

// Failover with encryption
fs.handle(
  "/encrypted-failover",
  new FirstProvider({
    providers: [
      new EncryptedProvider({
        provider: new LocalProvider("/primary"),
        password: "pass1",
      }),
      new EncryptedProvider({
        provider: new LocalProvider("/secondary"),
        password: "pass2",
      }),
    ],
  })
);

await fs.mount("/mnt/combined");
```

### Graceful Shutdown

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";

const fs = mount0();
fs.handle("/", new LocalProvider("/data"));

await fs.mount("/mnt/myfs");

// Handle shutdown signals
process.on("SIGINT", async () => {
  console.log("Unmounting...");
  await fs.unmount();
  process.exit(0);
});
```

## Architecture

Mount0 is built on a modular architecture:

- **Core** (`@mount0/core`): FUSE bindings and filesystem abstraction
- **Basic Providers**:
  - `@mount0/local`: Local filesystem provider
  - `@mount0/memory`: In-memory filesystem provider
- **Advanced Providers**:
  - `@mount0/cache`: Caching layer with write-through and write-back strategies
  - `@mount0/raid`: RAID implementations (RAID 0, 1, 5, 6)
  - `@mount0/multi`: Multi-provider strategies (failover, quorum)
  - `@mount0/encrypted`: Transparent encryption/decryption
- **Backend Providers**: Remote storage implementations (S3, FTP, SSH, WebDAV, Samba)

### Provider Interface

All providers implement the `FilesystemProvider` interface, which uses inode-based operations:

```typescript
interface FilesystemProvider {
  // Lifecycle operations
  init?(): Promise<void>;
  destroy?(): Promise<void>;
  forget?(ino: number, nlookup: number): Promise<void>;
  forget_multi?(forgets: Array<{ ino: number; nlookup: number }>): Promise<void>;

  // Core operations
  lookup(parent: number, name: string): Promise<FileStat | null>;
  getattr(ino: number): Promise<FileStat | null>;
  setattr(ino: number, to_set: number, attr: FileStat): Promise<void>;

  // Directory operations
  readdir(ino: number, size: number, off: number): Promise<DirEntry[]>;
  opendir(ino: number, flags: number): Promise<number>;
  releasedir(ino: number, fh: number): Promise<void>;
  fsyncdir(ino: number, fh: number, datasync: number): Promise<void>;

  // File operations
  open(ino: number, flags: number, mode?: number): Promise<number>;
  read(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number>;
  write(ino: number, fh: number, buffer: Buffer, off: number, length: number): Promise<number>;
  write_buf?(ino: number, fh: number, buffer: Buffer, off: number, size: number): Promise<number>;
  flush(ino: number, fh: number): Promise<void>;
  fsync(ino: number, fh: number, datasync: number): Promise<void>;
  release(ino: number, fh: number): Promise<void>;

  // Create operations
  create(parent: number, name: string, mode: number, flags: number): Promise<FileStat>;
  mknod(parent: number, name: string, mode: number, rdev: number): Promise<FileStat>;
  mkdir(parent: number, name: string, mode: number): Promise<FileStat>;

  // Remove operations
  unlink(parent: number, name: string): Promise<void>;
  rmdir(parent: number, name: string): Promise<void>;

  // Link operations
  link(ino: number, newparent: number, newname: string): Promise<FileStat>;
  symlink(link: string, parent: number, name: string): Promise<FileStat>;
  readlink(ino: number): Promise<string>;

  // Rename
  rename(parent: number, name: string, newparent: number, newname: string, flags: number): Promise<void>;

  // Extended attributes
  setxattr(ino: number, name: string, value: Buffer, size: number, flags: number): Promise<void>;
  getxattr(ino: number, name: string, size: number): Promise<Buffer | number>;
  listxattr(ino: number, size: number): Promise<Buffer | number>;
  removexattr(ino: number, name: string): Promise<void>;

  // Other operations
  access(ino: number, mask: number): Promise<void>;
  statfs(ino: number): Promise<Statfs>;

  // Locking
  getlk(ino: number, fh: number): Promise<Flock>;
  setlk(ino: number, fh: number, sleep: number): Promise<void>;
  flock(ino: number, fh: number, op: number): Promise<void>;

  // Advanced operations
  bmap(ino: number, blocksize: number, idx: number): Promise<number>;
  ioctl(ino: number, cmd: number, in_buf: Buffer | null, in_bufsz: number, out_bufsz: number): Promise<{ result: number; out_buf?: Buffer }>;
  poll(ino: number, fh: number): Promise<number>;
  fallocate(ino: number, fh: number, offset: number, length: number, mode: number): Promise<void>;
  readdirplus(ino: number, size: number, off: number): Promise<DirEntry[]>;
  retrieve_reply?(ino: number, cookie: number, offset: number, buffer: Buffer): Promise<void>;
  statx?(ino: number, flags: number, mask: number): Promise<FileStat | null>;
  copy_file_range(ino_in: number, off_in: number, ino_out: number, off_out: number, len: number, flags: number): Promise<number>;
  lseek(ino: number, fh: number, off: number, whence: number): Promise<number>;
  tmpfile(parent: number, mode: number, flags: number): Promise<FileStat>;
}
```

### Creating Custom Providers

```typescript
import { FilesystemProvider, FileStat, DirEntry } from "@mount0/core";

class MyCustomProvider implements FilesystemProvider {
  async lookup(parent: number, name: string): Promise<FileStat | null> {
    // Implement lookup operation (find file/directory by name in parent)
  }

  async getattr(ino: number): Promise<FileStat | null> {
    // Implement stat operation using inode number
  }

  async readdir(ino: number, size: number, off: number): Promise<DirEntry[]> {
    // Implement directory listing using inode number
  }

  // ... implement other methods
}
```

## Packages

This is a monorepo containing multiple packages:

### Core

- **`@mount0/core`**: Core filesystem functionality and FUSE bindings

### Basic Providers

- **`@mount0/local`**: Local filesystem provider
- **`@mount0/memory`**: In-memory filesystem provider

### Advanced Providers

- **`@mount0/cache`**: Caching providers (write-through, write-back)
- **`@mount0/raid`**: RAID providers (RAID 0, 1, 5, 6)
- **`@mount0/multi`**: Multi-provider strategies (failover, quorum)
- **`@mount0/encrypted`**: Encrypted filesystem provider

### Backend Providers

- **`@mount0/s3`**: AWS S3 backend provider
- **`@mount0/ftp`**: FTP backend provider
- **`@mount0/ssh`**: SSH/SFTP backend provider
- **`@mount0/webdav`**: WebDAV backend provider
- **`@mount0/samba`**: Samba/CIFS backend provider

## Development

### Prerequisites

- Node.js 20.x or higher
- FUSE/WinFsp development headers (see Requirements)
  - macOS: macFUSE
  - Linux: libfuse3-dev
  - Windows: WinFsp (installed to default location)
- TypeScript 5.x
- **Windows only**: Visual Studio Build Tools or Visual Studio with C++ workload

### Setup

```bash
# Clone the repository
git clone https://github.com/mensreversa/mount0.git
cd mount0

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Run linting
npm run lint

# Format code
npm run format
```

### Building Native Module

The core package includes native FUSE/WinFsp bindings. To build:

**macOS/Linux:**

```bash
cd packages/core
npm run build:native
```

**Windows:**

1. Install [WinFsp](https://winfsp.dev/rel/) (download the installer)
2. Ensure WinFsp is installed to the default location (`C:\Program Files\WinFsp`)
3. Build the native module:

```bash
cd packages/core
npm run build:native
```

Note: The native build is optional. If FUSE/WinFsp headers are not found, only the TypeScript build will be executed.

## Examples

See the `examples/` directory for complete examples:

- **Basic**: Simple local filesystem mount
- **Combined**: Complex combinations of providers (RAID, encryption, caching, multi-provider strategies)

## Performance

Mount0 is designed for high performance:

- Zero-copy streaming where possible
- Parallel operation support
- Efficient caching strategies
- Native FUSE bindings for minimal overhead

## Contributing

Contributions are welcome! Please read our contributing guidelines and code of conduct before submitting pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT © [mensreversa](https://github.com/mensreversa)

## Support

- **Issues**: [GitHub Issues](https://github.com/mensreversa/mount0/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mensreversa/mount0/discussions)
- **Security**: [Security Policy](.github/SECURITY.md)

## Related Projects

- [serve0](https://github.com/mensreversa/serve0) - Programmable reverse proxy and edge gateway
- [openade](https://github.com/nopos-it/openade) - Italian fiscal receipts library
- [framv](https://github.com/framv/framv) - HTML to video frame exporter

---

Made with ❤️ by [mensreversa](https://github.com/mensreversa)
