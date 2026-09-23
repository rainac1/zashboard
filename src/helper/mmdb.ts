import * as ipaddr from 'ipaddr.js'

export interface MMDBByteSource {
  readonly size: number
  read(offset: number, length: number): Promise<Uint8Array>
}

export interface MMDBMetadata {
  databaseType: string
  ipVersion: number
  nodeByteSize: number
  nodeCount: number
  recordSize: number
  searchTreeSize: number
}

interface DecodeCursor<T = unknown> {
  offset: number
  value: T
}

const DATA_SECTION_SEPARATOR_SIZE = 16
const METADATA_SEARCH_SIZE = 128 * 1024
const METADATA_START_MARKER = new Uint8Array([
  0xab, 0xcd, 0xef, 0x4d, 0x61, 0x78, 0x4d, 0x69, 0x6e, 0x64, 0x2e, 0x63, 0x6f, 0x6d,
])
const POINTER_VALUE_OFFSET = [0, 2048, 526336, 0]
const textDecoder = new TextDecoder()

enum DataType {
  Extended = 0,
  Pointer = 1,
  Utf8String = 2,
  Double = 3,
  Bytes = 4,
  Uint16 = 5,
  Uint32 = 6,
  Map = 7,
  Int32 = 8,
  Uint64 = 9,
  Uint128 = 10,
  Array = 11,
  Boolean = 14,
  Float = 15,
}

const readUint = (bytes: Uint8Array, offset = 0, length = bytes.length - offset) => {
  let value = 0

  for (let index = 0; index < length; index++) {
    value = value * 256 + bytes[offset + index]
  }

  return value
}

const toFiniteNumber = (value: unknown, field: string) => {
  const number = typeof value === 'bigint' ? Number(value) : value

  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new Error(`Invalid MMDB metadata field: ${field}`)
  }

  return number
}

class MMDBDecoder {
  constructor(
    private readonly source: MMDBByteSource,
    private readonly baseOffset: number,
  ) {}

  async decode(offset: number): Promise<DecodeCursor> {
    const controlByte = (await this.source.read(offset, 1))[0]
    let type = controlByte >> 5
    let valueOffset = offset + 1

    if (type === DataType.Pointer) {
      const pointer = await this.decodePointer(controlByte, valueOffset)
      const value = await this.decode(pointer.value)

      return { value: value.value, offset: pointer.offset }
    }

    if (type === DataType.Extended) {
      type = (await this.source.read(valueOffset, 1))[0] + 7
      valueOffset++

      if (type < DataType.Int32) {
        throw new Error(`Invalid extended MMDB type at offset ${offset}`)
      }
    }

    const size = await this.sizeFromControlByte(controlByte, valueOffset)

    return this.decodeByType(type, size.offset, size.value)
  }

  private async sizeFromControlByte(
    controlByte: number,
    offset: number,
  ): Promise<DecodeCursor<number>> {
    const size = controlByte & 0x1f

    if (size < 29) return { value: size, offset }
    if (size === 29) {
      return { value: 29 + (await this.source.read(offset, 1))[0], offset: offset + 1 }
    }
    if (size === 30) {
      return { value: 285 + readUint(await this.source.read(offset, 2)), offset: offset + 2 }
    }

    return { value: 65821 + readUint(await this.source.read(offset, 3)), offset: offset + 3 }
  }

  private async decodePointer(controlByte: number, offset: number): Promise<DecodeCursor<number>> {
    const pointerSize = (controlByte >> 3) & 3
    const bytes = await this.source.read(offset, pointerSize + 1)
    let packed: number

    switch (pointerSize) {
      case 0:
        packed = ((controlByte & 7) << 8) | bytes[0]
        break
      case 1:
        packed = (controlByte & 7) * 0x10000 + readUint(bytes)
        break
      case 2:
        packed = (controlByte & 7) * 0x1000000 + readUint(bytes)
        break
      default:
        packed = readUint(bytes)
    }

    return {
      value: this.baseOffset + POINTER_VALUE_OFFSET[pointerSize] + packed,
      offset: offset + pointerSize + 1,
    }
  }

