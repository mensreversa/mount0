# @mount0/cache

Cache filesystem providers for mount0 with write-through and write-back strategies.

## Installation

```bash
npm install @mount0/cache
```

## Usage

### Write-Through Cache

```typescript
import { mount0 } from '@mount0/core';
import { LocalProvider } from '@mount0/local';
import { MemoryProvider } from '@mount0/memory';
import { WriteThroughCacheProvider } from '@mount0/cache';

const cachedProvider = new WriteThroughCacheProvider({
  master: new LocalProvider('/path/to/data'),
  slave: new MemoryProvider(),
});

const fs = mount0();
fs.handle('/', cachedProvider);
```

### Write-Back Cache

```typescript
import { WriteBackCacheProvider } from '@mount0/cache';

const cachedProvider = new WriteBackCacheProvider({
  master: new LocalProvider('/path/to/data'),
  slave: new MemoryProvider(),
});
```

## License

MIT
