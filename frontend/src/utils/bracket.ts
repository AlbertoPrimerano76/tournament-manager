export function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

export function getNextRoundPosition(currentPosition: number): number {
  return Math.ceil(currentPosition / 2)
}
