# Interface: FilesystemProvider

Defined in: [provider.ts:20](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L20)

## Methods

### access()

> **access**(`ino`, `mask`): `Promise`\<`void`\>

Defined in: [provider.ts:77](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L77)

#### Parameters

##### ino

`number`

##### mask

`number`

#### Returns

`Promise`\<`void`\>

***

### bmap()

> **bmap**(`ino`, `blocksize`, `idx`): `Promise`\<`number`\>

Defined in: [provider.ts:86](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L86)

#### Parameters

##### ino

`number`

##### blocksize

`number`

##### idx

`number`

#### Returns

`Promise`\<`number`\>

***

### copy\_file\_range()

> **copy\_file\_range**(`ino_in`, `off_in`, `ino_out`, `off_out`, `len`, `flags`): `Promise`\<`number`\>

Defined in: [provider.ts:99](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L99)

#### Parameters

##### ino\_in

`number`

##### off\_in

`number`

##### ino\_out

`number`

##### off\_out

`number`

##### len

`number`

##### flags

`number`

#### Returns

`Promise`\<`number`\>

***

### create()

> **create**(`parent`, `name`, `mode`, `flags`): `Promise`\<[`FileStat`](FileStat.md)\>

Defined in: [provider.ts:48](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L48)

#### Parameters

##### parent

`number`

##### name

`string`

##### mode

`number`

##### flags

`number`

#### Returns

`Promise`\<[`FileStat`](FileStat.md)\>

***

### destroy()?

> `optional` **destroy**(): `Promise`\<`void`\>

Defined in: [provider.ts:23](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L23)

#### Returns

`Promise`\<`void`\>

***

### fallocate()

> **fallocate**(`ino`, `fh`, `offset`, `length`, `mode`): `Promise`\<`void`\>

Defined in: [provider.ts:95](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L95)

#### Parameters

##### ino

`number`

##### fh

`number`

##### offset

`number`

##### length

`number`

##### mode

`number`

#### Returns

`Promise`\<`void`\>

***

### flock()

> **flock**(`ino`, `fh`, `op`): `Promise`\<`void`\>

Defined in: [provider.ts:83](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L83)

#### Parameters

##### ino

`number`

##### fh

`number`

##### op

`number`

#### Returns

`Promise`\<`void`\>

***

### flush()

> **flush**(`ino`, `fh`): `Promise`\<`void`\>

Defined in: [provider.ts:43](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L43)

#### Parameters

##### ino

`number`

##### fh

`number`

#### Returns

`Promise`\<`void`\>

***

### forget()?

> `optional` **forget**(`ino`, `nlookup`): `Promise`\<`void`\>

Defined in: [provider.ts:24](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L24)

#### Parameters

##### ino

`number`

##### nlookup

`number`

#### Returns

`Promise`\<`void`\>

***

### forget\_multi()?

> `optional` **forget\_multi**(`forgets`): `Promise`\<`void`\>

Defined in: [provider.ts:25](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L25)

#### Parameters

##### forgets

`object`[]

#### Returns

`Promise`\<`void`\>

***

### fsync()

> **fsync**(`ino`, `fh`, `datasync`): `Promise`\<`void`\>

Defined in: [provider.ts:44](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L44)

#### Parameters

##### ino

`number`

##### fh

`number`

##### datasync

`number`

#### Returns

`Promise`\<`void`\>

***

### fsyncdir()

> **fsyncdir**(`ino`, `fh`, `datasync`): `Promise`\<`void`\>

Defined in: [provider.ts:36](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L36)

#### Parameters

##### ino

`number`

##### fh

`number`

##### datasync

`number`

#### Returns

`Promise`\<`void`\>

***

### getattr()

> **getattr**(`ino`): `Promise`\<[`FileStat`](FileStat.md) \| `null`\>

Defined in: [provider.ts:29](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L29)

#### Parameters

##### ino

`number`

#### Returns

`Promise`\<[`FileStat`](FileStat.md) \| `null`\>

***

### getlk()

> **getlk**(`ino`, `fh`): `Promise`\<[`Flock`](Flock.md)\>

Defined in: [provider.ts:81](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L81)

#### Parameters

##### ino

`number`

##### fh

`number`

#### Returns

`Promise`\<[`Flock`](Flock.md)\>

***

### getxattr()

> **getxattr**(`ino`, `name`, `size`): `Promise`\<`number` \| `Buffer`\<`ArrayBufferLike`\>\>

Defined in: [provider.ts:72](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L72)

#### Parameters

##### ino

`number`

##### name

`string`

##### size

`number`

#### Returns

`Promise`\<`number` \| `Buffer`\<`ArrayBufferLike`\>\>

***

### init()?

> `optional` **init**(): `Promise`\<`void`\>

Defined in: [provider.ts:22](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L22)

#### Returns

`Promise`\<`void`\>

***

### ioctl()

