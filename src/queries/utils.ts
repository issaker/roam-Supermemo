/**
 * Roam API Query Utilities
 *
 * Low-level helpers for interacting with Roam Research's Datalog query API
 * and block/page manipulation API.
 *
 * Key functions:
 * - fetchBlockInfo: Gets block content + sorted breadcrumbs
 * - getOrCreatePage/getOrCreateBlockOnPage: Idempotent creation helpers
 * - createChildBlock: Creates a child block under a parent
 * - generateNewSession: Creates default session data for new cards
 */
import { NewSession, SchedulingAlgorithm, InteractionStyle } from '~/models/session';

export const parentChainInfoQuery = `[
  :find (pull ?parentIds [
    :node/title
    :block/string
    :block/uid])
  :in $ ?refId
  :where
    [?block :block/uid ?refId]
    [?block :block/parents ?parentIds]
  ]`;

const getParentChainInfo = async ({ refUid }: { refUid: string }) => {
  const dataResults = await window.roamAlphaAPI.q(parentChainInfoQuery, refUid);
  return dataResults.map((r) => r[0]);
};

export interface BlockInfo {
  string: string;
  children: any[];
  childrenUids?: string[];
  breadcrumbs: Breadcrumbs[];
  refUid: string;
}
export interface Breadcrumbs {
  [index: number]: { uid: string; title: string };
}

export const blockInfoQuery = `[
  :find (pull ?block [
    :block/string
    :block/children
    {:block/children [:block/uid :block/string :block/order]}])
  :in $ ?refId
  :where
    [?block :block/uid ?refId]
  ]`;

export const fetchBlockInfo: (refUid: string) => Promise<BlockInfo> = async (refUid) => {
  const blockInfo = (await window.roamAlphaAPI.q(blockInfoQuery, refUid))[0][0];
  const parentChainInfo = await getParentChainInfo({ refUid });

  const sortedChildren = blockInfo.children?.sort((a, b) => a.order - b.order);

  let breadcrumbs = parentChainInfo;

  if (parentChainInfo.length > 1) {
    const breadcrumbsWithDepth = parentChainInfo.map((parent) => {
      const parentData = window.roamAlphaAPI.pull('[:block/uid {:block/parents [:block/uid]}]', [
        ':block/uid',
        parent.uid,
      ]);

      return {
        ...parent,
        depth: parentData?.[':block/parents']?.length || 0,
      };
    });

    breadcrumbs = breadcrumbsWithDepth
      .sort((a, b) => a.depth - b.depth)
      .map(({ uid, title, string }) => ({ uid, title, string }));
  }

  return {
    string: blockInfo.string,
    children: sortedChildren?.map((child) => child.string),
    childrenUids: sortedChildren?.map((child) => child.uid),
    breadcrumbs,
    refUid,
  };
};

export const getPageQuery = `[
  :find ?uid :in $ ?title
  :where
    [?page :node/title ?title]
    [?page :block/uid ?uid]
]`;

const getPage = (page: string) => {
  const results = window.roamAlphaAPI.q(getPageQuery, page);
  if (results.length) {
    return results[0][0];
  }
};

export const getOrCreatePage = async (pageTitle: string) => {
  const page = getPage(pageTitle);
  if (page) return page;
  const uid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.data.page.create({ page: { title: pageTitle, uid } });

  return getPage(pageTitle);
};

export const getBlockOnPage = (page: string, block: string) => {
  const results = window.roamAlphaAPI.q(
    `
    [:find ?block_uid
     :in $ ?page_title ?block_string
     :where
     [?page :node/title ?page_title]
     [?page :block/uid ?page_uid]
     [?block :block/parents ?page]
     [?block :block/string ?block_string]
     [?block :block/uid ?block_uid]
    ]`,
    page,
    block
  );
  if (results.length) {
    return results[0][0];
  }
};

export const getChildBlock = (
  parent_uid: string,
  block: string,
  options: {
    exactMatch?: boolean;
  } = {
    exactMatch: true,
  }
) => {
  const exactMatchQuery = `
    [:find ?block_uid
    :in $ ?parent_uid ?block_string
    :where
      [?parent :block/uid ?parent_uid]
      [?block :block/parents ?parent]
      [?block :block/string ?block_string]
      [?block :block/uid ?block_uid]
    ]
  `;

  const startsWithQuery = `
    [:find ?block_uid
      :in $ ?parent_uid ?block_sub_string
      :where
        [?parent :block/uid ?parent_uid]
        [?block :block/parents ?parent]
        [?block :block/string ?block_string]
        [(clojure.string/starts-with? ?block_string ?block_sub_string)]
        [?block :block/uid ?block_uid]
    ]
  `;

  const query = options.exactMatch ? exactMatchQuery : startsWithQuery;

  const results = window.roamAlphaAPI.q(query, parent_uid, block);
  if (results.length) {
    return results[0][0];
  }
};

