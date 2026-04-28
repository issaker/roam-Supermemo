/**
 * Practice Data Queries
 *
 * Core data layer that reads practice session data from the Roam data page.
 *
 * Unified Data Page Structure (no meta block):
 *   roam/memo (page)
 *   ├── data (heading block)
 *   │   ├── ((cardUid1))
 *   │   │   ├── [[Date]] 🟢            ← Latest session (all fields here)
 *   │   │   │   ├── algorithm:: SM2
 *   │   │   │   ├── interaction:: NORMAL
 *   │   │   │   ├── nextDueDate:: [[Date]]
 *   │   │   │   ├── sm2_grade:: 5
 *   │   │   │   ├── sm2_eFactor:: 2.5
 *   │   │   │   └── sm2_repetitions:: 3
 *   │   │   └── [[Date]] 🔴
 *   │   │       └── ...
 *   │   └── ((cardUid2))
 *   │       └── ...
 *   ├── cache (heading block)
 *   │   └── [[tagName]]
 *   │       ├── renderMode:: normal
 *   │       └── ...
 *   └── settings (heading block)
 *       ├── deckConfigs:: [{"name":"memo","swapQA":false,"weight":100}]
 *       └── ...
 *
 * Key Design Principle:
 *   All fields (algorithm, interaction, nextDueDate, sm2_grade, sm2_eFactor,
 *   sm2_repetitions, sm2_interval, progressive_repetitions, progressive_interval, fixed_multiplier)
 *   are stored uniformly in session blocks. The latest session block is the
 *   single source of truth for the card's current state.
 */
import { getStringBetween, parseConfigString, parseRoamDateString } from '~/utils/string';
import * as stringUtils from '~/utils/string';
import * as dateUtils from '~/utils/date';
import { Records, RecordUid, resolveReviewConfig, CompleteRecords } from '~/models/session';
import { Today } from '~/models/practice';
import {
  addDueCards,
  addNewCards,
  calculateCombinedCounts,
  calculateCompletedTodayCounts,
  calculateTodayStatus,
  initializeToday,
} from '~/queries/today';
import {
  generateNewSession,
  getChildBlocksOnPage,
  getDailyNoteBlockUids,
  getOrCreateBlockOnPage,
  getOrCreateChildBlock,
} from './utils';
import { DAILYNOTE_DECK_KEY } from '~/constants';
import { DeckConfig } from '~/hooks/useSettings';

export const getPracticeData = async ({
  tagsList,
  dataPageTitle,
  dailyLimit,
  isCramming,
  shuffleCards,
  cachedData,
  deckConfigs,
}) => {
  const pluginPageData = (await getPluginPageData({
    dataPageTitle,
    limitToLatest: true,
  })) as Records;

  const today = initializeToday({ tagsList, cachedData, deckConfigs });
  const sessionData = {};
  const cardUids: Record<string, RecordUid[]> = {};

  // Promise.all: parallel queries for multiple tags, reduces serial wait time
  const results = await Promise.all(
    tagsList.map((tag) => getSessionData({ pluginPageData, tag, dataPageTitle }))
  );
  tagsList.forEach((tag, i) => {
    sessionData[tag] = results[i].sessionData;
    cardUids[tag] = results[i].cardUids;
  });

  calculateCompletedTodayCounts({ today, tagsList, sessionData });

  addNewCards({ today, tagsList, cardUids, pluginPageData, shuffleCards });
  addDueCards({ today, tagsList, sessionData, isCramming, shuffleCards });

  limitRemainingPracticeData({ today, dailyLimit, tagsList, isCramming, deckConfigs });
  calculateCombinedCounts({ today, tagsList });

  calculateTodayStatus({ today, tagsList });

  return {
    practiceData: pluginPageData,
    todayStats: today,
  };
};

export const getDataPageQuery = (dataPageTitle) => `[
  :find ?page
  :where
    [?page :node/title "${dataPageTitle}"]
]`;

export const dataPageReferencesIdsQuery = `[
  :find ?refUid
  :in $ ?tag ?dataPage
  :where
    [?tagPage :node/title ?tag]
    [?tagRefs :block/refs ?tagPage]
    [?tagRefs :block/uid ?refUid]
    [?tagRefs :block/page ?homePage]
    [(!= ?homePage ?dataPage)]
  ]`;

const getPageReferenceIds = async (tag, dataPageTitle): Promise<string[]> => {
  const dataPageResult = window.roamAlphaAPI.q(getDataPageQuery(dataPageTitle));
  const dataPageUid = dataPageResult.length ? dataPageResult[0][0] : '';
  const results = window.roamAlphaAPI.q(dataPageReferencesIdsQuery, tag, dataPageUid);
  return results.map((arr) => arr[0]);
};

export const getSelectedTagPageBlocksIds = async (selectedTag): Promise<string[]> => {
  const queryResults = await getChildBlocksOnPage(selectedTag);
  if (!queryResults.length) return [];

  const children = queryResults[0][0].children;
  const filteredChildren = children.filter((child) => !!child.string);
  return filteredChildren.map((arr) => arr.uid);
};

