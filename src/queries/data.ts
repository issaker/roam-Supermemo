/**
 * Practice Data Queries
 *
 * Core data layer that reads practice session data from the Roam data page.
 *
 * Unified Data Page Structure (no meta block):
 *   roam/Supermemo (page)
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
import { getStringBetween, parseRoamDateString } from '~/utils/string';
import * as stringUtils from '~/utils/string';
import { Records, RecordUid, CompleteRecords, InteractionStyle } from '~/models/session';
import { classifyAllCards } from '~/queries/today';
import { TagCardSets } from '~/models/practice';
import {
  getChildBlocksOnPage,
  getDailyNoteBlockUids,
  getOrCreateBlockOnPage,
  getOrCreateChildBlock,
  batchFetchChildrenUids,
} from './utils';
import { DAILYNOTE_DECK_KEY } from '~/constants';
import { isSessionHeadingBlock, parseLatestSession, parseSessionHistory } from './dataProcessing';
export { SESSION_SNAPSHOT_KEYS } from './dataProcessing';

export const getSortedDateBlocks = async (
  cardDataBlockUid: string
): Promise<Array<{ uid: string; string: string; order: number; children?: any[] }>> => {
  const cardChildren = await window.roamAlphaAPI.q(
    `[:find (pull ?card [:block/children :block/uid {:block/children [:block/uid :block/string :block/order {:block/children [:block/uid :block/string :block/order]}]}])
         :in $ ?cardUid
         :where [?card :block/uid ?cardUid]]`,
    cardDataBlockUid
  );

  const children = cardChildren?.[0]?.[0]?.children || [];

  return children
    .filter((c) => {
      if (!c?.string) return false;
      const dateStr = stringUtils.getStringBetween(c.string, '[[', ']]');
      return !!stringUtils.parseRoamDateString(dateStr);
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
};

export const getPracticeData = async ({
  tagsList,
  dataPageTitle,
  isCramming,
  shuffleCards,
  cachedData,
  deckConfigs,
}: {
  tagsList: string[];
  dataPageTitle: string;
  isCramming: boolean;
  shuffleCards: boolean;
  cachedData: Record<string, any>;
  deckConfigs: string;
}): Promise<{ practiceData: Records; tagCardSets: TagCardSets }> => {
  const pluginPageData = (await getPluginPageData({
    dataPageTitle,
    limitToLatest: true,
  })) as Records;

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

  // ── LBL Mini-Deck: identify LBL parents and fetch their child UIDs ──
  // LBL decks are classified from children's collective state (classifyLblDeck),
  // never from the parent's own dateCreated/nextDueDate. This map provides
  // the parent→children relationship needed by the pipeline.
  const lblDeckMeta = await buildLblDeckMeta(pluginPageData);

  // 2-step pipeline (replaces the previous 7-step pipeline):
  //   1. classifyAllCards  → TagCardSets (due/new/completed per tag)
  //   2. allocateDailyCards → trimmed TagCardSets (daily limit applied)
  const tagCardSets = classifyAllCards({
    tagsList,
    sessionData,
    cardUids,
    pluginPageData,
    lblDeckMeta,
    deckConfigs,
    cachedData,
    isCramming,
    shuffleCards,
  });

  return {
    practiceData: pluginPageData,
    tagCardSets,
  };
};

/**
 * Identify LBL parent cards and batch-fetch their child block UIDs.
 *
 * Returns a map: parentUid → childUid[]. Only includes cards whose
 * interaction is LBL and have session data (not isNew). The child UIDs
 * are sorted by :block/order (document reading order).
 */
const buildLblDeckMeta = async (pluginPageData: Records): Promise<Record<string, string[]>> => {
  const lblParentUids = Object.keys(pluginPageData).filter((uid) => {
    const session = pluginPageData[uid] as Record<string, any> & { isNew?: boolean };
    return session?.interaction === InteractionStyle.LBL && !session?.isNew;
  });

  if (!lblParentUids.length) return {};

  return batchFetchChildrenUids(lblParentUids);
};

export const getDataPageQuery = (dataPageTitle: string) => `[
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

const getPageReferenceIds = async (tag: string, dataPageTitle: string): Promise<string[]> => {
  const dataPageResult = window.roamAlphaAPI.q(getDataPageQuery(dataPageTitle));
  const dataPageUid = dataPageResult.length ? dataPageResult[0][0] : '';
  const results = window.roamAlphaAPI.q(dataPageReferencesIdsQuery, tag, dataPageUid);
  return results.map((arr) => arr[0]);
};

export const getSelectedTagPageBlocksIds = async (selectedTag: string): Promise<string[]> => {
  const queryResults = await getChildBlocksOnPage(selectedTag);
  if (!queryResults.length) return [];

  const children = queryResults[0][0].children;
  const filteredChildren = children.filter((child) => !!child.string);
  return filteredChildren.map((arr) => arr.uid);
};

const mapPluginPageDataLatest = (queryResultsData: any[]): Records =>
  queryResultsData
    .map((arr) => arr[0])[0]
    .children?.reduce((acc, cur) => {
      if (!cur?.string) return acc;
      const uid = getStringBetween(cur.string, '((', '))');
      const sessionChildren = cur.children?.filter(isSessionHeadingBlock) || [];
      acc[uid] = parseLatestSession(sessionChildren, uid);
      return acc;
    }, {}) || {};

const mapPluginPageData = (queryResultsData: any[]): CompleteRecords =>
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

  const dateBlocks = await getSortedDateBlocks(cardDataBlockUid);

  if (dateBlocks.length > 0 && dateBlocks[0].uid) {
    await window.roamAlphaAPI.deleteBlock({ block: { uid: dateBlocks[0].uid } });
  }
};