> **ioctl**(`ino`, `cmd`, `in_buf`, `in_bufsz`, `out_bufsz`): `Promise`\<\{ `out_buf?`: `Buffer`\<`ArrayBufferLike`\>; `result`: `number`; \}\>

Defined in: [provider.ts:87](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L87)

#### Parameters

##### ino

`number`

##### cmd

`number`

##### in\_buf

`Buffer`\<`ArrayBufferLike`\> | `null`

##### in\_bufsz

`number`

##### out\_bufsz

`number`

#### Returns

`Promise`\<\{ `out_buf?`: `Buffer`\<`ArrayBufferLike`\>; `result`: `number`; \}\>

***

### link()

> **link**(`ino`, `newparent`, `newname`): `Promise`\<[`FileStat`](FileStat.md)\>

Defined in: [provider.ts:57](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L57)

#### Parameters

##### ino

`number`

##### newparent

`number`

##### newname

`string`

#### Returns

`Promise`\<[`FileStat`](FileStat.md)\>

***

### listxattr()

> **listxattr**(`ino`, `size`): `Promise`\<`number` \| `Buffer`\<`ArrayBufferLike`\>\>

Defined in: [provider.ts:73](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L73)

#### Parameters

##### ino

`number`

##### size

`number`

#### Returns

`Promise`\<`number` \| `Buffer`\<`ArrayBufferLike`\>\>

***

### lookup()

> **lookup**(`parent`, `name`): `Promise`\<[`FileStat`](FileStat.md) \| `null`\>

Defined in: [provider.ts:28](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L28)

#### Parameters

##### parent

`number`

##### name

`string`

#### Returns

`Promise`\<[`FileStat`](FileStat.md) \| `null`\>

***

### lseek()

> **lseek**(`ino`, `fh`, `off`, `whence`): `Promise`\<`number`\>

Defined in: [provider.ts:107](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L107)

#### Parameters

##### ino

`number`

##### fh

`number`

##### off

`number`

##### whence

`number`

#### Returns

`Promise`\<`number`\>

***

### mkdir()

> **mkdir**(`parent`, `name`, `mode`): `Promise`\<[`FileStat`](FileStat.md)\>

Defined in: [provider.ts:50](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L50)

#### Parameters

##### parent

`number`

##### name

`string`

##### mode

`number`

#### Returns

`Promise`\<[`FileStat`](FileStat.md)\>

***

### mknod()

> **mknod**(`parent`, `name`, `mode`, `rdev`): `Promise`\<[`FileStat`](FileStat.md)\>

Defined in: [provider.ts:49](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L49)

#### Parameters

##### parent

`number`

##### name

`string`

##### mode

`number`

##### rdev

`number`

#### Returns

`Promise`\<[`FileStat`](FileStat.md)\>

***

### open()

> **open**(`ino`, `flags`, `mode?`): `Promise`\<`number`\>

Defined in: [provider.ts:39](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L39)

#### Parameters

##### ino

`number`

##### flags

`number`

##### mode?

`number`

#### Returns

`Promise`\<`number`\>

***

### opendir()

> **opendir**(`ino`, `flags`): `Promise`\<`number`\>

Defined in: [provider.ts:34](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L34)

#### Parameters

##### ino

`number`

##### flags

`number`

#### Returns

`Promise`\<`number`\>

***

### poll()

> **poll**(`ino`, `fh`): `Promise`\<`number`\>

Defined in: [provider.ts:94](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L94)

#### Parameters

##### ino

`number`

##### fh

`number`

#### Returns

`Promise`\<`number`\>

***

### read()

> **read**(`ino`, `fh`, `buffer`, `off`, `length`): `Promise`\<`number`\>

Defined in: [provider.ts:40](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L40)

#### Parameters

##### ino

`number`

##### fh

`number`

##### buffer

`Buffer`

##### off

`number`

##### length

`number`

#### Returns

`Promise`\<`number`\>

***

### readdir()

> **readdir**(`ino`, `size`, `off`): `Promise`\<[`DirEntry`](DirEntry.md)[]\>

Defined in: [provider.ts:33](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L33)

#### Parameters

##### ino

`number`

##### size

`number`

##### off

`number`

#### Returns

`Promise`\<[`DirEntry`](DirEntry.md)[]\>

***

### readdirplus()

> **readdirplus**(`ino`, `size`, `off`): `Promise`\<[`DirEntry`](DirEntry.md)[]\>

Defined in: [provider.ts:96](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L96)

#### Parameters

##### ino

`number`

##### size

`number`

##### off

`number`

#### Returns

`Promise`\<[`DirEntry`](DirEntry.md)[]\>

***

### readlink()

> **readlink**(`ino`): `Promise`\<`string`\>

Defined in: [provider.ts:59](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L59)

#### Parameters

##### ino

`number`

#### Returns

`Promise`\<`string`\>

***

### release()

> **release**(`ino`, `fh`): `Promise`\<`void`\>

Defined in: [provider.ts:45](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L45)

#### Parameters

