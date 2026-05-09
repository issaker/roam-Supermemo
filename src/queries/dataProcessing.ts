import { getStringBetween, parseConfigString, parseRoamDateString } from '~/utils/string';
import * as stringUtils from '~/utils/string';
import * as dateUtils from '~/utils/date';
import { resolveReviewConfig } from '~/models/session';
import { TagCardSets, RenderMode } from '~/models/practice';
import { generateNewSession } from './utils';
import { parseDeckConfigs } from '~/utils/deckConfig';

export const SESSION_SNAPSHOT_KEYS = [
  'algorithm',
  'interaction',
  'nextDueDate',
  'sm2_repetitions',
  'sm2_interval',
  'sm2_eFactor',
  'sm2_grade',
  'progressive_repetitions',
  'progressive_interval',
  'fixed_multiplier',
  'fixed_unit',
] as const;

const mergeSessionSnapshot = (
  previousSnapshot: Record<string, any> | undefined,
  rawSession: Record<string, any>
) => {
  const nextSnapshot: Record<string, any> = {
    ...(previousSnapshot || {}),
    dateCreated: rawSession.dateCreated,
  };

  for (const key of SESSION_SNAPSHOT_KEYS) {
    if (rawSession[key] !== undefined) {
      nextSnapshot[key] = rawSession[key];
    }
  }

  const config = resolveReviewConfig(nextSnapshot.algorithm, nextSnapshot.interaction);
  nextSnapshot.algorithm = config.algorithm;
  nextSnapshot.interaction = config.interaction;

  return nextSnapshot;
};

const parseFieldValuesFromChildren = (object: Record<string, any>, children: any[]) => {
  for (const field of children) {
    if (!field?.string) continue;
    const [key, value] = parseConfigString(field.string);

    if (key === 'nextDueDate') {
      object[key] = parseRoamDateString(getStringBetween(value, '[[', ']]'));
    } else if (key === 'algorithm') {
      object[key] = value;
    } else if (key === 'interaction') {
      object[key] = value;
    } else if (value === 'true' || value === 'false') {
      object[key] = value === 'true';
    } else if (stringUtils.isNumeric(value)) {
      object[key] = Number(value);
    } else {
      object[key] = value;
    }
  }
};

const isSessionHeadingBlock = (child: any) => {
  if (!child?.string) return false;
  const headingDateString = getStringBetween(child.string, '[[', ']]');
  return !!parseRoamDateString(headingDateString);
};

const parseSessionHistory = (sessionChildren: any[], uid: string) => {
  if (!sessionChildren.length) {
    return [{ ...generateNewSession(), refUid: uid }];
  }

  const sortedSessionChildren = [...sessionChildren].sort((a, b) => b.order - a.order);
  const normalizedSessions: Record<string, any>[] = [];
  let previousSnapshot: Record<string, any> | undefined = undefined;

  for (const child of sortedSessionChildren) {
    if (!child?.string) continue;

    const rawRecord = {
      refUid: uid,
      dateCreated: parseRoamDateString(getStringBetween(child.string, '[[', ']]')),
    };

    if (child.children) {
      parseFieldValuesFromChildren(rawRecord, child.children);
    }

    const normalizedRecord = mergeSessionSnapshot(previousSnapshot, rawRecord);
    normalizedSessions.push(normalizedRecord);
    previousSnapshot = normalizedRecord;
  }

  if (normalizedSessions.length && !normalizedSessions[0].nextDueDate) {
    normalizedSessions[0].isNew = true;
  }

  return normalizedSessions;
};

