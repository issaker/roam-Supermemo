import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import PracticeOverlay from '~/components/overlay/PracticeOverlay';
import SidePanelWidget from '~/components/SidePanelWidget';
import { PracticeSessionProvider } from '~/contexts/PracticeSessionContext';
import usePracticeData from '~/hooks/usePracticeData';
import useTags from '~/hooks/useTags';
import useSettings from '~/hooks/useSettings';
import useCollapseReferenceList from '~/hooks/useCollapseReferenceList';
import useOnBlockInteract from '~/hooks/useOnBlockInteract';
import useCommandPaletteAction from '~/hooks/useCommandPaletteAction';
import useCachedData from '~/hooks/useCachedData';
import useOnVisibilityStateChange from '~/hooks/useOnVisibilityStateChange';
import { allocateDailyCards } from '~/queries/dataProcessing';

const App = () => {
  const [showPracticeOverlay, setShowPracticeOverlay] = React.useState(false);
  const [isCramming, setIsCramming] = React.useState(false);

  const { settings, updateSetting } = useSettings();
  const { dailyLimit, deckConfigs, dataPageTitle, shuffleCards } = settings;
  const { selectedTag, setSelectedTag, tagsList } = useTags({ deckConfigs });

  const { fetchCacheData, data: cachedData } = useCachedData({ dataPageTitle });

  const { practiceData, tagCardSets, fetchPracticeData } = usePracticeData({
    tagsList,
    selectedTag,
    dataPageTitle,
    cachedData,
    shuffleCards,
    deckConfigs,
  });

  const filteredTagCardSets = React.useMemo(() => {
    if (!dailyLimit || isCramming || !Object.keys(tagCardSets).length) return tagCardSets;
    return allocateDailyCards({ tagCardSets, dailyLimit, tagsList, isCramming, deckConfigs });
  }, [tagCardSets, dailyLimit, tagsList, isCramming, deckConfigs]);

  const refreshData = React.useCallback(() => {
    fetchCacheData();
    fetchPracticeData();
  }, [fetchCacheData, fetchPracticeData]);

  React.useEffect(() => {
    refreshData();
  }, [deckConfigs, refreshData]);

  useOnVisibilityStateChange(() => {
    if (showPracticeOverlay) return;
    refreshData();
  });

  const onShowPracticeOverlay = () => {
    refreshData();
    setShowPracticeOverlay(true);
    setIsCramming(false);
  };

  const onClosePracticeOverlayCallback = () => {
    setShowPracticeOverlay(false);
    setIsCramming(false);
    refreshData();
  };

  useCollapseReferenceList({ dataPageTitle });

  const tagsOnEnterRef = React.useRef<string[]>([]);
  const tagsListRef = React.useRef(tagsList);
  const showPracticeOverlayRef = React.useRef(showPracticeOverlay);
  const fetchPracticeDataRef = React.useRef(fetchPracticeData);

  React.useEffect(() => {
    tagsListRef.current = tagsList;
  }, [tagsList]);

  React.useEffect(() => {
    showPracticeOverlayRef.current = showPracticeOverlay;
  }, [showPracticeOverlay]);

  React.useEffect(() => {
    fetchPracticeDataRef.current = fetchPracticeData;
  }, [fetchPracticeData]);

  const onBlockEnterHandler = (elm: HTMLTextAreaElement) => {
    const tags = tagsListRef.current.filter((tag) => elm.value.includes(tag));
    tagsOnEnterRef.current = tags;
  };
  const onBlockLeaveHandler = (elm: HTMLTextAreaElement) => {
    if (showPracticeOverlayRef.current) return;

    const tags = tagsListRef.current.filter((tag) => elm.value.includes(tag));

    if (tagsOnEnterRef.current.length !== tags.length) {
      fetchPracticeDataRef.current();
    }
  };

  useOnBlockInteract({
    onEnterCallback: onBlockEnterHandler,
    onLeaveCallback: onBlockLeaveHandler,
  });

  useCommandPaletteAction({ onShowPracticeOverlay });

  return (
    <Blueprint.HotkeysProvider>
      <>
        <SidePanelWidget
          onClickCallback={onShowPracticeOverlay}
          tagCardSets={filteredTagCardSets}
        />
        <PracticeSessionProvider
          settings={settings}
          practiceData={practiceData}
          tagCardSets={filteredTagCardSets}
          selectedTag={selectedTag}
          tagsList={tagsList}
          isCramming={isCramming}
          setIsCramming={setIsCramming}
          handleMemoTagChange={setSelectedTag}
          fetchPracticeData={fetchPracticeData}
          dataPageTitle={dataPageTitle}
          updateSetting={updateSetting}
        >
          <PracticeOverlay
            isOpen={showPracticeOverlay}
            onCloseCallback={onClosePracticeOverlayCallback}
          />
        </PracticeSessionProvider>
      </>
    </Blueprint.HotkeysProvider>
  );
};

export default App;
