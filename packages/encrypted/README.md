# @mount0/encrypted

Encrypted filesystem provider for mount0 with transparent encryption/decryption.

## Installation

```bash
npm install @mount0/encrypted
```

## Usage

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";
import { EncryptedProvider } from "@mount0/encrypted";

const fs = mount0();
fs.handle(
  "/secure",
  new EncryptedProvider({
    provider: new LocalProvider("/path/to/data"),
    password: "my-secret-password",
    algorithm: "aes-256-gcm",
  })
);

await fs.mount("/mnt/myfs");
```

## Supported Algorithms

- `aes-256-gcm` (default)
- `aes-128-gcm`
- Other Node.js crypto supported algorithms

## License

MIT
