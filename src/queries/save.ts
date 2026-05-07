/**
 * Practice Data Persistence
 *
 * Handles writing practice results to the Roam data page.
 *
 * Unified data layout — all fields stored in session blocks:
 *   ((cardUid))
 *   ├── [[Date]] 🟢            ← latest session block
 *   │   ├── algorithm:: SM2
 *   │   ├── interaction:: NORMAL
 *   │   ├── nextDueDate:: [[Date]]
 *   │   ├── sm2_grade:: 5
 *   │   ├── sm2_eFactor:: 2.5
 *   │   └── ...
 *   └── [[Date]] 🔴            ← older session block
 *       └── ...
 *
 * LBL child blocks have their own independent session entries:
 *   ((childUid))
 *   ├── [[Date]] 🟢
 *   │   ├── algorithm:: SM2
 *   │   ├── interaction:: NORMAL
 *   │   ├── nextDueDate:: [[Date]]
 *   │   └── ...
 *
 * The meta block has been removed. algorithm and interaction are now
 * stored in each session record alongside algorithm-specific fields.
 * The interaction value (NORMAL or LBL) encodes the review mode.
 *
 * Three algorithms: SM2 (memory), Progressive (reading), FixedTime (custom time).
 */
import * as stringUtils from '~/utils/string';
import * as dateUtils from '~/utils/date';
import {
  Records,
  SchedulingAlgorithm,
  InteractionStyle,
  isGradingAlgorithm,
  deriveParentNextDueDateFromChildSessions,
  isSessionDue,
} from '~/models/session';
import { createChildBlock, ensureDataBlock } from '~/queries/utils';
import {
  SESSION_SNAPSHOT_KEYS,
  getChildSessionData,
  undoLatestSession,
  getSortedDateBlocks,
} from '~/queries/data';

const NUMERIC_SESSION_KEYS = [
  'sm2_grade',
  'sm2_interval',
  'sm2_repetitions',
  'sm2_eFactor',
  'progressive_repetitions',
  'progressive_interval',
  'fixed_multiplier',
];

const getEmojiFromGrade = (grade, algorithm?: string) => {
  if (grade === undefined && !isGradingAlgorithm(algorithm as SchedulingAlgorithm)) {
    return '🟢';
  }
  switch (grade) {
    case 5:
      return '🟢';
    case 4:
      return '🔵';
    case 3:
      return '🟠';
    case 2:
      return '🟠';
    case 1:
      return '🟠';
    case 0:
      return '🔴';
    default:
      return '⚪';
  }
};

/**
 * Upsert a field in the latest session block for a card.
 * Finds the most recent date-headed block and updates or creates the field.
 */
const upsertLatestSessionField = async ({
  cardDataBlockUid,
  key,
  value,
}: {
  cardDataBlockUid: string;
  key: string;
  value: string;
}) => {
  const dateBlocks = await getSortedDateBlocks(cardDataBlockUid);

  if (!dateBlocks.length) {
    const dateStr = stringUtils.dateToRoamDateString(new Date());
    const sessionBlockUid = await createChildBlock(cardDataBlockUid, `[[${dateStr}]] ⚪`, 0, {
      open: false,
    });
    await createChildBlock(sessionBlockUid, `${key}:: ${value}`, -1);
    return;
  }

  const latestDateBlock = dateBlocks[0];
  if (!latestDateBlock?.children) {
    await createChildBlock(latestDateBlock.uid, `${key}:: ${value}`, -1, { open: false });
    return;
  }

  const existingField = latestDateBlock.children.find((c) => {
    if (!c?.string) return false;
    return c.string.startsWith(`${key}::`);
  });

  if (existingField) {
    await window.roamAlphaAPI.updateBlock({
      block: { uid: existingField.uid, string: `${key}:: ${value}` },
    });
  } else {
    await createChildBlock(latestDateBlock.uid, `${key}:: ${value}`, -1, { open: false });
  }
};

/**
 * Save a single practice session result to the data page.
 * All fields (including algorithm, interaction, nextDueDate)
 * are written to the session block.
 *
 * Always creates a new session block for each practice result.
 * The undo mechanism (undoLatestSession) handles cleanup of the latest
 * records when the user chooses to undo and re-learn.
 *
 * Field integrity protection:
 * Before creating, verify that the write data covers all fields in SESSION_SNAPSHOT_KEYS.
 * Missing fields are backfilled from the latest existing session block,
 * preventing data loss when switching algorithms or after undo operations.
 */
