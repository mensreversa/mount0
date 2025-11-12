# @mount0/multi

Multi-provider strategies for mount0 (failover and quorum).

## Installation

```bash
npm install @mount0/multi
```

## Usage

### First Provider (Failover)

```typescript
import { mount0 } from '@mount0/core';
import { LocalProvider } from '@mount0/local';
import { FirstProvider } from '@mount0/multi';

const fs = mount0();
fs.handle(
  '/failover',
  new FirstProvider({
    providers: [new LocalProvider('/primary'), new LocalProvider('/secondary')],
  })
);
```

### Majority Provider (Quorum)

```typescript
import { MajorityProvider } from '@mount0/multi';
import { MemoryProvider } from '@mount0/memory';

fs.handle(
  '/quorum',
  new MajorityProvider({
    providers: [new MemoryProvider(), new MemoryProvider(), new MemoryProvider()],
  })
);
```

## License

MIT
