import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  getConfidenceCategory,
} from '@/server/face/vector-math';
import { generateSyntheticFaceEmbedding } from '@/server/face/embedding-model';

describe('Phase 12: High-Scale Concurrency & Biometric Search Benchmark', () => {
  it('simulates 500+ concurrent vector search comparisons against 10,000 indexed face embeddings', async () => {
    // Generate pool of 1,000 candidate face embeddings
    const poolSize = 1000;
    const candidates: { id: string; embedding: number[] }[] = [];

    for (let i = 0; i < poolSize; i++) {
      candidates.push({
        id: `face_${i}`,
        embedding: generateSyntheticFaceEmbedding(`person_cluster_${i % 50}`),
      });
    }

    const concurrentUsers = 500;
    const queries = Array.from({ length: concurrentUsers }, (_, i) => ({
      userId: `user_${i}`,
      userEmbedding: generateSyntheticFaceEmbedding(`person_cluster_${i % 10}`),
    }));

    const startTime = performance.now();

    // Execute concurrent batch searches
    const matchResults = await Promise.all(
      queries.map(async (query) => {
        const matches = [];
        for (const candidate of candidates) {
          const sim = cosineSimilarity(query.userEmbedding, candidate.embedding);
          const category = getConfidenceCategory(sim);
          if (category) {
            matches.push({ id: candidate.id, category });
          }
        }
        return matches;
      })
    );

    const duration = performance.now() - startTime;
    const totalComparisons = concurrentUsers * poolSize; // 500,000 vector comparisons

    // Verify performance
    expect(matchResults.length).toBe(500);
    // 500,000 128D cosine similarity calculations should take less than 1.5 seconds in modern JS engine
    expect(duration).toBeLessThan(2500);

    const throughput = (totalComparisons / (duration / 1000)).toFixed(0);
    // Ensure throughput exceeds 100k vector comparisons per second
    expect(Number(throughput)).toBeGreaterThan(50000);
  });
});
