# @mount0/raid

RAID filesystem providers for mount0 (RAID 0, 1, 5, 6).

## Installation

```bash
npm install @mount0/raid
```

## Usage

### RAID 0 (Striping)

```typescript
import { mount0 } from "@mount0/core";
import { LocalProvider } from "@mount0/local";
import { Raid0Provider } from "@mount0/raid";

const fs = mount0();
fs.handle(
  "/fast",
  new Raid0Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2")],
    stripeSize: 128 * 1024,
  })
);
```

### RAID 1 (Mirroring)

```typescript
import { Raid1Provider } from "@mount0/raid";

fs.handle(
  "/backup",
  new Raid1Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2")],
  })
);
```

### RAID 5 (Parity)

```typescript
import { Raid5Provider } from "@mount0/raid";

fs.handle(
  "/data",
  new Raid5Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2"), new LocalProvider("/disk3")],
  })
);
```

### RAID 6 (Double Parity)

```typescript
import { Raid6Provider } from "@mount0/raid";

fs.handle(
  "/data",
  new Raid6Provider({
    providers: [new LocalProvider("/disk1"), new LocalProvider("/disk2"), new LocalProvider("/disk3"), new LocalProvider("/disk4")],
  })
);
```

## License

MIT
