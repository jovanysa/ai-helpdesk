import { cosine, fromBlob, toBlob } from './vectors';

describe('vectors', () => {
  it('round-trips vectors through a BLOB', () => {
    expect([...fromBlob(toBlob([0.5, -1, 2]))]).toEqual([0.5, -1, 2]);
  });

  it('reads a BLOB that starts at an odd byte offset', () => {
    const blob = toBlob([1.5, 2.5, -3]);
    const padded = new Uint8Array(blob.length + 1);
    padded.set(blob, 1);
    expect([...fromBlob(new Uint8Array(padded.buffer, 1, blob.length))]).toEqual([1.5, 2.5, -3]);
  });

  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 1], [-1, -1])).toBeCloseTo(-1);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});
