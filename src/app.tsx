/**
 * App Root Component
 *
 * Orchestrates the entire review workflow:
 * 1. Reads settings and builds tag list (decks)
 * 2. Fetches practice data and cache from the Roam data page
 * 3. Renders sidebar widget and practice overlay
 * 4. Handles card grading via the SM2 / Fixed-Interval algorithms
 *
 * Data flow:
 *   useSettings → useTags → useCachedData → usePracticeData → PracticeOverlay
 */
import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import PracticeOverlay from '~/components/overlay/PracticeOverlay';
import SidePanelWidget from '~/components/SidePanelWidget';
import { PracticeSessionProvider } from '~/contexts/PracticeSessionContext';
import practice from '~/practice';
import usePracticeData from '~/hooks/usePracticeData';
import useTags from '~/hooks/useTags';
import useSettings from '~/hooks/useSettings';
import useCollapseReferenceList from '~/hooks/useCollapseReferenceList';
import useOnBlockInteract from '~/hooks/useOnBlockInteract';
import useCommandPaletteAction from '~/hooks/useCommandPaletteAction';
import useCachedData from '~/hooks/useCachedData';
import useOnVisibilityStateChange from '~/hooks/useOnVisibilityStateChange';
import { Session } from '~/models/session';
import { RenderMode } from '~/models/practice';

export type handlePracticeProps = Session & {
  refUid: string;
};

const App = () => {
  const [showPracticeOverlay, setShowPracticeOverlay] = React.useState(false);
  const [isCramming, setIsCramming] = React.useState(false);
  const [overlayKey, setOverlayKey] = React.useState(0);

  const {
    settings,
    updateSetting,
  } = useSettings();
  const {
    tagsListString,
    dataPageTitle,
    dailyLimit,
    shuffleCards,
  } = settings;
  const { selectedTag, setSelectedTag, tagsList } = useTags({ tagsListString, dailynoteEnabled: settings.dailynoteEnabled });

  const { fetchCacheData, saveCacheData, data: cachedData } = useCachedData({ dataPageTitle });

  const { practiceData, today, fetchPracticeData } = usePracticeData({
    tagsList,
    selectedTag,
    dataPageTitle,
    cachedData,
    isCramming,
    dailyLimit,
    shuffleCards,
  });

  React.useEffect(() => {
    refreshData();
  }, [tagsListString]);

  const handlePracticeClick = async ({ refUid, ...cardData }: handlePracticeProps) => {
    if (!refUid) {
      console.error('HandlePracticeFn Error: No refUid provided');
      return;
    }

    try {
      await practice({
        ...cardData,
        dataPageTitle,
        dateCreated: new Date(),
        refUid,
        isCramming,
      });
    } catch (error) {
      console.error('Error Saving Practice Data', error);
    }
  };

  const setRenderMode = (tag: string, mode: RenderMode) => {
    saveCacheData({ renderMode: mode }, { selectedTag: tag });
    fetchCacheData();
  };

  const refreshData = () => {
    fetchCacheData();
    fetchPracticeData();
  };

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

  const onRestartPracticeOverlayCallback = () => {
    setOverlayKey((prev) => prev + 1);
    refreshData();
  };

  const handleMemoTagChange = (tag: string) => {
    setSelectedTag(tag);
  };

  useCollapseReferenceList({ dataPageTitle });

  const [tagsOnEnter, setTagsOnEnter] = React.useState<string[]>([]);
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
    setTagsOnEnter(tags);
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
        <SidePanelWidget onClickCallback={onShowPracticeOverlay} today={today} />
        {showPracticeOverlay && (
          <PracticeSessionProvider
            key={overlayKey}
            settings={settings}
            practiceData={practiceData}
            today={today}
            selectedTag={selectedTag}
            tagsList={tagsList}
            isCramming={isCramming}
            setIsCramming={setIsCramming}
            handlePracticeClick={handlePracticeClick}
            handleMemoTagChange={handleMemoTagChange}
            fetchPracticeData={fetchPracticeData}
            dataPageTitle={dataPageTitle}
            setRenderMode={setRenderMode}
            updateSetting={updateSetting}
          >
            <PracticeOverlay
              isOpen={true}
              onCloseCallback={onClosePracticeOverlayCallback}
              onRestartCallback={onRestartPracticeOverlayCallback}
            />
          </PracticeSessionProvider>
        )}
      </>
    </Blueprint.HotkeysProvider>
  );
};

export default App;