/**
 * Session snapshot merge key list.
 * Field naming follows the {owner}_{purpose} convention:
 * - sm2_*: SM2 algorithm-specific fields
 * - progressive_*: Progressive algorithm-specific fields
 * - fixed_*: FixedTime algorithm fields (user input persistence, not algorithm state)
 * - No prefix: universal/config fields
 *
 * Deprecated fields removed at runtime: intervalMultiplierType (no longer used at runtime)
 * Migration tool still needs to handle: Data Migration Phase 4's FIELDS_TO_DELETE includes
 * this field for cleaning up legacy data remnants.
 * Legacy field name compatibility mapping: handled by Data Migration, no runtime compatibility.
 */
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

/**
 * Rebuild a full latest-session snapshot from sparse historical session blocks.
 *
 * Older data may store only the fields touched by the active mode. We merge the
 * latest known value for every mode-specific state field forward so the newest
 * session once again becomes a complete card snapshot.
 */
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

const parseFieldValuesFromChildren = (object, children) => {
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

const isSessionHeadingBlock = (child) => {
  if (!child?.string) return false;
  const headingDateString = getStringBetween(child.string, '[[', ']]');
  return !!parseRoamDateString(headingDateString);
};

const parseSessionHistory = (sessionChildren, uid) => {
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

/**
 * Parse the latest session block directly without historical merging.
 *
 * Performance optimization: when limitToLatest=true, there is no need to merge
 * from the oldest session forward, because savePracticeData writes all fields
 * (including cross-algorithm field pass-through), so the latest session block
 * itself is already a complete snapshot.
 */
const parseLatestSession = (sessionChildren, uid) => {
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

const mapPluginPageDataLatest = (queryResultsData): Records =>
  queryResultsData
    .map((arr) => arr[0])[0]
    .children?.reduce((acc, cur) => {
      if (!cur?.string) return acc;
      const uid = getStringBetween(cur.string, '((', '))');
      const sessionChildren = cur.children?.filter(isSessionHeadingBlock) || [];
      acc[uid] = parseLatestSession(sessionChildren, uid);
      return acc;
    }, {}) || {};

const mapPluginPageData = (queryResultsData): CompleteRecords =>
  queryResultsData
    .map((arr) => arr[0])[0]
    .children?.reduce((acc, cur) => {
      if (!cur?.string) return acc;
      const uid = getStringBetween(cur.string, '((', '))');
      const sessionChildren = cur.children?.filter(isSessionHeadingBlock) || [];
      acc[uid] = parseSessionHistory(sessionChildren, uid);

      return acc;
    }, {}) || {};

export const getPluginPageBlockDataQuery = `[
  :find (pull ?pluginPageChildren [
    :block/string
    :block/children
    :block/order
    {:block/children ...}])
    :in $ ?pageTitle ?dataBlockName
    :where
    [?page :node/title ?pageTitle]
    [?page :block/children ?pluginPageChildren]
    [?pluginPageChildren :block/string ?dataBlockName]
  ]`;

const getPluginPageBlockData = async ({ dataPageTitle, blockName }) => {
  return await window.roamAlphaAPI.q(getPluginPageBlockDataQuery, dataPageTitle, blockName);
};

export const getPluginPageData = async ({ dataPageTitle, limitToLatest = true }) => {
  const queryResultsData = await getPluginPageBlockData({ dataPageTitle, blockName: 'data' });

  if (!queryResultsData.length) return {};

  return limitToLatest
    ? mapPluginPageDataLatest(queryResultsData)
    : mapPluginPageData(queryResultsData);
};

const mapPluginPageCachedData = (queryResultsData) => {
  const data = queryResultsData.map((arr) => arr[0])[0].children;
  if (!data?.length) return {};

  return (
    data.reduce((acc, cur) => {
      if (!cur?.string) return acc;
      const tag = getStringBetween(cur.string, '[[', ']]');
      acc[tag] =
        cur.children?.reduce((acc, cur) => {
          if (!cur.string) return acc;
          const [key, value] = cur.string.split('::').map((s: string) => s.trim());

          const date = parseRoamDateString(value);
          acc[key] = date ? date : value;

          return acc;
        }, {}) || {};
      return acc;
    }, {}) || {}
  );
};

export const getPluginPageCachedData = async ({ dataPageTitle }) => {
  const queryResultsData = await getPluginPageBlockData({ dataPageTitle, blockName: 'cache' });

  if (!queryResultsData.length) return {};

  return mapPluginPageCachedData(queryResultsData);
};

export const getSessionData = async ({
  pluginPageData,
  tag,
  dataPageTitle,
}: {
  pluginPageData: Records;
  tag: string;
  dataPageTitle: string;
}) => {
  let allTagCardsUids: string[];

  if (tag === DAILYNOTE_DECK_KEY) {
    allTagCardsUids = await getDailyNoteBlockUids();
  } else {
    const tagReferencesIds = await getPageReferenceIds(tag, dataPageTitle);
    const tagPageBlocksIds = await getSelectedTagPageBlocksIds(tag);
    allTagCardsUids = tagReferencesIds.concat(tagPageBlocksIds);
  }

  const allTagCardsUidsSet = new Set(allTagCardsUids);

  const selectedTagCardsData = Object.keys(pluginPageData).reduce((acc, cur) => {
    if (allTagCardsUidsSet.has(cur)) {
      acc[cur] = pluginPageData[cur];
    }
    return acc;
  }, {});

  return {
    sessionData: selectedTagCardsData,
    cardUids: allTagCardsUids,
  };
};

export const getChildSessionData = async ({
  childUids,
  dataPageTitle,
  existingPluginPageData,
}: {
  childUids: string[];
  dataPageTitle: string;
  existingPluginPageData?: Records;
}): Promise<Records> => {
  if (!childUids.length) return {};

  // Prefer cached data to avoid full data page reload
  const pluginPageData =
    existingPluginPageData ||
    ((await getPluginPageData({
      dataPageTitle,
      limitToLatest: true,
    })) as Records);

  const result: Records = {};

  for (const uid of childUids) {
    if (pluginPageData[uid]) {
      result[uid] = pluginPageData[uid];
    }
  }

  return result;
};

const limitRemainingPracticeData = ({
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
  let parsedDeckConfigs: DeckConfig[] = [];
  try {
    parsedDeckConfigs = JSON.parse(deckConfigs);
  } catch {
    parsedDeckConfigs = [];
  }

  const weightMap: Record<string, number> = {};
  for (const config of parsedDeckConfigs) {
    weightMap[config.name] = config.weight;
  }

  // Zero out weight-0 decks: they must receive no cards regardless of
  // daily limit.  This must happen before any totals are computed so the
  // completed / due / new counts are accurate for the limit calculation.
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

  const deckCaps: Record<string, number> = {};
  for (const tag of tagsList) {
    if (tag in weightMap) {
      deckCaps[tag] = Math.floor(dailyLimit * (weightMap[tag] / 100));
    }
  }

  // Exclude weight-0 decks from totals so the limit calculation is accurate.
  const enabledTags = tagsList.filter((tag) => !(tag in weightMap) || weightMap[tag] > 0);
  const totalCompleted = enabledTags.reduce((sum, tag) => sum + today.tags[tag].completed, 0);
  const totalDueAvailable = enabledTags.reduce((sum, tag) => sum + today.tags[tag].dueUids.length, 0);
  const totalNewAvailable = enabledTags.reduce((sum, tag) => sum + today.tags[tag].newUids.length, 0);
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

  let totalAllocated = dueSelected + newSelected;
  if (totalAllocated < remainingLimit) {
    let unused = remainingLimit - totalAllocated;

    while (unused > 0 && newSelected < targetNew) {
      let addedInThisRound = false;
      for (const tag of tagsList) {
        if (unused <= 0 || newSelected >= targetNew) break;
        if (tag in weightMap && weightMap[tag] === 0) continue;

        const currentSelected = selectedCards[tag];
        if (currentSelected.newUids.length < today.tags[tag].newUids.length) {
          currentSelected.newUids.push(today.tags[tag].newUids[currentSelected.newUids.length]);
          deckSelected[tag]++;
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
          deckSelected[tag]++;
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
          deckSelected[tag]++;
          totalAllocated++;
          unused--;
          addedInThisRound = true;
        }
      }
      if (!addedInThisRound) break;
    }
  }

  if (totalAllocated > remainingLimit) {
    let excess = totalAllocated - remainingLimit;
    const reverseTags = [...tagsList].reverse();
    for (const tag of reverseTags) {
      while (excess > 0 && selectedCards[tag].newUids.length > 0) {
        selectedCards[tag].newUids.pop();
        deckSelected[tag]--;
        totalAllocated--;
        excess--;
      }
      while (excess > 0 && selectedCards[tag].dueUids.length > 0) {
        selectedCards[tag].dueUids.pop();
        deckSelected[tag]--;
        totalAllocated--;
        excess--;
      }
      if (excess <= 0) break;
    }
  }

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

export const undoLatestSession = async ({
  refUid,
  dataPageTitle,
}: {
  refUid: string;
  dataPageTitle: string;
}): Promise<void> => {
  const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'data', -1, {
    open: false,
    heading: 3,
  });

  const cardDataBlockUid = await getOrCreateChildBlock(dataBlockUid, `((${refUid}))`, 0, {
    open: false,
  });

  const existingCardChildren = await window.roamAlphaAPI.q(
    `[:find (pull ?card [:block/children :block/uid {:block/children [:block/uid :block/string :block/order {:block/children [:block/uid :block/string :block/order]}]}])
         :in $ ?cardUid
         :where [?card :block/uid ?cardUid]]`,
    cardDataBlockUid
  );

  const children = existingCardChildren?.[0]?.[0]?.children || [];

  const dateBlocks = children
    .filter((c) => {
      if (!c?.string) return false;
      const dateStr = stringUtils.getStringBetween(c.string, '[[', ']]');
      return !!stringUtils.parseRoamDateString(dateStr);
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (dateBlocks.length > 0 && dateBlocks[0].uid) {
    await window.roamAlphaAPI.deleteBlock({ block: { uid: dateBlocks[0].uid } });
  }
};
