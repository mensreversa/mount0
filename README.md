# mount0

> High-performance virtual filesystem for developers

Mount0 is a powerful TypeScript library that enables you to mount remote resources (S3 buckets, FTP servers, SSH file systems, WebDAV, Samba shares, and more) as local filesystems using FUSE (Filesystem in Userspace) on macOS/Linux and WinFsp on Windows. Built with performance and developer experience in mind, mount0 bridges the gap between web services and traditional file access.

## Features

- 🚀 **High Performance**: Native FUSE/WinFsp bindings with zero-copy streaming
- 🪟 **Cross-Platform**: Supports macOS, Linux, and Windows
- 🔌 **Multiple Backends**: Support for S3, FTP, SSH, WebDAV, Samba, and custom providers
- 💾 **Caching**: Built-in caching layer with configurable strategies
- 🔄 **Parallel Operations**: Concurrent file operations for improved throughput
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

For specific backend providers:

```bash
npm install @mount0/s3      # AWS S3 support
npm install @mount0/ftp      # FTP support
npm install @mount0/ssh      # SSH/SFTP support
npm install @mount0/webdav   # WebDAV support
npm install @mount0/samba    # Samba/CIFS support
```

## Quick Start

```typescript
import { mount, provider, mapping } from '@mount0/core';
import { LocalProvider } from '@mount0/core';

async function main() {
  const fs = await mount({
    mountpoint: '/tmp/mount0',
    providers: [provider('local', new LocalProvider('/path/to/directory'))],
    mappings: [mapping('/', 'local')],
  });

  console.log('Filesystem mounted at /tmp/mount0');

  // Keep the process alive
  await fs.loop();
}

main().catch(console.error);
```

## Usage

### Basic Mounting

```typescript
import { mount, provider, mapping } from '@mount0/core';
import { LocalProvider } from '@mount0/core';

const fs = await mount({
  mountpoint: '/mnt/myfs',
  providers: [provider('backend1', new LocalProvider('/path/to/data'))],
  mappings: [mapping('/', 'backend1')],
});

// Filesystem is now accessible at /mnt/myfs
await fs.loop(); // Keep running
```

### Multiple Backends

```typescript
import { mount, provider, mapping } from '@mount0/core';
import { LocalProvider } from '@mount0/core';
import { MemoryProvider } from '@mount0/core';

const fs = await mount({
  mountpoint: '/mnt/multi',
  providers: [
    provider('disk', new LocalProvider('/var/data')),
    provider('cache', new MemoryProvider()),
  ],
  mappings: [mapping('/data', 'disk'), mapping('/cache', 'cache')],
});
```

### With Caching

```typescript
import { mount, provider, mapping } from '@mount0/core';
import { LocalProvider } from '@mount0/core';
import { CacheProvider, CacheStrategy } from '@mount0/core';

const cachedProvider = new CacheProvider({
  provider: new LocalProvider('/path/to/data'),
  strategy: CacheStrategy.LRU,
  maxSize: 100 * 1024 * 1024, // 100MB
  ttl: 3600, // 1 hour
});

const fs = await mount({
  mountpoint: '/mnt/cached',
  providers: [provider('cached', cachedProvider)],
  mappings: [mapping('/', 'cached')],
});
```

### Graceful Shutdown

```typescript
const fs = await mount({
  /* ... */
});

// Handle shutdown signals
process.on('SIGINT', async () => {
  console.log('Unmounting...');
  await fs.unmount();
  process.exit(0);
});

await fs.loop();
```

## Architecture

Mount0 is built on a modular architecture:

- **Core**: FUSE bindings and filesystem abstraction
- **Providers**: Backend implementations (Local, Memory, S3, FTP, etc.)
- **Cache**: Caching layer with multiple strategies
- **Parallel**: Concurrent operation support

### Provider Interface

All providers implement the `FilesystemProvider` interface:

```typescript
interface FilesystemProvider {
  getattr(path: string): Promise<FileStat | null>;
  readdir(path: string): Promise<DirEntry[]>;
  open(path: string, flags: number, mode?: number): Promise<FileHandle>;
  read(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number>;
  write(handle: FileHandle, buffer: Buffer, offset: number, length: number): Promise<number>;
  create(path: string, mode: number): Promise<FileHandle>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, mode: number): Promise<void>;
  rmdir(path: string): Promise<void>;
  rename(oldpath: string, newpath: string): Promise<void>;
  truncate(path: string, length: number): Promise<void>;
  close(handle: FileHandle): Promise<void>;
}
```

### Creating Custom Providers

```typescript
import { FilesystemProvider, FileStat, DirEntry, FileHandle } from '@mount0/core';

class MyCustomProvider implements FilesystemProvider {
  async getattr(path: string): Promise<FileStat | null> {
    // Implement stat operation
  }

  async readdir(path: string): Promise<DirEntry[]> {
    // Implement directory listing
  }

  // ... implement other methods
}
```

## Packages

This is a monorepo containing multiple packages:

- **`@mount0/core`**: Core filesystem functionality and FUSE bindings
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
- **Benchmark**: Performance testing examples

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