export const savePracticeData = async ({
  refUid,
  dataPageTitle,
  dateCreated,
  ...data
}: {
  refUid: string;
  dataPageTitle: string;
  dateCreated?: Date;
  [key: string]: any;
}) => {
  const cardDataBlockUid = await ensureDataBlock({
    dataPageTitle,
    sectionName: 'data',
    childTitle: `((${refUid}))`,
  });

  const referenceDate = dateCreated || new Date();
  const dateCreatedRoamDateString = stringUtils.dateToRoamDateString(referenceDate);
  const emoji = getEmojiFromGrade(data.sm2_grade, data.algorithm);
  const sessionBlockTitle = `[[${dateCreatedRoamDateString}]] ${emoji}`;

  const dateBlocks = await getSortedDateBlocks(cardDataBlockUid);

  if (dateBlocks.length > 0) {
    const latestBlock = dateBlocks[0];
    if (latestBlock.children) {
      const existingFields: Record<string, any> = {};
      for (const child of latestBlock.children) {
        if (child?.string) {
          const [key, value] = stringUtils.parseConfigString(child.string);
          if (key && SESSION_SNAPSHOT_KEYS.includes(key as any) && data[key] === undefined) {
            existingFields[key] = value;
          }
        }
      }
      for (const key of Object.keys(existingFields)) {
        if (data[key] === undefined) {
          let value = existingFields[key];
          if (NUMERIC_SESSION_KEYS.includes(key) && typeof value === 'string') {
            const num = Number(value);
            if (!isNaN(num)) value = num;
          }
          data[key] = value;
        }
      }
    }
  }

  // Bug fix: 首次练习时创建基线 session block，保存卡片原始身份属性
  // 根因：撤销首次练习后，唯一 session 被物理删除，卡片变为 NewSession，
  //   algorithm 回退到默认 PROGRESSIVE，LBL 子卡丢失原始 SM2 身份
  // 方案：首次练习前先创建仅含 algorithm + interaction 的基线记录，
  //   作为撤销时的回归点，确保卡片原始身份不丢失
  if (dateBlocks.length === 0 && data.algorithm) {
    const baselineBlockUid = await createChildBlock(
      cardDataBlockUid,
      `[[${dateCreatedRoamDateString}]] ⚪`,
      0,
      { open: false }
    );
    await createChildBlock(baselineBlockUid, `algorithm:: ${data.algorithm}`, -1);
    if (data.interaction) {
      await createChildBlock(baselineBlockUid, `interaction:: ${data.interaction}`, -1);
    }
  }

  const sessionBlockUid = await createChildBlock(cardDataBlockUid, sessionBlockTitle, 0, {
    open: false,
  });

  const nextDueDate =
    data.nextDueDate !== undefined
      ? data.nextDueDate
      : dateUtils.addDays(referenceDate, data.sm2_interval);

  // Promise.all: create child blocks in parallel, reduces serial wait time
  const fieldEntries = Object.keys(data)
    .filter((key) => data[key] !== undefined && key !== 'algorithm' && key !== 'interaction')
    .map((key) => {
      let value = data[key];
      if (key === 'nextDueDate') {
        value = `[[${stringUtils.dateToRoamDateString(nextDueDate)}]]`;
      }
      if (key === 'sm2_eFactor' && typeof value === 'number') {
        value = value.toFixed(2);
      }
      return createChildBlock(sessionBlockUid, `${key}:: ${value}`, -1);
    });

  await Promise.all(fieldEntries);

  if (data.algorithm) {
    await createChildBlock(sessionBlockUid, `algorithm:: ${data.algorithm}`, -1);
  }
  if (data.interaction) {
    await createChildBlock(sessionBlockUid, `interaction:: ${data.interaction}`, -1);
  }
};

// Update the parent LBL block's nextDueDate from child sessions.
// If any child is due → nextDueDate = today; otherwise → earliest child nextDueDate.
// When childSessions is provided (from optimistic update), the Roam re-read is skipped.
export const updateParentNextDueDate = async ({
  refUid,
  childUids,
  dataPageTitle,
  childSessions: childSessionsIn,
}: {
  refUid: string;
  childUids: string[];
  dataPageTitle: string;
  childSessions?: Record<string, any>;
}) => {
  const cardDataBlockUid = await ensureDataBlock({
    dataPageTitle,
    sectionName: 'data',
    childTitle: `((${refUid}))`,
  });

  const childSessions =
    childSessionsIn || (await getChildSessionData({ childUids, dataPageTitle }));

  const now = new Date();
  const parentNextDueDate = deriveParentNextDueDateFromChildSessions(
    childUids,
    childSessions as Record<string, any>,
    now
  );

  if (isSessionDue({ nextDueDate: parentNextDueDate }, now)) {
    await upsertLatestSessionField({
      cardDataBlockUid,
      key: 'nextDueDate',
      value: `[[${stringUtils.dateToRoamDateString(now)}]]`,
    });
  } else {
    await upsertLatestSessionField({
      cardDataBlockUid,
      key: 'nextDueDate',
      value: `[[${stringUtils.dateToRoamDateString(parentNextDueDate)}]]`,
    });
  }
};

