---
sidebar_position: 1
slug: /
---

# Introduction

**Mount0** is a high-performance virtual filesystem designed for developers who need speed, flexibility, and zero-disk footprint.

## Why Mount0?

Traditional filesystems interact with physical disks, which can be slow and cumbersome for transient data tasks like:
- **Testing**: creating thousands of temporary files for unit tests.
- **Mocking**: Simulating complex directory structures without polluting your hard drive.
- **Security**: Handling sensitive data in-memory without ever writing to disk.

Mount0 solves this by providing a FUSE-based interface to an in-memory filesystem structure.

## Key Features

- **🚀 Blazing Fast**: All operations happen in memory.
- **🛡️ Secure**: Data is wiped instantly when the process stops.
- **🔗 FUSE Powered**: Works with standard tools (ls, grep, cat) just like a real disk.
- **🛠️ Developer First**: TypeScript API for programmatic control.

## Getting Started

```bash
npm install mount0
```

```typescript
import { Mount0 } from 'mount0';

const fs = new Mount0();
await fs.mount('/tmp/my-virtual-drive');

// Write to the virtual drive
await fs.writeFile('/hello.txt', 'Hello World');
```
