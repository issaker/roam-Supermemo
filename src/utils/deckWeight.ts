import { DeckConfig } from '~/hooks/useSettings';

export function validateWeight(value: number): number {
  if (isNaN(value) || typeof value !== 'number') return 0;
  return Math.min(100, Math.max(0, value));
}

export function equalizeWeights(deckCount: number): number[] {
  if (deckCount === 0) return [];
  if (deckCount === 1) return [100];
  const baseWeight = Math.floor(100 / deckCount);
  const weights = new Array(deckCount).fill(baseWeight);
  const remainder = 100 - baseWeight * deckCount;
  for (let i = 0; i < remainder; i++) {
    weights[i] += 1;
  }
  return weights;
}

// 修改某个牌组权重后，只对被修改牌组下方的牌组按比例重分配，上方牌组保持不变
// 根因: 原实现会对所有其他牌组重分配，导致上方牌组权重被意外修改
// 方案: 仅将剩余权重分配给 changedIndex 之后的牌组，保证上方牌组不受影响
export function redistributeWeights(
  decks: DeckConfig[],
  changedIndex: number,
  newWeight: number
): DeckConfig[] {
  const result = decks.map((deck) => ({ ...deck }));
  const aboveSum = result.slice(0, changedIndex).reduce((sum, d) => sum + d.weight, 0);
  // 上方牌组已占用 aboveSum，当前牌组权重上限为 100 - aboveSum
  const maxAllowed = 100 - aboveSum;
  const clampedWeight = Math.min(validateWeight(newWeight), maxAllowed);
  result[changedIndex].weight = clampedWeight;

  const remaining = 100 - aboveSum - clampedWeight;

  if (remaining <= 0) {
    for (let i = changedIndex + 1; i < result.length; i++) {
      result[i].weight = 0;
    }
    return result;
  }

  const belowOriginalWeights = decks.slice(changedIndex + 1).map((d) => d.weight);
  const sumOfBelowWeights = belowOriginalWeights.reduce((a, b) => a + b, 0);

  if (sumOfBelowWeights === 0) {
    const belowCount = result.length - changedIndex - 1;
    if (belowCount === 0) return result;
    const equalWeights = equalizeWeights(belowCount);
    for (let i = 0; i < belowCount; i++) {
      result[changedIndex + 1 + i].weight = equalWeights[i];
    }
  } else {
    for (let i = changedIndex + 1; i < result.length; i++) {
      const originalWeight = decks[i].weight;
      result[i].weight = Math.ceil(remaining * (originalWeight / sumOfBelowWeights));
    }
  }

  const total = result.reduce((sum, d) => sum + d.weight, 0);

  if (total !== 100) {
    const diff = 100 - total;
    let targetIndex = -1;
    let highestWeight = -1;
    for (let i = changedIndex + 1; i < result.length; i++) {
      if (result[i].weight > highestWeight) {
        highestWeight = result[i].weight;
        targetIndex = i;
      }
    }
    if (targetIndex !== -1) {
      result[targetIndex].weight += diff;
    }
  }

  return result;
}