/**
 * Update algorithm and interaction in the latest session block.
 * lineByLineReview is no longer stored — LBL is encoded in interaction.
 */
export const updateReviewConfig = async ({
  refUid,
  dataPageTitle,
  algorithm,
  interaction,
}: {
  refUid: string;
  dataPageTitle: string;
  algorithm?: SchedulingAlgorithm;
  interaction?: InteractionStyle;
}) => {
  const cardDataBlockUid = await ensureDataBlock({
    dataPageTitle,
    sectionName: 'data',
    childTitle: `((${refUid}))`,
  });

  if (algorithm) {
    await upsertLatestSessionField({ cardDataBlockUid, key: 'algorithm', value: algorithm });
  }
  if (interaction) {
    await upsertLatestSessionField({ cardDataBlockUid, key: 'interaction', value: interaction });
  }
};

const DEDUP_FIELD_KEYS = ['algorithm', 'interaction'];

export const deduplicateSessionFields = async ({
  dataPageTitle,
}: {
  dataPageTitle: string;
}): Promise<{ cleaned: number; errors: number }> => {
  const query = `[
    :find (pull ?pluginPageChildren [
      :block/string
      :block/children
      :block/order
      :block/uid
      {:block/children ...}])
    :in $ ?pageTitle ?dataBlockName
    :where
    [?page :node/title ?pageTitle]
    [?page :block/children ?pluginPageChildren]
    [?pluginPageChildren :block/string ?dataBlockName]
  ]`;

  const queryResultsData = await window.roamAlphaAPI.q(query, dataPageTitle, 'data');
  const dataChildren = queryResultsData.map((arr) => arr[0])[0]?.children || [];

  let cleaned = 0;
  let errors = 0;

  for (const cardChild of dataChildren) {
    if (!cardChild?.children) continue;

    for (const sessionBlock of cardChild.children) {
      if (!sessionBlock?.children) continue;

      const keyBlocks: Record<string, { uid: string; string: string }[]> = {};

      for (const field of sessionBlock.children) {
        if (!field?.string || !field.uid) continue;
        const [key] = stringUtils.parseConfigString(field.string);
        if (DEDUP_FIELD_KEYS.includes(key)) {
          if (!keyBlocks[key]) keyBlocks[key] = [];
          keyBlocks[key].push({ uid: field.uid, string: field.string });
        }
      }

      for (const key of Object.keys(keyBlocks)) {
        const blocks = keyBlocks[key];
        if (blocks.length <= 1) continue;

        const keepBlock = blocks[blocks.length - 1];
        for (const block of blocks) {
          if (block.uid === keepBlock.uid) continue;
          try {
            await window.roamAlphaAPI.deleteBlock({ block: { uid: block.uid } });
            cleaned++;
          } catch (err) {
            console.error(`[Memo] Dedup error deleting ${key} block ${block.uid}:`, err);
            errors++;
          }
        }
      }
    }
  }

  return { cleaned, errors };
};

/**
 * Undo a card's latest review session — pure data operation, no queue interaction.
 *
 * This is a CARD operation, not a queue operation.  Per the architecture:
 *   "Card is the atom.  A card is a Roam block + its session.  It does not
 *    know which queue it sits in."
 *
 * Only touches Roam data blocks.  The caller is responsible for updating
 * in-memory facts via the returned Records.
 *
 * @returns Fresh session data for the affected card(s), keyed by uid.
 *          Caller should merge this into facts.latestByUid.
 */
export const undoCardSession = async ({
  targetUid,
  parentUid,
  childUidsList,
  dataPageTitle,
}: {
  targetUid: string;
  parentUid?: string;
  childUidsList?: string[];
  dataPageTitle: string;
}): Promise<Records> => {
  // Deletes the latest session block from Roam, rolling back to the
  // previous session (or making the card "new" if no sessions remain).
  await undoLatestSession({ refUid: targetUid, dataPageTitle });

  // For LBL children: recalculate the parent's nextDueDate based on
  // the rolled-back child session (child is now due again).
  if (parentUid && childUidsList?.length) {
    await updateParentNextDueDate({
      refUid: parentUid,
      childUids: childUidsList,
      dataPageTitle,
    });
  }

  // Reload the affected card(s) from Roam so the caller can update facts.
  const reloadUids: string[] = [targetUid];
  if (parentUid) reloadUids.push(parentUid);
  return await getChildSessionData({ childUids: reloadUids, dataPageTitle });
};
