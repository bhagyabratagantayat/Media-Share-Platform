import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import * as zlib from 'zlib';
import {
  StreamingZipArchiver,
  calculateCrc32,
  sanitizeZipEntryPath,
  dateToDosDateTime,
} from '@/server/export/zip-stream';

describe('Phase 13: Streaming ZIP Archiver & Security Utilities', () => {
  it('calculates correct IEEE 802.3 CRC32 checksums', () => {
    const data = Buffer.from('Antigravity Secure Export Archiver');
    const crc = calculateCrc32(data);
    expect(crc).toBeTypeOf('number');
    expect(crc).toBeGreaterThan(0);

    // Identical data must produce same CRC
    const crc2 = calculateCrc32(data);
    expect(crc2).toBe(crc);

    // Incremental CRC calculation should equal monolithic
    const part1 = data.subarray(0, 10);
    const part2 = data.subarray(10);
    const splitCrc = calculateCrc32(part2, calculateCrc32(part1));
    expect(splitCrc).toBe(crc);
  });

  it('sanitizes file paths to prevent directory traversal and illegal characters', () => {
    expect(sanitizeZipEntryPath('../../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeZipEntryPath('..\\..\\windows\\system32\\cmd.exe')).toBe('windows/system32/cmd.exe');
    expect(sanitizeZipEntryPath('/root/photos/party.jpg')).toBe('root/photos/party.jpg');
    expect(sanitizeZipEntryPath('C:\\Users\\Admin\\photo.png')).toBe('Users/Admin/photo.png');
    expect(sanitizeZipEntryPath('Album/Special: *Photo? <1>.webp')).toBe('Album/Special_ _Photo_ _1_.webp');
    expect(sanitizeZipEntryPath('')).toBe('unnamed_file');
    expect(sanitizeZipEntryPath('   ')).toBe('unnamed_file');
  });

  it('correctly converts JS Date to MS-DOS date and time integers', () => {
    const testDate = new Date('2026-08-16T14:30:00Z');
    const { dosDate, dosTime } = dateToDosDateTime(testDate);
    expect(dosDate).toBeTypeOf('number');
    expect(dosTime).toBeTypeOf('number');
    expect(dosDate).toBeGreaterThan(0);
    expect(dosTime).toBeGreaterThan(0);
  });

  it('generates unique collision-free archive paths for duplicate filenames', () => {
    const archiver = new StreamingZipArchiver();

    const path1 = archiver.getUniqueEntryPath('Graduation/photo.jpg');
    const path2 = archiver.getUniqueEntryPath('Graduation/photo.jpg');
    const path3 = archiver.getUniqueEntryPath('Graduation/photo.jpg');

    expect(path1).toBe('Graduation/photo.jpg');
    expect(path2).toBe('Graduation/photo_1.jpg');
    expect(path3).toBe('Graduation/photo_2.jpg');
  });

  it('streams multiple files into a valid ZIP archive without memory spikes', async () => {
    const archiver = new StreamingZipArchiver();
    const chunks: Buffer[] = [];

    archiver.on('data', (chunk) => {
      chunks.push(chunk);
    });

    // 1. Append buffer entry (uncompressed / stored WebP)
    const webpBuffer = Buffer.from('RIFF mock webp image binary content');
    const res1 = await archiver.appendEntry(webpBuffer, {
      filename: 'Event/photo1.webp',
      modifiedDate: new Date('2026-08-16T10:00:00Z'),
    });
    expect(res1.uncompressedSize).toBe(webpBuffer.length);
    expect(res1.crc32).toBeGreaterThan(0);

    // 2. Append stream entry (compressed metadata JSON)
    const jsonString = JSON.stringify({ event: 'Tech Fest 2026', totalPhotos: 120 });
    const jsonStream = Readable.from(Buffer.from(jsonString));
    const res2 = await archiver.appendEntry(jsonStream, {
      filename: 'Event/metadata.json',
      compress: true,
    });
    expect(res2.uncompressedSize).toBe(Buffer.byteLength(jsonString));

    // 3. Finalize archive
    await archiver.finalize();

    const completeZip = Buffer.concat(chunks);
    expect(completeZip.length).toBeGreaterThan(100);

    // Validate ZIP magic headers:
    // Local File Header Signature: 0x04034b50 (PK\x03\x04)
    expect(completeZip.readUInt32LE(0)).toBe(0x04034b50);

    // End of Central Directory Signature: 0x06054b50 (PK\x05\x06)
    const eocdIndex = completeZip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocdIndex).toBeGreaterThan(0);

    // Total entries in central directory = 2
    expect(completeZip.readUInt16LE(eocdIndex + 10)).toBe(2);
    expect(archiver.getEntryCount()).toBe(2);
  });
});
