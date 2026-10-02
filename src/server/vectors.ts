/** Stores a vector as the raw bytes of a Float32Array (4 bytes per number). */
export function toBlob(vector: number[] | Float32Array): Uint8Array {
  const floats = vector instanceof Float32Array ? vector : Float32Array.from(vector);
  return new Uint8Array(floats.buffer.slice(floats.byteOffset, floats.byteOffset + floats.byteLength));
}

/** Copies first: a Float32Array view needs a 4-byte aligned offset, which a BLOB may not have. */
export function fromBlob(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.slice().buffer);
}

/** 1 = same direction (same meaning), 0 = unrelated. Returns 0 for an all-zero vector. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}
