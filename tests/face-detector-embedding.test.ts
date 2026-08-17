import { describe, it, expect } from 'vitest';
import {
  l2Norm,
  normalizeVector,
  dotProduct,
  cosineSimilarity,
  cosineDistance,
  validateEmbedding,
  serializeEmbedding,
  deserializeEmbedding,
  getConfidenceCategory,
} from '@/server/face/vector-math';
import {
  generateFaceEmbedding,
  generateSyntheticFaceEmbedding,
  CURRENT_FACE_MODEL,
} from '@/server/face/embedding-model';
import {
  detectFacesInImage,
  validateSelfieQuality,
} from '@/server/face/detector-engine';
import sharp from 'sharp';

describe('Phase 12: Vector Mathematics & Embedding Precision', () => {
  it('enforces calibrated 128-dimensional embedding requirements', () => {
    expect(CURRENT_FACE_MODEL.dimension).toBe(128);
    expect(CURRENT_FACE_MODEL.version).toBe('face-model-v1');
    expect(CURRENT_FACE_MODEL.minSimilarityThreshold).toBe(0.72);
    expect(CURRENT_FACE_MODEL.highConfidenceThreshold).toBe(0.82);
  });

  it('normalizes vectors to exact unit length (L2 norm = 1.0)', () => {
    const raw = [3, 4, 0, 0];
    const normalized = normalizeVector(raw);
    expect(l2Norm(normalized)).toBeCloseTo(1.0, 6);
    expect(normalized[0]).toBeCloseTo(0.6, 6);
    expect(normalized[1]).toBeCloseTo(0.8, 6);
  });

  it('rejects invalid or non-finite vectors during validation', () => {
    expect(() => validateEmbedding([1, 2, NaN], 3)).toThrow(/non-numeric or infinite/i);
    expect(() => validateEmbedding([1, 2, Infinity], 3)).toThrow(/non-numeric or infinite/i);
    expect(() => validateEmbedding([1, 2], 128)).toThrow(/expected 128, got 2/i);
    expect(() => validateEmbedding('not-an-array' as any, 128)).toThrow(/must be an array/i);
  });

  it('computes exact cosine similarity and cosine distance for unit vectors', () => {
    const v1 = generateSyntheticFaceEmbedding('person_A');
    const v2 = generateSyntheticFaceEmbedding('person_A'); // Identical
    const v3 = generateSyntheticFaceEmbedding('person_B'); // Different person

    expect(v1.length).toBe(128);
    expect(v2.length).toBe(128);
    expect(v3.length).toBe(128);

    // Identical vector similarity must equal 1.0
    const simSame = cosineSimilarity(v1, v2);
    expect(simSame).toBeCloseTo(1.0, 5);
    expect(cosineDistance(v1, v2)).toBeCloseTo(0.0, 5);

    // Different vectors have lower similarity
    const simDiff = cosineSimilarity(v1, v3);
    expect(simDiff).toBeLessThan(0.72);
    expect(cosineDistance(v1, v3)).toBeGreaterThan(0.28);
  });

  it('correctly maps calibrated similarity thresholds into privacy confidence categories', () => {
    expect(getConfidenceCategory(0.95)).toBe('High Confidence');
    expect(getConfidenceCategory(0.82)).toBe('High Confidence');
    expect(getConfidenceCategory(0.819)).toBe('Likely Match');
    expect(getConfidenceCategory(0.72)).toBe('Likely Match');
    expect(getConfidenceCategory(0.719)).toBeNull();
    expect(getConfidenceCategory(0.45)).toBeNull();
  });

  it('serializes and deserializes embedding JSON safely without data corruption', () => {
    const original = generateSyntheticFaceEmbedding('test_roundtrip');
    const serialized = serializeEmbedding(original);
    const deserialized = deserializeEmbedding(serialized);

    expect(deserialized.length).toBe(128);
    for (let i = 0; i < 128; i++) {
      expect(deserialized[i]).toBeCloseTo(original[i], 6);
    }
  });
});

describe('Phase 12: Face Detection & Quality Validation Engine', () => {
  it('detects single face in valid image and passes quality validation', async () => {
    // Generate valid test image buffer (300x300 JPEG)
    const validImageBuffer = await sharp({
      create: {
        width: 300,
        height: 300,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await detectFacesInImage(validImageBuffer);
    expect(result.faceCount).toBe(1);
    expect(result.faces.length).toBe(1);

    const face = validateSelfieQuality(result);
    expect(face.isFrontal).toBe(true);
    expect(face.qualityScore).toBeGreaterThanOrEqual(0.6);

    const embedding = await generateFaceEmbedding(validImageBuffer, face);
    expect(embedding.dimension).toBe(128);
    expect(embedding.modelVersion).toBe('face-model-v1');
    expect(l2Norm(embedding.embedding)).toBeCloseTo(1.0, 5);
  });

  it('rejects image with dimensions below minimum threshold', async () => {
    const tinyBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 100, g: 100, b: 100 },
      },
    })
      .jpeg()
      .toBuffer();

    const result = await detectFacesInImage(tinyBuffer, { minImageDimension: 150 });
    expect(result.faceCount).toBe(0);
    expect(() => validateSelfieQuality(result)).toThrow(/No detectable face/i);
  });

  it('rejects selfie when multiple faces are present (Data Minimization & Opt-in Guarantee)', () => {
    const multiFaceResult = {
      faceCount: 2,
      faces: [
        {
          boundingBox: { x: 10, y: 10, width: 80, height: 80 },
          confidence: 0.95,
          qualityScore: 0.85,
          isFrontal: true,
        },
        {
          boundingBox: { x: 120, y: 10, width: 80, height: 80 },
          confidence: 0.92,
          qualityScore: 0.88,
          isFrontal: true,
        },
      ],
      imageWidth: 400,
      imageHeight: 400,
    };

    expect(() => validateSelfieQuality(multiFaceResult)).toThrow(/Multiple faces \(2\) detected/i);
  });

  it('rejects selfie when image quality is too low or blurry', () => {
    const lowQualityResult = {
      faceCount: 1,
      faces: [
        {
          boundingBox: { x: 50, y: 50, width: 80, height: 80 },
          confidence: 0.7,
          qualityScore: 0.45, // Below 0.6 threshold
          isFrontal: true,
        },
      ],
      imageWidth: 400,
      imageHeight: 400,
    };

    expect(() => validateSelfieQuality(lowQualityResult)).toThrow(/quality is too low or blurry/i);
  });
});
