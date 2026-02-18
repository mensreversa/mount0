# @mount0/core

High-performance virtual filesystem core for mount0.

## Installation

```bash
npm install @mount0/core
```

## Usage

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";

const fs = mount0();
fs.handle("/", new LocalProvider("/path/to/data"));

await fs.mount("/mnt/myfs");
```

## Requirements

- **Node.js**: v20.x or higher
- **FUSE/WinFsp**:
  - **macOS**: [macFUSE](https://osxfuse.github.io/) 4.10.1+
  - **Linux**: `libfuse3-dev` 3.17.1+
  - **Windows**: [WinFsp](https://winfsp.dev/)

## License

MIT
