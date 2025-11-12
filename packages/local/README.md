# @mount0/local

Local filesystem provider for mount0.

## Installation

```bash
npm install @mount0/local
```

## Usage

```typescript
import { mount0 } from '@mount0/core';
import { LocalProvider } from '@mount0/local';

const fs = mount0();
fs.handle('/', new LocalProvider('/path/to/data'));

const { unmount, loop } = await fs.mount('/mnt/myfs');
await loop();
```

## License

MIT