export const childBlocksOnPageQuery = `[
  :find (pull ?tagPage [
    :block/uid
    :block/string
    :block/children
    {:block/children ...}])
  :in $ ?tag
  :where
    [?tagPage :node/title ?tag]
    [?tagPage :block/children ?tagPageChildren]
  ]`;

export const getChildBlocksOnPage = async (page: string) => {
  const queryResults = await window.roamAlphaAPI.q(childBlocksOnPageQuery, page);
  if (!queryResults.length) return [];
  return queryResults;
};

export const DAILY_NOTE_TITLE_PATTERN = /^[A-Z][a-z]+ \d{1,2}(st|nd|rd|th), \d{4}$/;

export const allPagesQuery = `
  [:find ?uid ?title
   :where
   [?page :node/title ?title]
   [?page :block/uid ?uid]]
`;

export const pageTopLevelBlocksQuery = `
  [:find ?blockUid
   :in $ ?pageUid
   :where
   [?page :block/uid ?pageUid]
   [?page :block/children ?block]
   [?block :block/uid ?blockUid]
   [?block :block/string ?str]
   [(not= ?str "")]]
`;

export const getDailyNoteBlockUids = async (): Promise<string[]> => {
  const pages = window.roamAlphaAPI.q(allPagesQuery);

  const dailyNotePageUids = pages
    .filter((arr) => DAILY_NOTE_TITLE_PATTERN.test(arr[1]))
    .map((arr) => arr[0]);

  if (!dailyNotePageUids.length) {
    return [];
  }

  // Single batch query: replaces per-page N+1 query pattern
  const allBlocksQuery = `
    [:find ?blockUid
     :in $ [?pageUid ...]
     :where
     [?page :block/uid ?pageUid]
     [?page :block/children ?block]
     [?block :block/uid ?blockUid]
     [?block :block/string ?str]
     [(not= ?str "")]]
  `;
  const results = window.roamAlphaAPI.q(allBlocksQuery, dailyNotePageUids);
  return results.map((arr) => arr[0]);
};

export const createChildBlock = async (
  parent_uid: string,
  block: string,
  order: number,
  blockProps: Record<string, any> = {}
) => {
  if (!order) {
    order = 0;
  }

  const uid = window.roamAlphaAPI.util.generateUID();
  await window.roamAlphaAPI.createBlock({
    location: { 'parent-uid': parent_uid, order: order },
    block: { string: block, uid, ...blockProps },
  });

  return uid;
};

const createBlockOnPage = async (
  page: string,
  block: string,
  order: number,
  blockProps: Record<string, any>
) => {
  const page_uid = getPage(page);
  return createChildBlock(page_uid, block, order, blockProps);
};

export const getOrCreateBlockOnPage = async (
  page: string,
  block: string,
  order: number,
  blockProps: Record<string, any>
) => {
  const block_uid = getBlockOnPage(page, block);
  if (block_uid) return block_uid;
  return createBlockOnPage(page, block, order, blockProps);
};

export const getOrCreateChildBlock = async (
  parent_uid: string,
  block: string,
  order: number,
  blockProps: Record<string, any>
) => {
  const block_uid = getChildBlock(parent_uid, block);
  if (block_uid) return block_uid;
  return createChildBlock(parent_uid, block, order, blockProps);
};

export const generateNewSession = ({
  algorithm,
  interaction,
  dateCreated = undefined,
  isNew = true,
}: {
  algorithm?: SchedulingAlgorithm;
  interaction?: InteractionStyle;
  dateCreated?: Date;
  isNew?: boolean;
} = {}): NewSession => {
  const effectiveAlgorithm = algorithm ?? SchedulingAlgorithm.PROGRESSIVE;
  const effectiveInteraction = interaction ?? InteractionStyle.NORMAL;

  return {
    dateCreated,
    algorithm: effectiveAlgorithm,
    interaction: effectiveInteraction,
    isNew,
  };
};

/**
 * Batch-fetch direct children UIDs for multiple blocks.
 *
 * Returns a map: parentUid → sorted childUid[] (by :block/order).
 * Used by the pipeline to build lblDeckMeta without N+1 queries.
 */
export const batchFetchChildrenUids = async (
  parentUids: string[]
): Promise<Record<string, string[]>> => {
  if (!parentUids.length) return {};

  const result: Record<string, string[]> = {};

  await Promise.all(
    parentUids.map(async (uid) => {
      try {
        const blockInfo = await fetchBlockInfo(uid);
        result[uid] = blockInfo.childrenUids || [];
      } catch {
        result[uid] = [];
      }
    })
  );

  return result;
};

export const ensureDataBlock = async ({
  dataPageTitle,
  sectionName,
  childTitle,
}: {
  dataPageTitle: string;
  sectionName: string;
  childTitle: string;
}): Promise<string> => {
  await getOrCreatePage(dataPageTitle);
  const sectionBlockUid = await getOrCreateBlockOnPage(dataPageTitle, sectionName, -1, {
    open: false,
    heading: 3,
  });
  return getOrCreateChildBlock(sectionBlockUid, childTitle, childTitle.startsWith('((') ? 0 : -1, {
    open: false,
  });
};