const parseLatestSession = (sessionChildren: any[], uid: string) => {
  if (!sessionChildren.length) {
    return { ...generateNewSession(), refUid: uid };
  }

  const sortedSessionChildren = [...sessionChildren].sort((a, b) => a.order - b.order);
  const latestChild = sortedSessionChildren[0];

  if (!latestChild?.string) {
    return { ...generateNewSession(), refUid: uid };
  }

  const rawRecord: Record<string, any> = {
    refUid: uid,
    dateCreated: parseRoamDateString(getStringBetween(latestChild.string, '[[', ']]')),
  };

  if (latestChild.children) {
    parseFieldValuesFromChildren(rawRecord, latestChild.children);
  }

  const config = resolveReviewConfig(rawRecord.algorithm, rawRecord.interaction);
  rawRecord.algorithm = config.algorithm;
  rawRecord.interaction = config.interaction;

  const now = new Date();
  if (dateUtils.isSameDay(rawRecord.dateCreated, now) && sortedSessionChildren.length > 1) {
    let sameDayForgotSession: Record<string, any> | null = null;
    let prevDaySession: Record<string, any> | null = null;

    for (let i = 1; i < sortedSessionChildren.length; i++) {
      const prevChild = sortedSessionChildren[i];
      if (!prevChild?.string) continue;
      const prevDateStr = getStringBetween(prevChild.string, '[[', ']]');
      const prevDate = parseRoamDateString(prevDateStr);
      if (!prevDate) continue;

      if (dateUtils.isSameDay(prevDate, now)) {
        if (!sameDayForgotSession) {
          const prevRecord: Record<string, any> = {
            refUid: uid,
            dateCreated: prevDate,
          };
          if (prevChild.children) {
            parseFieldValuesFromChildren(prevRecord, prevChild.children);
          }
          const prevConfig = resolveReviewConfig(prevRecord.algorithm, prevRecord.interaction);
          prevRecord.algorithm = prevConfig.algorithm;
          prevRecord.interaction = prevConfig.interaction;
          if (prevRecord.sm2_grade === 0) {
            sameDayForgotSession = prevRecord;
          }
        }
      } else {
        if (!prevDaySession) {
          const prevRecord: Record<string, any> = {
            refUid: uid,
            dateCreated: prevDate,
          };
          if (prevChild.children) {
            parseFieldValuesFromChildren(prevRecord, prevChild.children);
          }
          const prevConfig = resolveReviewConfig(prevRecord.algorithm, prevRecord.interaction);
          prevRecord.algorithm = prevConfig.algorithm;
          prevRecord.interaction = prevConfig.interaction;
          prevDaySession = prevRecord;
        }
        break;
      }
    }

    if (rawRecord.sm2_grade !== 0 && sameDayForgotSession) {
      rawRecord.baseSessionData = sameDayForgotSession;
    } else if (prevDaySession) {
      rawRecord.baseSessionData = prevDaySession;
    }
  }

  if (!rawRecord.nextDueDate) {
    rawRecord.isNew = true;
  }

  return rawRecord;
};

// Counts are no longer stored as separate fields — derived from .length of uid arrays.

// 黑名单牌组过滤：被勾选 blacklist 的牌组，其所有卡片从所有牌组队列中移除
// 位置：classifyAllCards 之后、allocateDailyCards 之前
// 效果：被过滤的卡片不占 Daily Review Limit 配额
export const filterBlacklistedDecks = ({
  tagCardSets,
  deckConfigs,
}: {
  tagCardSets: TagCardSets;
  deckConfigs: string;
}): TagCardSets => {
  const parsedDeckConfigs = parseDeckConfigs(deckConfigs);
  const blacklistedDecks = parsedDeckConfigs.filter((c) => c.blacklist);
  if (!blacklistedDecks.length) return tagCardSets;

  const blacklistedUids = new Set<string>();
  for (const deck of blacklistedDecks) {
    const tagData = tagCardSets[deck.name];
    if (!tagData) continue;
    for (const uid of tagData.dueUids) blacklistedUids.add(uid);
    for (const uid of tagData.newUids) blacklistedUids.add(uid);
    for (const uid of tagData.completedUids) blacklistedUids.add(uid);
  }

  if (!blacklistedUids.size) return tagCardSets;

  const result: TagCardSets = {};
  for (const [tag, tagData] of Object.entries(tagCardSets)) {
    const isBlacklisted = blacklistedDecks.some((d) => d.name === tag);
    if (isBlacklisted) {
      result[tag] = { ...tagData, dueUids: [], newUids: [], completedUids: [] };
    } else {
      result[tag] = {
        ...tagData,
        dueUids: tagData.dueUids.filter((uid) => !blacklistedUids.has(uid)),
        newUids: tagData.newUids.filter((uid) => !blacklistedUids.has(uid)),
        completedUids: tagData.completedUids.filter((uid) => !blacklistedUids.has(uid)),
      };
    }
  }
  return result;
};