##### ino

`number`

##### fh

`number`

#### Returns

`Promise`\<`void`\>

***

### releasedir()

> **releasedir**(`ino`, `fh`): `Promise`\<`void`\>

Defined in: [provider.ts:35](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L35)

#### Parameters

##### ino

`number`

##### fh

`number`

#### Returns

`Promise`\<`void`\>

***

### removexattr()

> **removexattr**(`ino`, `name`): `Promise`\<`void`\>

Defined in: [provider.ts:74](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L74)

#### Parameters

##### ino

`number`

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### rename()

> **rename**(`parent`, `name`, `newparent`, `newname`, `flags`): `Promise`\<`void`\>

Defined in: [provider.ts:62](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L62)

#### Parameters

##### parent

`number`

##### name

`string`

##### newparent

`number`

##### newname

`string`

##### flags

`number`

#### Returns

`Promise`\<`void`\>

***

### retrieve\_reply()?

> `optional` **retrieve\_reply**(`ino`, `cookie`, `offset`, `buffer`): `Promise`\<`void`\>

Defined in: [provider.ts:97](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L97)

#### Parameters

##### ino

`number`

##### cookie

`number`

##### offset

`number`

##### buffer

`Buffer`

#### Returns

`Promise`\<`void`\>

***

### rmdir()

> **rmdir**(`parent`, `name`): `Promise`\<`void`\>

Defined in: [provider.ts:54](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L54)

#### Parameters

##### parent

`number`

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### setattr()

> **setattr**(`ino`, `to_set`, `attr`): `Promise`\<`void`\>

Defined in: [provider.ts:30](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L30)

#### Parameters

##### ino

`number`

##### to\_set

`number`

##### attr

[`FileStat`](FileStat.md)

#### Returns

`Promise`\<`void`\>

***

### setlk()

> **setlk**(`ino`, `fh`, `sleep`): `Promise`\<`void`\>

Defined in: [provider.ts:82](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L82)

#### Parameters

##### ino

`number`

##### fh

`number`

##### sleep

`number`

#### Returns

`Promise`\<`void`\>

***

### setxattr()

> **setxattr**(`ino`, `name`, `value`, `size`, `flags`): `Promise`\<`void`\>

Defined in: [provider.ts:71](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L71)

#### Parameters

##### ino

`number`

##### name

`string`

##### value

`Buffer`

##### size

`number`

##### flags

`number`

#### Returns

`Promise`\<`void`\>

***

### statfs()

> **statfs**(`ino`): `Promise`\<[`Statfs`](Statfs.md)\>

Defined in: [provider.ts:78](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L78)

#### Parameters

##### ino

`number`

#### Returns

`Promise`\<[`Statfs`](Statfs.md)\>

***

### statx()?

> `optional` **statx**(`ino`, `flags`, `mask`): `Promise`\<[`FileStat`](FileStat.md) \| `null`\>

Defined in: [provider.ts:98](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L98)

#### Parameters

##### ino

`number`

##### flags

`number`

##### mask

`number`

#### Returns

`Promise`\<[`FileStat`](FileStat.md) \| `null`\>

***

### symlink()

> **symlink**(`link`, `parent`, `name`): `Promise`\<[`FileStat`](FileStat.md)\>

Defined in: [provider.ts:58](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L58)

#### Parameters

##### link

`string`

##### parent

`number`

##### name

`string`

#### Returns

`Promise`\<[`FileStat`](FileStat.md)\>

***

### tmpfile()

> **tmpfile**(`parent`, `mode`, `flags`): `Promise`\<[`FileStat`](FileStat.md)\>

Defined in: [provider.ts:108](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L108)

#### Parameters

##### parent

`number`

##### mode

`number`

##### flags

`number`

#### Returns

`Promise`\<[`FileStat`](FileStat.md)\>

***

### unlink()

> **unlink**(`parent`, `name`): `Promise`\<`void`\>

Defined in: [provider.ts:53](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L53)

#### Parameters

##### parent

`number`

##### name

`string`

#### Returns

`Promise`\<`void`\>

***

### write()

> **write**(`ino`, `fh`, `buffer`, `off`, `length`): `Promise`\<`number`\>

Defined in: [provider.ts:41](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L41)

#### Parameters

##### ino

`number`

##### fh

`number`

##### buffer

`Buffer`

##### off

`number`

##### length

`number`

#### Returns

`Promise`\<`number`\>

***

### write\_buf()?

> `optional` **write\_buf**(`ino`, `fh`, `buffer`, `off`, `size`): `Promise`\<`number`\>

Defined in: [provider.ts:42](https://github.com/mensreversa/mount0/blob/00d47e84d88edd585a89985a69c0e82473acd0d7/packages/core/src/provider.ts#L42)

#### Parameters

##### ino

`number`

##### fh

`number`

##### buffer

`Buffer`

##### off

`number`

##### size

`number`

#### Returns

`Promise`\<`number`\>
