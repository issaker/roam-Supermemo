import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import PracticeOverlay from '~/components/overlay/PracticeOverlay';
import SidePanelWidget from '~/components/SidePanelWidget';
import { ReviewStoreProvider } from '~/review-runtime/store/context';
import usePracticeData from '~/hooks/usePracticeData';
import useSettings from '~/hooks/useSettings';
import useCollapseReferenceList from '~/hooks/useCollapseReferenceList';
import useOnBlockInteract from '~/hooks/useOnBlockInteract';
import useCommandPaletteAction from '~/hooks/useCommandPaletteAction';
import useCachedData from '~/hooks/useCachedData';
import useOnVisibilityStateChange from '~/hooks/useOnVisibilityStateChange';
import { parseDeckConfigNames } from '~/utils/deckConfig';

const App = () => {
  const [showPracticeOverlay, setShowPracticeOverlay] = React.useState(false);

  const { settings, updateSetting } = useSettings();
  const { deckConfigs, dataPageTitle, shuffleCards } = settings;

  const tagsList = React.useMemo(() => parseDeckConfigNames(deckConfigs), [deckConfigs]);

  const { fetchCacheData, data: cachedData } = useCachedData({ dataPageTitle });

  const { practiceData, tagCardSets, fetchPracticeData } = usePracticeData({
    tagsList,
    dataPageTitle,
    cachedData,
    shuffleCards,
    deckConfigs,
  });

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
  };

  const onClosePracticeOverlayCallback = () => {
    setShowPracticeOverlay(false);
    refreshData();
  };

  useCollapseReferenceList({ dataPageTitle });

  const tagsOnEnterRef = React.useRef<string[]>([]);
  const tagsListRef = React.useRef(tagsList);
  const showPracticeOverlayRef = React.useRef(showPracticeOverlay);
  const fetchPracticeDataRef = React.useRef(fetchPracticeData);

  React.useEffect(() => {
    tagsListRef.current = tagsList;
    showPracticeOverlayRef.current = showPracticeOverlay;
    fetchPracticeDataRef.current = fetchPracticeData;
  }, [tagsList, showPracticeOverlay, fetchPracticeData]);

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
      <ReviewStoreProvider
        tagCardSets={tagCardSets}
        dataPageTitle={dataPageTitle}
        practiceData={practiceData}
        settings={settings}
        fetchPracticeData={fetchPracticeData}
        updateSetting={updateSetting}
      >
        <SidePanelWidget onClickCallback={onShowPracticeOverlay} />
        <PracticeOverlay
          isOpen={showPracticeOverlay}
          onCloseCallback={onClosePracticeOverlayCallback}
        />
      </ReviewStoreProvider>
    </Blueprint.HotkeysProvider>
  );
};

export default App;
