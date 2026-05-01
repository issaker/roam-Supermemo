import * as stringUtils from '~/utils/string';
import * as dateUtils from '~/utils/date';
import {
  createChildBlock,
  getChildBlock,
  getOrCreateBlockOnPage,
  getOrCreateChildBlock,
  getOrCreatePage,
} from '~/queries/utils';

export const saveCacheData = async ({ dataPageTitle, data, selectedTag }: { dataPageTitle: string; data: Record<string, any>; selectedTag: string }) => {
  await getOrCreatePage(dataPageTitle);
  const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'cache', -1, {
    open: false,
    heading: 3,
  });

  // Insert selected tag parent block
  const selectedTagBlockUid = await getOrCreateChildBlock(dataBlockUid, `[[${selectedTag}]]`, -1, {
    open: false,
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
  await getOrCreatePage(dataPageTitle);
  const dataBlockUid = await getOrCreateBlockOnPage(dataPageTitle, 'cache', -1, {
    open: false,
    heading: 3,
  });

  const selectedTagBlockUid = await getOrCreateChildBlock(dataBlockUid, `[[${selectedTag}]]`, -1, {
    open: false,
  });

  const existingBlockUid = await getChildBlock(selectedTagBlockUid, `${toDeleteKeyId}::`, {
    exactMatch: false,
  });

  if (existingBlockUid) {
    await window.roamAlphaAPI.deleteBlock({ block: { uid: existingBlockUid } });
  }
};
