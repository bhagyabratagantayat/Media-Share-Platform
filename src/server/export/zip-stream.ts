import { Readable, Transform, PassThrough } from 'stream';
import * as zlib from 'zlib';
import * as path from 'path';

// IEEE 802.3 CRC32 Table
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function calculateCrc32(buffer: Buffer, prevCrc: number = 0): number {
  let crc = (prevCrc ^ -1) >>> 0;
  for (let i = 0; i < buffer.length; i++) {
    crc = (CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ -1) >>> 0;
}

export interface ZipEntryOptions {
  filename: string;
  comment?: string;
  modifiedDate?: Date;
  compress?: boolean; // If true, DEFLATE (8); if false/undefined, STORE (0) or DEFLATE based on file type
}

interface CentralDirectoryEntry {
  filename: Buffer;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  relativeOffset: number;
  compressionMethod: number;
  dosDate: number;
  dosTime: number;
}

/**
 * Converts a JavaScript Date to MS-DOS date and time integers for ZIP file headers.
 */
export function dateToDosDateTime(date: Date = new Date()): { dosDate: number; dosTime: number } {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const year = Math.max(1980, d.getFullYear());
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  const dosTime = (hours << 11) | (minutes << 5) | seconds;

  return { dosDate, dosTime };
}

/**
 * Sanitizes zip archive relative paths to protect against directory traversal attacks.
 * Replaces backslashes, removes leading slashes, strips dangerous '..' components,
 * and removes illegal filesystem characters.
 */
export function sanitizeZipEntryPath(rawPath: string): string {
  if (!rawPath) return 'unnamed_file';

  // Normalize path separators to forward slash
  let normalized = rawPath.replace(/\\/g, '/');

  // Remove drive letters (e.g., C:/)
  normalized = normalized.replace(/^[a-zA-Z]:\//, '');

  // Remove leading slashes
  normalized = normalized.replace(/^\/+/, '');

  // Split into components and filter out '.' and '..'
  const parts = normalized
    .split('/')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p !== '.' && p !== '..')
    // Remove characters that might be dangerous or cause cross-platform issues
    .map((p) => p.replace(/[\x00-\x1f\x7f:*?"<>|]/g, '_'));

  if (parts.length === 0) {
    return 'unnamed_file';
  }

  return parts.join('/');
}

/**
 * A fast, memory-bounded, zero-external-dependency streaming ZIP builder.
 * Emits standard PKZIP 2.0 archives capable of being uncompressed by standard tools.
 */
export class StreamingZipArchiver extends PassThrough {
  private entries: CentralDirectoryEntry[] = [];
  private offset = 0;
  private isStreamFinalized = false;
  private usedPaths = new Set<string>();

  constructor() {
    super();
  }

  /**
   * Resolves collision-free unique path inside the zip archive.
   */
  public getUniqueEntryPath(rawPath: string): string {
    const sanitized = sanitizeZipEntryPath(rawPath);
    if (!this.usedPaths.has(sanitized)) {
      this.usedPaths.add(sanitized);
      return sanitized;
    }

    const dir = path.dirname(sanitized);
    const ext = path.extname(sanitized);
    const base = path.basename(sanitized, ext);

    let counter = 1;
    let candidate = sanitized;
    while (this.usedPaths.has(candidate)) {
      const newBase = `${base}_${counter}${ext}`;
      candidate = dir === '.' ? newBase : `${dir}/${newBase}`;
      counter++;
    }

    this.usedPaths.add(candidate);
    return candidate;
  }

  /**
   * Appends an entry to the ZIP archive from a stream or buffer.
   */
  public async appendEntry(
    source: Readable | Buffer,
    options: ZipEntryOptions
  ): Promise<{ uncompressedSize: number; compressedSize: number; crc32: number }> {
    if (this.isStreamFinalized) {
      throw new Error('Cannot append entry to closed ZIP archiver.');
    }

    const uniquePath = this.getUniqueEntryPath(options.filename);
    const filenameBuffer = Buffer.from(uniquePath, 'utf8');
    const { dosDate, dosTime } = dateToDosDateTime(options.modifiedDate);

    // For already compressed formats (JPEG, MP4, WebP, PNG), STORE (0) is faster and doesn't waste CPU.
    // For other formats or if specified, use DEFLATE (8).
    const ext = path.extname(uniquePath).toLowerCase();
    const isAlreadyCompressed = ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.zip', '.gz'].includes(ext);
    const compressionMethod = options.compress ?? (!isAlreadyCompressed) ? 8 : 0;

    const entryOffset = this.offset;

    // Use streaming data descriptor (bit 3 set: 0x0008) so we don't need to know file size/CRC upfront
    const generalPurposeBitFlag = 0x0008 | 0x0800; // Bit 3 (data descriptor) + Bit 11 (UTF-8 filename)

    // Construct Local File Header (30 bytes + filename)
    const localHeader = Buffer.alloc(30 + filenameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature PK\x03\x04
    localHeader.writeUInt16LE(20, 4);          // Min version needed (2.0)
    localHeader.writeUInt16LE(generalPurposeBitFlag, 6); // Flags
    localHeader.writeUInt16LE(compressionMethod, 8);     // Method (0 or 8)
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(0, 14);          // CRC-32 (0 in local header when bit 3 is set)
    localHeader.writeUInt32LE(0, 18);          // Compressed size (0 when bit 3 set)
    localHeader.writeUInt32LE(0, 22);          // Uncompressed size (0 when bit 3 set)
    localHeader.writeUInt16LE(filenameBuffer.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28);          // Extra field length
    filenameBuffer.copy(localHeader, 30);

    this.write(localHeader);
    this.offset += localHeader.length;

    // Stream and compress the payload
    let crc = 0;
    let uncompressedSize = 0;
    let compressedSize = 0;

    const stream: Readable = Buffer.isBuffer(source) ? Readable.from(source) : source;

    await new Promise<void>((resolve, reject) => {
      let pipeline: Readable;

      if (compressionMethod === 8) {
        const deflater = zlib.createDeflateRaw({ level: 6 });
        pipeline = deflater;

        stream.on('data', (chunk: Buffer) => {
          crc = calculateCrc32(chunk, crc);
          uncompressedSize += chunk.length;
        });

        stream.on('error', (err: Error) => {
          deflater.destroy(err);
          reject(err);
        });

        stream.pipe(deflater);
      } else {
        pipeline = stream;

        stream.on('data', (chunk: Buffer) => {
          crc = calculateCrc32(chunk, crc);
          uncompressedSize += chunk.length;
        });

        stream.on('error', reject);
      }

      pipeline.on('data', (chunk: Buffer) => {
        compressedSize += chunk.length;
        this.write(chunk);
        this.offset += chunk.length;
      });

      pipeline.on('end', () => {
        resolve();
      });

      pipeline.on('error', (err) => {
        reject(err);
      });
    });

    // Write Data Descriptor (16 bytes with PK\x07\x08 signature)
    const dataDescriptor = Buffer.alloc(16);
    dataDescriptor.writeUInt32LE(0x08074b50, 0); // Signature PK\x07\x08
    dataDescriptor.writeUInt32LE(crc, 4);
    dataDescriptor.writeUInt32LE(compressedSize, 8);
    dataDescriptor.writeUInt32LE(uncompressedSize, 12);

    this.write(dataDescriptor);
    this.offset += dataDescriptor.length;

    // Save entry metadata for Central Directory
    this.entries.push({
      filename: filenameBuffer,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      relativeOffset: entryOffset,
      compressionMethod,
      dosDate,
      dosTime,
    });

    return {
      uncompressedSize,
      compressedSize,
      crc32: crc,
    };
  }

  /**
   * Finalizes the ZIP stream by writing the Central Directory and End of Central Directory record.
   */
  public async finalize(): Promise<void> {
    if (this.isStreamFinalized) return;
    this.isStreamFinalized = true;

    const centralDirectoryStartOffset = this.offset;
    let centralDirectorySize = 0;

    // Write each Central Directory Header (46 bytes + filename)
    for (const entry of this.entries) {
      const cdHeader = Buffer.alloc(46 + entry.filename.length);
      cdHeader.writeUInt32LE(0x02014b50, 0); // Signature PK\x01\x02
      cdHeader.writeUInt16LE(20, 4);          // Version made by (2.0)
      cdHeader.writeUInt16LE(20, 6);          // Version needed to extract (2.0)
      cdHeader.writeUInt16LE(0x0008 | 0x0800, 8); // Flags (Bit 3 + Bit 11 UTF-8)
      cdHeader.writeUInt16LE(entry.compressionMethod, 10);
      cdHeader.writeUInt16LE(entry.dosTime, 12);
      cdHeader.writeUInt16LE(entry.dosDate, 14);
      cdHeader.writeUInt32LE(entry.crc32, 16);
      cdHeader.writeUInt32LE(entry.compressedSize, 20);
      cdHeader.writeUInt32LE(entry.uncompressedSize, 24);
      cdHeader.writeUInt16LE(entry.filename.length, 28);
      cdHeader.writeUInt16LE(0, 30);          // Extra field length
      cdHeader.writeUInt16LE(0, 32);          // File comment length
      cdHeader.writeUInt16LE(0, 34);          // Disk number start
      cdHeader.writeUInt16LE(0, 36);          // Internal file attributes
      cdHeader.writeUInt32LE(0, 38);          // External file attributes
      cdHeader.writeUInt32LE(entry.relativeOffset, 42); // Relative offset of local header
      entry.filename.copy(cdHeader, 46);

      this.write(cdHeader);
      this.offset += cdHeader.length;
      centralDirectorySize += cdHeader.length;
    }

    // Write End of Central Directory Record (22 bytes)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // Signature PK\x05\x06
    eocd.writeUInt16LE(0, 4);          // Number of this disk
    eocd.writeUInt16LE(0, 6);          // Disk with central directory
    eocd.writeUInt16LE(this.entries.length, 8);  // Total entries on this disk
    eocd.writeUInt16LE(this.entries.length, 10); // Total entries in central directory
    eocd.writeUInt32LE(centralDirectorySize, 12); // Size of central directory
    eocd.writeUInt32LE(centralDirectoryStartOffset, 16); // Offset of start of central directory
    eocd.writeUInt16LE(0, 20);         // ZIP comment length

    this.write(eocd);
    this.offset += eocd.length;

    this.end();
  }

  /**
   * Returns the total current bytes written to the ZIP stream.
   */
  public getBytesWritten(): number {
    return this.offset;
  }

  /**
   * Returns the total number of entries written so far.
   */
  public getEntryCount(): number {
    return this.entries.length;
  }
}
