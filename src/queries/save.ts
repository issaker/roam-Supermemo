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
import { SchedulingAlgorithm, InteractionStyle, isGradingAlgorithm } from '~/models/session';
import {
  createChildBlock,
  getChildBlock,
  getOrCreateBlockOnPage,
  getOrCreateChildBlock,
  getOrCreatePage,
} from '~/queries/utils';
import { SESSION_SNAPSHOT_KEYS, getChildSessionData } from '~/queries/data';

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
  const cardChildren = await window.roamAlphaAPI.q(
    `[:find (pull ?card [:block/children :block/uid {:block/children [:block/uid :block/string :block/order {:block/children [:block/uid :block/string :block/order]}]}])
         :in $ ?cardUid
         :where [?card :block/uid ?cardUid]]`,
    cardDataBlockUid
  );

  const children = cardChildren?.[0]?.[0]?.children || [];
  const dateBlocks = children
    .filter((c) => {
      if (!c?.string) return false;
      const dateStr = stringUtils.getStringBetween(c.string, '[[', ']]');
      return !!stringUtils.parseRoamDateString(dateStr);
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (!dateBlocks.length) {
    const dateStr = stringUtils.dateToRoamDateString(new Date());
    const sessionBlockUid = await createChildBlock(
      cardDataBlockUid,
      `[[${dateStr}]] ⚪`,
      0,
      { open: false }
    );
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
 * 同日 Session Block 去重逻辑：
 * 如果当天已有 session block，则更新其标题（emoji 可能变化）并删除旧子字段后重新写入，
 * 而不是创建新的日期 block。这避免了同一卡片在同一天产生多个重复的 session block。
 *
 * 字段完整性保护：
 * 重写前校验写入数据是否覆盖了 SESSION_SNAPSHOT_KEYS 中的所有已存在字段。
 * 缺失字段从同日 session block 的现有子块中补全，防止"删除全部→重写"策略丢失字段。
 */
export const savePracticeData = async ({ refUid, dataPageTitle, dateCreated, ...data }) => {
  await getOrCreatePage(dataPageTitle);
  const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'data', -1, {
    open: false,
    heading: 3,
  });

  const cardDataBlockUid = await getOrCreateChildBlock(dataBlockUid, `((${refUid}))`, 0, {
    open: false,
  });

  const referenceDate = dateCreated || new Date();
  const dateCreatedRoamDateString = stringUtils.dateToRoamDateString(referenceDate);
  const emoji = getEmojiFromGrade(data.sm2_grade, data.algorithm);
  const sessionBlockTitle = `[[${dateCreatedRoamDateString}]] ${emoji}`;

  const existingCardChildren = await window.roamAlphaAPI.q(
    `[:find (pull ?card [:block/children :block/uid {:block/children [:block/uid :block/string :block/order {:block/children [:block/uid :block/string :block/order]}]}])
         :in $ ?cardUid
         :where [?card :block/uid ?cardUid]]`,
    cardDataBlockUid
  );

  const children = existingCardChildren?.[0]?.[0]?.children || [];
  const todayBlock = children.find((c) => {
    if (!c?.string) return false;
    const dateStr = stringUtils.getStringBetween(c.string, '[[', ']]');
    return dateStr === dateCreatedRoamDateString;
  });

  let sessionBlockUid: string;

  if (todayBlock) {
    sessionBlockUid = todayBlock.uid;
    await window.roamAlphaAPI.updateBlock({
      block: { uid: todayBlock.uid, string: sessionBlockTitle },
    });

    if (todayBlock.children) {
      const existingFields: Record<string, any> = {};
      for (const child of todayBlock.children) {
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

      for (const child of todayBlock.children) {
        if (child?.uid) {
          await window.roamAlphaAPI.deleteBlock({ block: { uid: child.uid } });
        }
      }
    }
  } else {
    sessionBlockUid = await createChildBlock(
      cardDataBlockUid,
      sessionBlockTitle,
      0,
      { open: false }
    );
  }

  const nextDueDate = data.nextDueDate !== undefined ? data.nextDueDate : dateUtils.addDays(referenceDate, data.sm2_interval);

  for (const key of Object.keys(data)) {
    if (data[key] === undefined) continue;
    // algorithm 和 interaction 在循环后显式写入，确保它们总是位于 session block 末尾。
    // 这样 parseFieldValuesFromChildren 解析时，后写入的值覆盖先写入的同名值，
    // 保证最新配置生效（与 deduplicateSessionFields 保留最后一条的逻辑一致）。
    if (key === 'algorithm') continue;
    if (key === 'interaction') continue;

    let value = data[key];
    if (key === 'nextDueDate') {
      value = `[[${stringUtils.dateToRoamDateString(nextDueDate)}]]`;
    }
    if (key === 'sm2_eFactor' && typeof value === 'number') {
      value = value.toFixed(2);
    }

    await createChildBlock(sessionBlockUid, `${key}:: ${value}`, -1);
  }

  if (data.algorithm) {
    await createChildBlock(sessionBlockUid, `algorithm:: ${data.algorithm}`, -1);
  }
  if (data.interaction) {
    await createChildBlock(sessionBlockUid, `interaction:: ${data.interaction}`, -1);
  }
};

/**
 * Update the parent LBL block's nextDueDate based on child block sessions.
 * Called after grading a child block in LBL mode.
 *
 * Logic:
 *   - If any child block has no session or is due → nextDueDate = today
 *   - Otherwise → nextDueDate = earliest child nextDueDate
 */
export const updateParentNextDueDate = async ({
  refUid,
  childUids,
  dataPageTitle,
}: {
  refUid: string;
  childUids: string[];
  dataPageTitle: string;
}) => {
  await getOrCreatePage(dataPageTitle);
  const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'data', -1, {
    open: false,
    heading: 3,
  });

  const cardDataBlockUid = await getChildBlock(dataBlockUid, `((${refUid}))`);
  if (!cardDataBlockUid) return;

  const childSessions = await getChildSessionData({ childUids, dataPageTitle });

  const now = new Date();
  let hasDueOrUnread = false;
  let earliestDueDate: Date | null = null;

  for (const uid of childUids) {
    const session = childSessions[uid] as any;
    if (!session || !session.nextDueDate) {
      hasDueOrUnread = true;
      break;
    }
    if (session.nextDueDate <= now) {
      hasDueOrUnread = true;
      break;
    }
    if (!earliestDueDate || session.nextDueDate < earliestDueDate) {
      earliestDueDate = session.nextDueDate;
    }
  }

  if (hasDueOrUnread) {
    const todayString = `[[${stringUtils.dateToRoamDateString(now)}]]`;
    await upsertLatestSessionField({
      cardDataBlockUid,
      key: 'nextDueDate',
      value: todayString,
    });
  } else if (earliestDueDate) {
    const dueDateString = `[[${stringUtils.dateToRoamDateString(earliestDueDate)}]]`;
    await upsertLatestSessionField({
      cardDataBlockUid,
      key: 'nextDueDate',
      value: dueDateString,
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
  await getOrCreatePage(dataPageTitle);
  const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'data', -1, {
    open: false,
    heading: 3,
  });

  const cardDataBlockUid = await getOrCreateChildBlock(dataBlockUid, `((${refUid}))`, 0, {
    open: false,
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
