import * as React from 'react';
import { parseDeckConfigNames } from '~/utils/deckConfig';

const useTags = ({ deckConfigs }: { deckConfigs: string }) => {
  const buildTagsList = React.useCallback((str: string) => {
    return parseDeckConfigNames(str);
  }, []);

  const [tagsList, setTagsList] = React.useState<string[]>(buildTagsList(deckConfigs));
  const [selectedTag, setSelectedTag] = React.useState<string>(tagsList[0]);

  React.useEffect(() => {
    const newList = buildTagsList(deckConfigs);
    setTagsList(newList);
    if (!newList.includes(selectedTag)) {
      setSelectedTag(newList[0]);
    }
  }, [deckConfigs, buildTagsList, selectedTag]);

  return {
    selectedTag,
    setSelectedTag,
    tagsList,
  };
};

export default useTags;
