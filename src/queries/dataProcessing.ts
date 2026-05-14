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
  if (isCramming || !dailyLimit) return tagCardSets;

  const configs = parseDeckConfigs(deckConfigs);
  const cfgByName: Record<string, { weight: number; blacklist?: boolean }> = {};
  for (const c of configs) cfgByName[c.name] = c;

  const result: TagCardSets = {};
  const enabled: { tag: string; weight: number }[] = [];

  for (const tag of tagsList) {
    const src = tagCardSets[tag];
    const cfg = cfgByName[tag];
    const disabled = cfg?.blacklist || cfg?.weight === 0;

    result[tag] = src
      ? { ...src, dueUids: disabled ? [] : [...src.dueUids], newUids: disabled ? [] : [...src.newUids], completedUids: disabled ? [] : [...src.completedUids] }
      : { dueUids: [], newUids: [], completedUids: [], lblDeckMeta: {}, renderMode: RenderMode.Normal };
    if (!disabled) enabled.push({ tag, weight: cfg?.weight ?? 0 });
  }

  enabled.sort((a, b) => {
    const d = b.weight - a.weight;
    return d !== 0 ? d : tagsList.indexOf(a.tag) - tagsList.indexOf(b.tag);
  });

  if (!enabled.length) return result;

  let totalAvail = 0;
  for (const { tag } of enabled) totalAvail += result[tag].dueUids.length + result[tag].newUids.length;
  if (!totalAvail || totalAvail <= dailyLimit) return result;

  // ── Per-deck quotas (based on TOTAL cards for stability) ──
  const totalCards: Record<string, number> = {};
  for (const { tag } of enabled)
    totalCards[tag] = result[tag].dueUids.length + result[tag].newUids.length + result[tag].completedUids.length;

  const totalWeight = enabled.reduce((s, e) => s + (e.weight || 0), 0);
  const cap: Record<string, number> = {};
  let capSum = 0;

  for (const { tag, weight } of enabled) {
    cap[tag] = totalWeight > 0
      ? Math.floor(dailyLimit * (weight / totalWeight))
      : Math.floor(dailyLimit / enabled.length);
    capSum += cap[tag];
  }

  for (const { tag } of enabled) {
    if (capSum >= dailyLimit) break;
    cap[tag]++; capSum++;
  }

  let excess = 0;
  for (const { tag } of enabled) {
    if (cap[tag] > totalCards[tag]) {
      excess += cap[tag] - totalCards[tag];
      cap[tag] = totalCards[tag];
    }
  }
  for (const { tag } of enabled) {
    if (excess <= 0) break;
    const room = totalCards[tag] - cap[tag];
    if (room > 0) { const give = Math.min(room, excess); cap[tag] += give; excess -= give; }
  }

  // ── Remaining quota = cap - completed ──
  const rem: Record<string, number> = {};
  let totalRem = 0;
  for (const { tag } of enabled) {
    rem[tag] = Math.max(0, cap[tag] - result[tag].completedUids.length);
    totalRem += rem[tag];
  }
  const allCompleted = enabled.reduce((s, { tag }) => s + result[tag].completedUids.length, 0);
  totalRem = Math.min(totalRem, Math.max(0, dailyLimit - allCompleted));

  if (totalRem <= 0) {
    for (const tag of tagsList) result[tag] = { ...result[tag], dueUids: [], newUids: [] };
    return result;
  }

  // ── Round-robin allocation: due first (75%), then new (25%) ──
  const targetNew = totalRem === 1 ? 0 : Math.max(1, Math.floor(totalRem * 0.25));
  const targetDue = totalRem - targetNew;
  const dueSel: Record<string, string[]> = {};
  const newSel: Record<string, string[]> = {};
  const picked: Record<string, number> = {};
  for (const { tag } of enabled) { dueSel[tag] = []; newSel[tag] = []; picked[tag] = 0; }

  let duePicked = 0, newPicked = 0;

  for (const kind of ['due', 'new'] as const) {
    const target = kind === 'due' ? targetDue : targetNew;
    let counter = kind === 'due' ? duePicked : newPicked;
    while (counter < target) {
      let any = false;
      for (const { tag } of enabled) {
        if (counter >= target) break;
        if (picked[tag] >= rem[tag]) continue;
        const sel = kind === 'due' ? dueSel : newSel;
        const src = kind === 'due' ? result[tag].dueUids : result[tag].newUids;
        if (sel[tag].length < src.length) {
          sel[tag].push(src[sel[tag].length]);
          picked[tag]++; counter++; any = true;
        }
      }
      if (!any) break;
    }
    if (kind === 'due') duePicked = counter; else newPicked = counter;
  }

  let totalPicked = duePicked + newPicked;
  if (totalPicked < totalRem) {
    for (const kind of ['due', 'new'] as const) {
      while (totalPicked < totalRem) {
        let any = false;
        for (const { tag } of enabled) {
          if (totalPicked >= totalRem) break;
          if (picked[tag] >= rem[tag]) continue;
          const sel = kind === 'due' ? dueSel : newSel;
          const src = kind === 'due' ? result[tag].dueUids : result[tag].newUids;
          if (sel[tag].length < src.length) {
            sel[tag].push(src[sel[tag].length]);
            picked[tag]++; totalPicked++; any = true;
          }
        }
        if (!any) break;
      }
    }
  }

  for (const tag of tagsList) {
    if (dueSel[tag]) result[tag] = { ...result[tag], dueUids: dueSel[tag], newUids: newSel[tag] };
  }
  return result;
};

export {
  parseFieldValuesFromChildren,
  isSessionHeadingBlock,
  parseSessionHistory,
  parseLatestSession,
};