  private async decodeByType(type: number, offset: number, size: number): Promise<DecodeCursor> {
    switch (type) {
      case DataType.Utf8String: {
        const bytes = await this.source.read(offset, size)

        return { value: textDecoder.decode(bytes), offset: offset + size }
      }
      case DataType.Double: {
        const bytes = await this.source.read(offset, 8)

        return {
          value: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(0),
          offset: offset + 8,
        }
      }
      case DataType.Bytes:
        return { value: await this.source.read(offset, size), offset: offset + size }
      case DataType.Uint16:
      case DataType.Uint32:
        return { value: await this.decodeUint(offset, size), offset: offset + size }
      case DataType.Map:
        return this.decodeMap(size, offset)
      case DataType.Int32:
        return { value: await this.decodeInt32(offset, size), offset: offset + size }
      case DataType.Uint64:
      case DataType.Uint128:
        return { value: await this.decodeBigUint(offset, size), offset: offset + size }
      case DataType.Array:
        return this.decodeArray(size, offset)
      case DataType.Boolean:
        return { value: size !== 0, offset }
      case DataType.Float: {
        const bytes = await this.source.read(offset, 4)

        return {
          value: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(0),
          offset: offset + 4,
        }
      }
      default:
        throw new Error(`Unknown MMDB type ${type} at offset ${offset}`)
    }
  }

  private async decodeMap(size: number, offset: number): Promise<DecodeCursor> {
    const value: Record<string, unknown> = {}

    for (let index = 0; index < size; index++) {
      const key = await this.decode(offset)
      const entry = await this.decode(key.offset)

      offset = entry.offset
      value[String(key.value)] = entry.value
    }

    return { value, offset }
  }

  private async decodeArray(size: number, offset: number): Promise<DecodeCursor> {
    const value = new Array<unknown>(size)

    for (let index = 0; index < size; index++) {
      const entry = await this.decode(offset)

      offset = entry.offset
      value[index] = entry.value
    }

    return { value, offset }
  }

  private async decodeUint(offset: number, size: number) {
    if (size === 0) return 0
    if (size > 4) throw new Error(`Invalid MMDB unsigned integer size: ${size}`)

    return readUint(await this.source.read(offset, size))
  }

  private async decodeInt32(offset: number, size: number) {
    if (size === 0) return 0
    if (size > 4) throw new Error(`Invalid MMDB signed integer size: ${size}`)

    const bytes = await this.source.read(offset, size)

    if (size < 4) return readUint(bytes)

    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(0)
  }

  private async decodeBigUint(offset: number, size: number) {
    if (size > 16) throw new Error(`Invalid MMDB large integer size: ${size}`)

    const bytes = await this.source.read(offset, size)
    let value = 0n

    for (const byte of bytes) value = (value << 8n) | BigInt(byte)

    return value
  }
}

const findMetadataOffset = async (source: MMDBByteSource) => {
  const length = Math.min(source.size, METADATA_SEARCH_SIZE)
  const start = source.size - length
  const tail = await source.read(start, length)

  for (let offset = tail.length - METADATA_START_MARKER.length; offset >= 0; offset--) {
    let matches = true

    for (let index = 0; index < METADATA_START_MARKER.length; index++) {
      if (tail[offset + index] !== METADATA_START_MARKER[index]) {
        matches = false
        break
      }
    }

    if (matches) return start + offset + METADATA_START_MARKER.length
  }

  throw new Error('MMDB metadata marker was not found')
}

