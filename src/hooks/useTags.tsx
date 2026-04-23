import * as React from 'react';
import { DeckConfig } from '~/hooks/useSettings';

const useTags = ({ deckConfigs }: { deckConfigs: string }) => {
  const buildTagsList = React.useCallback((str: string) => {
    let parsed: string[];
    try {
      const configs: DeckConfig[] = JSON.parse(str);
      parsed = configs.map((c) => c.name);
    } catch {
      parsed = ['memo'];
    }
    return parsed;
  }, []);

  const [tagsList, setTagsList] = React.useState<string[]>(buildTagsList(deckConfigs));
  const [selectedTag, setSelectedTag] = React.useState<string>(tagsList[0]);

  React.useEffect(() => {
    const newList = buildTagsList(deckConfigs);
    setTagsList(newList);
    if (!newList.includes(selectedTag)) {
      setSelectedTag(newList[0]);
    }
  }, [deckConfigs, buildTagsList]);

  return {
    selectedTag,
    setSelectedTag,
    tagsList,
  };
};

export default useTags;
