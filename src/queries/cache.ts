import * as stringUtils from '~/utils/string';
import * as dateUtils from '~/utils/date';
import {
  createChildBlock,
  getChildBlock,
  ensureDataBlock,
} from '~/queries/utils';

export const saveCacheData = async ({ dataPageTitle, data, selectedTag }: { dataPageTitle: string; data: Record<string, any>; selectedTag: string }) => {
  const selectedTagBlockUid = await ensureDataBlock({
    dataPageTitle,
    sectionName: 'cache',
    childTitle: `[[${selectedTag}]]`,
  });

  // Insert new block info
  for (const key of Object.keys(data)) {
    // Delete block that starts with key if already exists
    const existingBlockUid = await getChildBlock(selectedTagBlockUid, `${key}::`, {
      exactMatch: false,
    });
    if (existingBlockUid) {
      await window.roamAlphaAPI.deleteBlock({ block: { uid: existingBlockUid } });
    }

    let value = data[key];
    if (dateUtils.isDate(value)) {
      value = stringUtils.dateToRoamDateString(value);
    }

    await createChildBlock(selectedTagBlockUid, `${key}:: ${value}`, -1);
  }
};

export const deleteCacheDataKey = async ({ dataPageTitle, selectedTag, toDeleteKeyId }: { dataPageTitle: string; selectedTag: string; toDeleteKeyId: string }) => {
  const selectedTagBlockUid = await ensureDataBlock({
    dataPageTitle,
    sectionName: 'cache',
    childTitle: `[[${selectedTag}]]`,
  });

  const existingBlockUid = await getChildBlock(selectedTagBlockUid, `${toDeleteKeyId}::`, {
    exactMatch: false,
  });

  if (existingBlockUid) {
    await window.roamAlphaAPI.deleteBlock({ block: { uid: existingBlockUid } });
  }
};
