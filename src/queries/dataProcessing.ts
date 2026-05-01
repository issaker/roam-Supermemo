import { getStringBetween, parseConfigString, parseRoamDateString } from '~/utils/string';
import * as stringUtils from '~/utils/string';
import * as dateUtils from '~/utils/date';
import { resolveReviewConfig } from '~/models/session';
import { Today } from '~/models/practice';
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

const zeroOutWeightZeroDecks = (
  today: Today,
  tagsList: string[],
  weightMap: Record<string, number>
): void => {
  for (const tag of tagsList) {
    if (tag in weightMap && weightMap[tag] === 0) {
      today.tags[tag] = {
        ...today.tags[tag],
        dueUids: [],
        newUids: [],
        completedUids: [],
        due: 0,
        new: 0,
        completed: 0,
      };
    }
  }
};

const allocateDeckCaps = (
  dailyLimit: number,
  tagsList: string[],
  weightMap: Record<string, number>
): Record<string, number> => {
  const deckCaps: Record<string, number> = {};
  const enabledTags = tagsList.filter((tag) => !(tag in weightMap) || weightMap[tag] > 0);
  let allocated = 0;
  const remainders: { tag: string; remainder: number }[] = [];
  for (const tag of enabledTags) {
    const weight = tag in weightMap ? weightMap[tag] : 0;
    const exact = dailyLimit * (weight / 100);
    const floor = Math.floor(exact);
    deckCaps[tag] = floor;
    allocated += floor;
    remainders.push({ tag, remainder: exact - floor });
  }
  remainders.sort((a, b) => b.remainder - a.remainder);
  let leftover = dailyLimit - allocated;
  for (const { tag } of remainders) {
    if (leftover <= 0) break;
    deckCaps[tag]++;
    leftover--;
  }
  return deckCaps;
};

const selectCardsByRoundRobin = (
  today: Today,
  tagsList: string[],
  targetDue: number,
  targetNew: number,
  deckCaps: Record<string, number>
): {
  selectedCards: Record<string, { newUids: string[]; dueUids: string[] }>;
  dueSelected: number;
  newSelected: number;
} => {
  const selectedCards = tagsList.reduce(
    (acc, currentTag) => ({
      ...acc,
      [currentTag]: {
        newUids: [],
        dueUids: [],
      },
    }),
    {} as Record<string, { newUids: string[]; dueUids: string[] }>
  );

  const deckSelected: Record<string, number> = {};
  for (const tag of tagsList) {
    deckSelected[tag] = 0;
  }

  let dueSelected = 0;
  while (dueSelected < targetDue) {
    let addedInThisRound = false;
    for (const tag of tagsList) {
      if (dueSelected >= targetDue) break;
      if (tag in deckCaps && deckSelected[tag] >= deckCaps[tag]) continue;
      const currentSelected = selectedCards[tag];
      if (currentSelected.dueUids.length < today.tags[tag].dueUids.length) {
        currentSelected.dueUids.push(today.tags[tag].dueUids[currentSelected.dueUids.length]);
        deckSelected[tag]++;
        dueSelected++;
        addedInThisRound = true;
      }
    }
    if (!addedInThisRound) break;
  }

  let newSelected = 0;
  while (newSelected < targetNew) {
    let addedInThisRound = false;
    for (const tag of tagsList) {
      if (newSelected >= targetNew) break;
      if (tag in deckCaps && deckSelected[tag] >= deckCaps[tag]) continue;
      const currentSelected = selectedCards[tag];
      if (currentSelected.newUids.length < today.tags[tag].newUids.length) {
        currentSelected.newUids.push(today.tags[tag].newUids[currentSelected.newUids.length]);
        deckSelected[tag]++;
        newSelected++;
        addedInThisRound = true;
      }
    }
    if (!addedInThisRound) break;
  }

  return { selectedCards, dueSelected, newSelected };
};