export const allocateDailyCards = ({
  tagCardSets,
  dailyLimit,
  tagsList,
  isCramming,
  deckConfigs,
}: {
  tagCardSets: TagCardSets;
  dailyLimit: number;
  tagsList: string[];
  isCramming: boolean;
  deckConfigs: string;
}): TagCardSets => {
  const parsedDeckConfigs = parseDeckConfigs(deckConfigs);
  const weightMap: Record<string, number> = {};
  const blacklistSet = new Set<string>();
  for (const config of parsedDeckConfigs) {
    weightMap[config.name] = config.weight;
    if (config.blacklist) blacklistSet.add(config.name);
  }

  const result: TagCardSets = { ...tagCardSets };

  // 兜底：deckConfigs 可能先于 tagCardSets 更新（异步 fetch），tagsList 中的新牌组尚未在 tagCardSets 中出现。
  // 为其填充默认空条目，避免下游 result[tag] 为 undefined 导致崩溃。
  for (const tag of tagsList) {
    if (!result[tag]) {
      result[tag] = {
        dueUids: [],
        newUids: [],
        completedUids: [],
        lblDeckMeta: {},
        renderMode: RenderMode.Normal,
      };
    }
  }

  // 权重归零或黑名单的牌组完全排除：due、new、completed 均清空
  for (const tag of tagsList) {
    if ((tag in weightMap && weightMap[tag] === 0) || blacklistSet.has(tag)) {
      result[tag] = {
        ...result[tag],
        dueUids: [],
        newUids: [],
        completedUids: [],
      };
    }
  }

  const enabledTags = tagsList.filter(
    (tag) => !blacklistSet.has(tag) && (!(tag in weightMap) || weightMap[tag] > 0)
  );
  const totalDueAvailable = enabledTags.reduce((sum, tag) => sum + result[tag].dueUids.length, 0);
  const totalNewAvailable = enabledTags.reduce((sum, tag) => sum + result[tag].newUids.length, 0);
  const totalRemaining = totalDueAvailable + totalNewAvailable;

  if (!dailyLimit || !totalRemaining || isCramming) return result;

  const enabledWeightTotal = enabledTags.reduce((sum, tag) => sum + (weightMap[tag] || 0), 0);

  // Stable sort: highest weight first, ties broken by tagsList order (earliest first)
  const sortedByWeight = [...enabledTags].sort((a, b) => {
    const weightDiff = (weightMap[b] || 0) - (weightMap[a] || 0);
    if (weightDiff !== 0) return weightDiff;
    return tagsList.indexOf(a) - tagsList.indexOf(b);
  });

  // Phase 1: Calculate initial quotas by weight
  const deckCaps: Record<string, number> = {};
  let capsAllocated = 0;
  for (const tag of enabledTags) {
    const weight = weightMap[tag] || 0;
    deckCaps[tag] =
      enabledWeightTotal > 0
        ? Math.floor(dailyLimit * (weight / enabledWeightTotal))
        : Math.floor(dailyLimit / enabledTags.length);
    capsAllocated += deckCaps[tag];
  }
  // Distribute Math.floor remainder by weight priority
  let remainder = dailyLimit - capsAllocated;
  for (const tag of sortedByWeight) {
    if (remainder <= 0) break;
    deckCaps[tag]++;
    remainder--;
  }

  // Phase 2: Redistribute excess capacity based on TOTAL cards (due + new + completed).
  // Using totalCards makes the allocation stable — completing cards doesn't change
  // the redistribution, because cards only move between categories, not disappear.
  const totalCardsPerDeck: Record<string, number> = {};
  for (const tag of enabledTags) {
    totalCardsPerDeck[tag] =
      result[tag].dueUids.length + result[tag].newUids.length + result[tag].completedUids.length;
  }

  let totalExcess = 0;
  for (const tag of enabledTags) {
    const excess = deckCaps[tag] - totalCardsPerDeck[tag];
    if (excess > 0) {
      totalExcess += excess;
      deckCaps[tag] = totalCardsPerDeck[tag];
    }
  }

  // Excess goes to decks with remaining capacity, priority: highest weight, then tagsList order
  if (totalExcess > 0) {
    const tagsWithCapacity = enabledTags.filter((tag) => totalCardsPerDeck[tag] > deckCaps[tag]);
    tagsWithCapacity.sort((a, b) => {
      const weightDiff = (weightMap[b] || 0) - (weightMap[a] || 0);
      if (weightDiff !== 0) return weightDiff;
      return tagsList.indexOf(a) - tagsList.indexOf(b);
    });
    for (const tag of tagsWithCapacity) {
      if (totalExcess <= 0) break;
      const canTake = totalCardsPerDeck[tag] - deckCaps[tag];
      const give = Math.min(canTake, totalExcess);
      deckCaps[tag] += give;
      totalExcess -= give;
    }
  }

  // deckCaps is now the FINAL stable quota — it won't change as cards are completed.

  // Phase 3: Remaining caps = final quota minus already-completed cards
  const remainingCaps: Record<string, number> = {};
  for (const tag of enabledTags) {
    remainingCaps[tag] = Math.max(0, deckCaps[tag] - result[tag].completedUids.length);
  }

  // Phase 4: Enforce daily limit constraint
  const totalRemainingCap = Math.min(
    enabledTags.reduce((sum, tag) => sum + remainingCaps[tag], 0),
    Math.max(
      0,
      dailyLimit - enabledTags.reduce((sum, tag) => sum + result[tag].completedUids.length, 0)
    )
  );
  if (totalRemainingCap <= 0) {
    for (const tag of tagsList) {
      result[tag] = { ...result[tag], dueUids: [], newUids: [] };
    }
    return result;
  }

  if (totalRemaining <= totalRemainingCap) return result;

  // Allocate: 75% due, 25% new
  const targetNew = totalRemainingCap === 1 ? 0 : Math.max(1, Math.floor(totalRemainingCap * 0.25));
  const targetDue = totalRemainingCap - targetNew;

  // Distribute proportionally by deck weight via round-robin
  const selectedCards: Record<string, { newUids: string[]; dueUids: string[] }> = {};
  for (const tag of tagsList) selectedCards[tag] = { newUids: [], dueUids: [] };

  // Round-robin due cards
  let dueSelected = 0;
  const deckSelected: Record<string, number> = {};
  for (const tag of tagsList) deckSelected[tag] = 0;

  while (dueSelected < targetDue) {
    let added = false;
    for (const tag of enabledTags) {
      if (dueSelected >= targetDue) break;
      if (deckSelected[tag] >= remainingCaps[tag]) continue;
      const s = selectedCards[tag];
      if (s.dueUids.length < result[tag].dueUids.length) {
        s.dueUids.push(result[tag].dueUids[s.dueUids.length]);
        deckSelected[tag]++;
        dueSelected++;
        added = true;
      }
    }
    if (!added) break;
  }

  // Round-robin new cards
  let newSelected = 0;
  while (newSelected < targetNew) {
    let added = false;
    for (const tag of enabledTags) {
      if (newSelected >= targetNew) break;
      if (deckSelected[tag] >= remainingCaps[tag]) continue;
      const s = selectedCards[tag];
      if (s.newUids.length < result[tag].newUids.length) {
        s.newUids.push(result[tag].newUids[s.newUids.length]);
        deckSelected[tag]++;
        newSelected++;
        added = true;
      }
    }
    if (!added) break;
  }

  // Fill remaining: first respect targetDue/targetNew split, then fill any leftover
  let totalAllocated = dueSelected + newSelected;
  if (totalAllocated < totalRemainingCap) {
    // Fill due cards up to targetDue
    let dueUnused = targetDue - dueSelected;
    while (dueUnused > 0) {
      let added = false;
      for (const tag of enabledTags) {
        if (dueUnused <= 0) break;
        if (deckSelected[tag] >= remainingCaps[tag]) continue;
        const s = selectedCards[tag];
        if (s.dueUids.length < result[tag].dueUids.length) {
          s.dueUids.push(result[tag].dueUids[s.dueUids.length]);
          deckSelected[tag]++;
          dueSelected++;
          totalAllocated++;
          dueUnused--;
          added = true;
        }
      }
      if (!added) break;
    }

    // Fill new cards up to targetNew
    let newUnused = targetNew - newSelected;
    while (newUnused > 0) {
      let added = false;
      for (const tag of enabledTags) {
        if (newUnused <= 0) break;
        if (deckSelected[tag] >= remainingCaps[tag]) continue;
        const s = selectedCards[tag];
        if (s.newUids.length < result[tag].newUids.length) {
          s.newUids.push(result[tag].newUids[s.newUids.length]);
          deckSelected[tag]++;
          newSelected++;
          totalAllocated++;
          newUnused--;
          added = true;
        }
      }
      if (!added) break;
    }

    // Fill any leftover slots with any available cards
    let anyUnused = totalRemainingCap - totalAllocated;
    for (const kind of ['dueUids', 'newUids'] as const) {
      while (anyUnused > 0) {
        let added = false;
        for (const tag of enabledTags) {
          if (anyUnused <= 0) break;
          if (deckSelected[tag] >= remainingCaps[tag]) continue;
          const s = selectedCards[tag];
          if (s[kind].length < result[tag][kind].length) {
            s[kind].push(result[tag][kind][s[kind].length]);
            deckSelected[tag]++;
            totalAllocated++;
            anyUnused--;
            added = true;
          }
        }
        if (!added) break;
      }
    }
  }

  // Trim excess — only trim dueUids and newUids, completedUids stays as-is
  if (totalAllocated > totalRemainingCap) {
    let excess = totalAllocated - totalRemainingCap;
    for (const tag of [...tagsList].reverse()) {
      while (excess > 0 && selectedCards[tag].newUids.length > 0) {
        selectedCards[tag].newUids.pop();
        excess--;
      }
      while (excess > 0 && selectedCards[tag].dueUids.length > 0) {
        selectedCards[tag].dueUids.pop();
        excess--;
      }
      if (excess <= 0) break;
    }
  }

  for (const tag of tagsList) {
    result[tag] = {
      ...result[tag],
      dueUids: selectedCards[tag].dueUids,
      newUids: selectedCards[tag].newUids,
    };
  }

  return result;
};

export {
  parseFieldValuesFromChildren,
  isSessionHeadingBlock,
  parseSessionHistory,
  parseLatestSession,
};
