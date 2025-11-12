# @mount0/memory

In-memory filesystem provider for mount0.

## Installation

```bash
npm install @mount0/memory
```

## Usage

```typescript
import { mount0 } from '@mount0/core';
import { MemoryProvider } from '@mount0/memory';

const fs = mount0();
fs.handle('/cache', new MemoryProvider());

const { unmount, loop } = await fs.mount('/mnt/myfs');
await loop();
```

## License

MIT