const redistributeOverflow = (
  today: Today,
  tagsList: string[],
  selectedCards: Record<string, { newUids: string[]; dueUids: string[] }>,
  remainingLimit: number,
  totalAllocated: number,
  dueSelected: number,
  newSelected: number,
  targetDue: number,
  targetNew: number,
  deckCaps: Record<string, number>,
  weightMap: Record<string, number>
): { totalAllocated: number; dueSelected: number; newSelected: number } => {
  if (totalAllocated < remainingLimit) {
    let unused = remainingLimit - totalAllocated;

    while (unused > 0 && dueSelected < targetDue) {
      let addedInThisRound = false;
      for (const tag of tagsList) {
        if (unused <= 0 || dueSelected >= targetDue) break;
        if (tag in weightMap && weightMap[tag] === 0) continue;
        const currentSelected = selectedCards[tag];
        if (currentSelected.dueUids.length < today.tags[tag].dueUids.length) {
          currentSelected.dueUids.push(today.tags[tag].dueUids[currentSelected.dueUids.length]);
          dueSelected++;
          totalAllocated++;
          unused--;
          addedInThisRound = true;
        }
      }
      if (!addedInThisRound) break;
    }

    while (unused > 0 && newSelected < targetNew) {
      let addedInThisRound = false;
      for (const tag of tagsList) {
        if (unused <= 0 || newSelected >= targetNew) break;
        if (tag in weightMap && weightMap[tag] === 0) continue;
        const currentSelected = selectedCards[tag];
        if (currentSelected.newUids.length < today.tags[tag].newUids.length) {
          currentSelected.newUids.push(today.tags[tag].newUids[currentSelected.newUids.length]);
          newSelected++;
          totalAllocated++;
          unused--;
          addedInThisRound = true;
        }
      }
      if (!addedInThisRound) break;
    }

    while (unused > 0) {
      let addedInThisRound = false;
      for (const tag of tagsList) {
        if (unused <= 0) break;
        if (tag in weightMap && weightMap[tag] === 0) continue;
        const currentSelected = selectedCards[tag];
        if (currentSelected.dueUids.length < today.tags[tag].dueUids.length) {
          currentSelected.dueUids.push(today.tags[tag].dueUids[currentSelected.dueUids.length]);
          totalAllocated++;
          unused--;
          addedInThisRound = true;
        }
      }
      if (!addedInThisRound) break;
    }

    while (unused > 0) {
      let addedInThisRound = false;
      for (const tag of tagsList) {
        if (unused <= 0) break;
        if (tag in weightMap && weightMap[tag] === 0) continue;
        const currentSelected = selectedCards[tag];
        if (currentSelected.newUids.length < today.tags[tag].newUids.length) {
          currentSelected.newUids.push(today.tags[tag].newUids[currentSelected.newUids.length]);
          totalAllocated++;
          unused--;
          addedInThisRound = true;
        }
      }
      if (!addedInThisRound) break;
    }
  }

  return { totalAllocated, dueSelected, newSelected };
};

const trimExcessCards = (
  selectedCards: Record<string, { newUids: string[]; dueUids: string[] }>,
  tagsList: string[],
  totalAllocated: number,
  remainingLimit: number
): number => {
  if (totalAllocated > remainingLimit) {
    let excess = totalAllocated - remainingLimit;
    const reverseTags = [...tagsList].reverse();
    for (const tag of reverseTags) {
      while (excess > 0 && selectedCards[tag].newUids.length > 0) {
        selectedCards[tag].newUids.pop();
        totalAllocated--;
        excess--;
      }
      while (excess > 0 && selectedCards[tag].dueUids.length > 0) {
        selectedCards[tag].dueUids.pop();
        totalAllocated--;
        excess--;
      }
      if (excess <= 0) break;
    }
  }
  return totalAllocated;
};

export const limitRemainingPracticeData = ({
  today,
  dailyLimit,
  tagsList,
  isCramming,
  deckConfigs,
}: {
  today: Today;
  dailyLimit: number;
  tagsList: string[];
  isCramming: boolean;
  deckConfigs: string;
}) => {
  const parsedDeckConfigs = parseDeckConfigs(deckConfigs);
  const weightMap: Record<string, number> = {};
  for (const config of parsedDeckConfigs) {
    weightMap[config.name] = config.weight;
  }

  zeroOutWeightZeroDecks(today, tagsList, weightMap);
  const deckCaps = allocateDeckCaps(dailyLimit, tagsList, weightMap);

  const enabledTags = tagsList.filter((tag) => !(tag in weightMap) || weightMap[tag] > 0);
  const totalCompleted = enabledTags.reduce((sum, tag) => sum + today.tags[tag].completed, 0);
  const totalDueAvailable = enabledTags.reduce(
    (sum, tag) => sum + today.tags[tag].dueUids.length,
    0
  );
  const totalNewAvailable = enabledTags.reduce(
    (sum, tag) => sum + today.tags[tag].newUids.length,
    0
  );
  const totalRemaining = totalDueAvailable + totalNewAvailable;

  if (!dailyLimit || !totalRemaining || isCramming) {
    return;
  }

  const remainingLimit = Math.max(dailyLimit - totalCompleted, 0);
  if (remainingLimit === 0) {
    for (const tag of tagsList) {
      today.tags[tag] = {
        ...today.tags[tag],
        dueUids: [],
        newUids: [],
        due: 0,
        new: 0,
      };
    }
    return;
  }

  if (totalRemaining <= remainingLimit) {
    return;
  }

  const targetNew = remainingLimit === 1 ? 0 : Math.max(1, Math.floor(remainingLimit * 0.25));
  const targetDue = remainingLimit - targetNew;

  const { selectedCards, dueSelected, newSelected } = selectCardsByRoundRobin(
    today,
    tagsList,
    targetDue,
    targetNew,
    deckCaps
  );

  let totalAllocated = dueSelected + newSelected;
  const redistributed = redistributeOverflow(
    today,
    tagsList,
    selectedCards,
    remainingLimit,
    totalAllocated,
    dueSelected,
    newSelected,
    targetDue,
    targetNew,
    deckCaps,
    weightMap
  );
  totalAllocated = redistributed.totalAllocated;

  totalAllocated = trimExcessCards(selectedCards, tagsList, totalAllocated, remainingLimit);

  for (const tag of tagsList) {
    today.tags[tag] = {
      ...today.tags[tag],
      dueUids: selectedCards[tag].dueUids,
      newUids: selectedCards[tag].newUids,
      due: selectedCards[tag].dueUids.length,
      new: selectedCards[tag].newUids.length,
    };
  }
};

export { parseFieldValuesFromChildren, isSessionHeadingBlock, parseSessionHistory, parseLatestSession };