const parseMetadata = async (source: MMDBByteSource): Promise<MMDBMetadata> => {
  const metadataOffset = await findMetadataOffset(source)
  const decoded = await new MMDBDecoder(source, metadataOffset).decode(metadataOffset)
  const raw = decoded.value as Record<string, unknown>
  const nodeCount = toFiniteNumber(raw.node_count, 'node_count')
  const recordSize = toFiniteNumber(raw.record_size, 'record_size')
  const ipVersion = toFiniteNumber(raw.ip_version, 'ip_version')

  if (![24, 28, 32].includes(recordSize)) throw new Error('Unsupported MMDB record size')
  if (![4, 6].includes(ipVersion)) throw new Error('Unsupported MMDB IP version')
  if (!Number.isSafeInteger(nodeCount) || nodeCount <= 0) throw new Error('Invalid MMDB node count')

  const nodeByteSize = recordSize / 4
  const searchTreeSize = nodeCount * nodeByteSize

  if (searchTreeSize + DATA_SECTION_SEPARATOR_SIZE >= metadataOffset) {
    throw new Error('Invalid MMDB search tree size')
  }

  return {
    databaseType: typeof raw.database_type === 'string' ? raw.database_type : '',
    ipVersion,
    nodeByteSize,
    nodeCount,
    recordSize,
    searchTreeSize,
  }
}

export class AsyncMMDBReader<T> {
  private readonly decoder: MMDBDecoder
  private readonly decodedRecords = new Map<number, Promise<T>>()
  private ipv4StartNodeNumber = 0

  private constructor(
    private readonly source: MMDBByteSource,
    readonly metadata: MMDBMetadata,
  ) {
    this.decoder = new MMDBDecoder(source, metadata.searchTreeSize + DATA_SECTION_SEPARATOR_SIZE)
  }

  static async open<T>(source: MMDBByteSource) {
    const reader = new AsyncMMDBReader<T>(source, await parseMetadata(source))

    reader.ipv4StartNodeNumber = await reader.findIPv4Start()

    return reader
  }

  async get(ipAddress: string): Promise<T | null> {
    if (!ipaddr.isValid(ipAddress)) return null

    const rawAddress = ipaddr.parse(ipAddress).toByteArray()
    const nodeCount = this.metadata.nodeCount
    let nodeNumber = rawAddress.length === 4 ? this.ipv4StartNodeNumber : 0

    for (let depth = 0; depth < rawAddress.length * 8 && nodeNumber < nodeCount; depth++) {
      const byte = rawAddress[depth >> 3]
      const bit = (byte >> (7 ^ (depth & 7))) & 1
      const [left, right] = await this.readNode(nodeNumber)

      nodeNumber = bit ? right : left
    }

    if (nodeNumber <= nodeCount) return null

    const offset = nodeNumber - nodeCount + this.metadata.searchTreeSize
    const cached = this.decodedRecords.get(offset)

    if (cached) {
      this.decodedRecords.delete(offset)
      this.decodedRecords.set(offset, cached)
      return cached
    }

    const decoded = this.decoder.decode(offset).then((entry) => entry.value as T)

    this.decodedRecords.set(offset, decoded)
    while (this.decodedRecords.size > 512) {
      const oldest = this.decodedRecords.keys().next().value

      if (oldest === undefined) break
      this.decodedRecords.delete(oldest)
    }

    try {
      return await decoded
    } catch (error) {
      this.decodedRecords.delete(offset)
      throw error
    }
  }

  private async findIPv4Start() {
    if (this.metadata.ipVersion === 4) return 0

    let nodeNumber = 0

    for (let depth = 0; depth < 96 && nodeNumber < this.metadata.nodeCount; depth++) {
      ;[nodeNumber] = await this.readNode(nodeNumber)
    }

    return nodeNumber
  }

  private async readNode(nodeNumber: number): Promise<[number, number]> {
    const bytes = await this.source.read(
      nodeNumber * this.metadata.nodeByteSize,
      this.metadata.nodeByteSize,
    )

    switch (this.metadata.recordSize) {
      case 24:
        return [readUint(bytes, 0, 3), readUint(bytes, 3, 3)]
      case 28:
        return [
          (bytes[3] & 0xf0) * 0x100000 + readUint(bytes, 0, 3),
          (bytes[3] & 0x0f) * 0x1000000 + readUint(bytes, 4, 3),
        ]
      case 32:
        return [readUint(bytes, 0, 4), readUint(bytes, 4, 4)]
      default:
        throw new Error('Unsupported MMDB record size')
    }
  }
}
