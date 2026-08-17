import { env } from '@/config/env';

/**
 * Calculates the L2 norm (magnitude) of a vector.
 */
export function l2Norm(vec: number[]): number {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i];
  }
  return Math.sqrt(sumSq);
}

/**
 * Normalizes a vector to unit length (L2 norm = 1.0).
 * Throws if vector is zero or invalid.
 */
export function normalizeVector(vec: number[]): number[] {
  if (!Array.isArray(vec) || vec.length === 0) {
    throw new Error('Invalid vector provided for normalization');
  }

  const norm = l2Norm(vec);
  if (norm === 0 || !isFinite(norm)) {
    throw new Error('Cannot normalize zero or non-finite vector');
  }

  const normalized = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    const val = vec[i] / norm;
    if (!isFinite(val)) {
      throw new Error(`Non-finite element at index ${i} during vector normalization`);
    }
    normalized[i] = val;
  }

  return normalized;
}

/**
 * Computes the dot product of two vectors of equal dimension.
 */
export function dotProduct(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch in dot product: ${a.length} vs ${b.length}`);
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Computes the Cosine Similarity between two vectors.
 * For normalized unit vectors, this equals the dot product.
 * Returns a value in the range [-1.0, 1.0].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: vector a (${a.length}) vs vector b (${b.length})`);
  }

  const normA = l2Norm(a);
  const normB = l2Norm(b);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct(a, b) / (normA * normB);
  // Clamp to [-1.0, 1.0] to guard against floating-point precision inaccuracies
  return Math.max(-1.0, Math.min(1.0, similarity));
}

/**
 * Computes the Cosine Distance: 1 - Cosine Similarity.
 * Returns a value in the range [0.0, 2.0].
 */
export function cosineDistance(a: number[], b: number[]): number {
  return 1.0 - cosineSimilarity(a, b);
}

/**
 * Validates whether an embedding meets required dimension and finite constraints.
 */
export function validateEmbedding(vec: unknown, expectedDim: number = env?.FACE_EMBEDDING_DIMENSION || 128): number[] {
  if (!Array.isArray(vec)) {
    throw new Error('Face embedding must be an array of numbers');
  }

  if (vec.length !== expectedDim) {
    throw new Error(`Invalid face embedding dimension: expected ${expectedDim}, got ${vec.length}`);
  }

  for (let i = 0; i < vec.length; i++) {
    const val = vec[i];
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val)) {
      throw new Error(`Face embedding contains non-numeric or infinite value at index ${i}`);
    }
  }

  return vec as number[];
}

/**
 * Serializes an embedding array to JSON for database storage.
 */
export function serializeEmbedding(vec: number[]): string {
  const validated = validateEmbedding(vec);
  return JSON.stringify(validated);
}

/**
 * Deserializes an embedding JSON string back into a verified number array.
 */
export function deserializeEmbedding(jsonStr: string, expectedDim: number = env?.FACE_EMBEDDING_DIMENSION || 128): number[] {
  try {
    const parsed = JSON.parse(jsonStr);
    return validateEmbedding(parsed, expectedDim);
  } catch (err: any) {
    throw new Error(`Failed to deserialize face embedding: ${err.message}`);
  }
}

/**
 * Categorizes match confidence based on calibrated threshold boundaries.
 */
export function getConfidenceCategory(
  similarity: number,
  highThreshold: number = env?.FACE_HIGH_CONFIDENCE_THRESHOLD || 0.82,
  minThreshold: number = env?.FACE_SIMILARITY_THRESHOLD || 0.72
): 'High Confidence' | 'Likely Match' | null {
  if (similarity >= highThreshold) {
    return 'High Confidence';
  }
  if (similarity >= minThreshold) {
    return 'Likely Match';
  }
  return null;
}
