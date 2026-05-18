import { act, screen, within } from '@testing-library/react';
import { Settings, defaultSettings } from '~/hooks/useSettings';
import { Session, SchedulingAlgorithm, InteractionStyle } from '~/models/session';
import {
  blockInfoQuery,
  childBlocksOnPageQuery,
  dataPageReferencesIdsQuery,
  allPagesQuery,
  pageTopLevelBlocksQuery,
  generateNewSession,
  getDataPageQuery,
  getPluginPageBlockDataQuery,
  parentChainInfoQuery,
  getPracticeData,
  getPageQuery,
} from '~/queries';
import * as dateUtils from '~/utils/date';
import * as testUtils from '~/utils/testUtils';
import * as queries from '~/queries/save';
import * as practice from '~/practice';

export const mockQueryResult = ({ queryMocks, settingsMock, tagsList }) => {
  // 测试隔离：清除之前测试残留的 localStorage 持久化数据
  // 根因：useQueue 的 localStorage 持久化会在测试间泄漏，导致
  // cardSet 不同的测试读取到旧测试的队列状态，显示错误的卡片
  localStorage.clear();

  const mockRoamAlphaAPI = generateMockRoamAlphaAPI({ queryMocks, tagsList });

  Object.defineProperty(window, 'roamAlphaAPI', {
    value: mockRoamAlphaAPI,
    writable: true,
  });

  mockOtherDependencies({ settingsMock });
};

const mockOtherDependencies = ({ settingsMock }) => {
  Object.defineProperty(window, 'roamSupermemo', {
    value: {
      extensionAPI: {
        settings: {
          getAll: () => settingsMock,
          panel: {
            create: () => {},
          },
        },
      },
    },
    writable: true,
  });
};

export const dataPageTitle = 'roam/Supermemo';
const dataPageUid = 1234;
const undefinedDataPageUid = '';
const mockBlockInfo = {
  string: 'mock block string',
  children: [
    {
      uid: 'mock-child-1',
      order: 0,
      string: 'mock child block string',
    },
  ],
};
interface MockQuery {
  query: string;
  result: any;
  args?: any[];
  shouldReturnPromise?: boolean;
}
export const generateMockRoamAlphaAPI = ({
  queryMocks,
  tagsList,
}: {
  queryMocks: MockQuery[];
  tagsList: string[];
}) => ({
  q: jest.fn((q, ...queryArgs) => {
    const defaultMocks: MockQuery[] = [
      {
        query: getDataPageQuery('roam/Supermemo'),
        result: [[dataPageUid]],
        shouldReturnPromise: false,
      },
      ...tagsList.map((tag) => ({
        query: dataPageReferencesIdsQuery,
        args: [tag, dataPageUid],
        result: [],
        shouldReturnPromise: false,
      })),
      {
        query: getPluginPageBlockDataQuery,
        args: [dataPageTitle, 'cache'],
        result: [],
      },
      ...tagsList.map((tag) => ({
        query: childBlocksOnPageQuery,
        args: [tag],
        result: [],
      })),
      {
        query: getPluginPageBlockDataQuery,
        result: [],
        args: [dataPageTitle, 'data'],
      },
      {
        query: blockInfoQuery,
        result: [[mockBlockInfo]],
      },
      {
        query: parentChainInfoQuery,
        result: [[]],
      },
      {
        query: getPageQuery,
        args: [dataPageTitle],
        result: [[`${dataPageUid}`]],
        shouldReturnPromise: false,
      },
      {
        query: allPagesQuery,
        result: [],
        shouldReturnPromise: false,
      },
      {
        query: pageTopLevelBlocksQuery,
        result: [],
        shouldReturnPromise: false,
      },
      {
        query: `
    [:find ?block_uid
    :in $ ?parent_uid ?block_string
    :where
      [?parent :block/uid ?parent_uid]
      [?block :block/parents ?parent]
      [?block :block/string ?block_string]
      [?block :block/uid ?block_uid]
    ]
  `,
        args: [`${dataPageUid}`, 'settings'],
        result: [],
        shouldReturnPromise: false,
      },
    ];

    const mocks = queryMocks.concat(defaultMocks);
    const findMatchingMockFunction = (mock) => {
      const isQuery = mock.query === q;
      const hasMatchingArgs = !mock.args || mock.args.every((arg) => queryArgs.includes(arg));

      return isQuery && hasMatchingArgs;
    };

    const mock = mocks.find(findMatchingMockFunction);
    if (!mock) {
      throw new Error(`Mock query not found for: ${q}, with args: ${queryArgs}`);
    }

    if ('shouldReturnPromise' in mock && mock.shouldReturnPromise === false) {
      return mock.result;
    }

    return Promise.resolve(mock.result);
  }),
  updateBlock: jest.fn(() => Promise.resolve()),
  pull: jest.fn(() => ({ ':block/open': true })),
  ui: {
    commandPalette: {
      addCommand: jest.fn(),
      removeCommand: jest.fn(),
    },
    components: {
      unmountNode: jest.fn(),
      renderBlock: jest.fn(),
    },
  },
  util: {
    pageTitleToDate: mockPageTitleToDate,
  },
});

export const generateMockRoamApiImplemtationRoot = ({ queryResult }) => {
  return () => ({
    roamAlphaAPI: generateMockRoamAlphaAPI(queryResult),
  });
};

type Child = {
  order: number;
  string: string;
  children?: Child[];
};

export class MockDataBuilder {
  tags: string[];
  cards: { [key: string]: string[] };
  sessions: { [key: string]: any[] };
  settingsOverride: Partial<Settings>;
  blockInfoByUid: Record<string, any>;

  constructor() {
    this.tags = ['memo'];
    this.cards = {};
    this.sessions = {};
    this.settingsOverride = {};
    this.blockInfoByUid = {};
  }

  mockQueryResults() {
    const settingsMock = this.buildSettingsResult();
    const queryMocks: MockQuery[] = [];

    for (const tag of this.tags) {
      queryMocks.push({
        query: dataPageReferencesIdsQuery,
        result: this.buildPageReferenceIdsQueryResult(tag),
        args: [tag, dataPageUid],
        shouldReturnPromise: false,
      });
    }

    if (Object.keys(this.sessions).length) {
      queryMocks.push({
        query: getPluginPageBlockDataQuery,
        result: this.buildSessionQueryResult(),
        args: [dataPageTitle, 'data'],
      });
    }

    for (const [uid, blockInfo] of Object.entries(this.blockInfoByUid)) {
      queryMocks.push({
        query: blockInfoQuery,
        args: [uid],
        result: [[blockInfo]],
      });
    }

    testUtils.mockQueryResult({ queryMocks, settingsMock, tagsList: this.tags });
  }

  mockQueryResultsWithoutDataPage() {
    const settingsMock = this.buildSettingsResult();
    const queryMocks: MockQuery[] = [];

    queryMocks.push({
      query: getDataPageQuery('roam/Supermemo'),
      result: [],
      shouldReturnPromise: false,
    });

    for (const tag of this.tags) {
      queryMocks.push({
        query: dataPageReferencesIdsQuery,
        result: this.buildPageReferenceIdsQueryResult(tag),
        args: [tag, undefinedDataPageUid],
        shouldReturnPromise: false,
      });
    }

    testUtils.mockQueryResult({ queryMocks, settingsMock, tagsList: this.tags });
  }

  withTag(tagName: string) {
    if (!this.tags.includes(tagName)) {
      this.tags.push(tagName);
    }

    return this;
  }

  withCard({ uid = 'id_1', tag = this.tags[0] } = {}) {
    if (!this.cards[tag]) this.cards[tag] = [];

    this.cards[tag].push(uid);

    return this;
  }

  withBlockInfo(uid: string, blockInfo: any) {
    this.blockInfoByUid[uid] = blockInfo;
    return this;
  }

  buildPageReferenceIdsQueryResult(tag) {
    return this.cards[tag]?.length ? this.cards[tag].map((c) => [c]) : [];
  }

  withSession(
    uid: string,
    overrides: { algorithm?: SchedulingAlgorithm; nextDueDate?: Date } & {
      [key in keyof Session]?: any;
    } = {}
  ) {
    if (!this.sessions[uid]) {
      this.sessions[uid] = [];
    }

    const baseSession = generateNewSession({
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
      isNew: false,
      dateCreated: new Date(),
    });

    this.sessions[uid].push({
      ...baseSession,
      ...overrides,
    });

    return this;
  }
  withSetting(settingsOverride: Partial<Settings>) {
    this.settingsOverride = settingsOverride;
    return this;
  }

  createChild(order: number, string: string, children?: Child[]): Child {
    return { order, string, ...(children ? { children } : {}) };
  }

  buildSettingsResult() {
    return {
      ...defaultSettings,
      ...this.settingsOverride,
      deckConfigs: JSON.stringify(
        this.tags.map((name) => ({
          name,
          swapQA: false,
          weight: Math.round(100 / this.tags.length),
        }))
      ),
      isCramming: false,
    };
  }

  buildSessionQueryResult() {
    const renderedSessions = Object.entries(this.sessions).map(([uid, sessions]) =>
      this.createChild(
        0,
        `((${uid}))`,
        sessions.map((session, index, sessions) =>
          this.createChild(
            sessions.length - 1 - index,
            `${mockDateToRoamDateString(session.dateCreated)} 🟢`,
            Object.entries(session)
              .filter(([key]) => key !== 'dateCreated')
              .map(([key, value], index, fieldList) => {
                let parsedValue = '';
                if (dateUtils.isDate(value)) {
                  parsedValue = mockDateToRoamDateString(value);
                }

                return this.createChild(
                  fieldList.length - 1 - index,
                  `${key}:: ${parsedValue || value}`
                );
              })
          )
        )
      )
    );

    return [[this.createChild(0, 'data', renderedSessions)]];
  }

  async getPracticeData() {
    const settings = this.buildSettingsResult();
    const practiceData = await getPracticeData({
      tagsList: this.tags,
      dataPageTitle,
      shuffleCards: !!settings.shuffleCards,
      cachedData: {},
      deckConfigs: settings.deckConfigs || '[]',
    });

    return practiceData;
  }
}

export function mockDateToRoamDateString(date) {
  if (!date) return '[[January 1st, 2026]]';
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  let daySuffix;
  if (day % 10 === 1 && day !== 11) {
    daySuffix = 'st';
  } else if (day % 10 === 2 && day !== 12) {
    daySuffix = 'nd';
  } else if (day % 10 === 3 && day !== 13) {
    daySuffix = 'rd';
  } else {
    daySuffix = 'th';
  }

  return `[[${month} ${day}${daySuffix}, ${year}]]`;
}

function mockPageTitleToDate(formattedDate) {
  const months = {
    January: 0,
    February: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
    July: 6,
    August: 7,
    September: 8,
    October: 9,
    November: 10,
    December: 11,
  };

  // Remove the surrounding brackets and split the string
  // eslint-disable-next-line no-useless-escape
  const cleanedDate = formattedDate.replace(/[\[\]]/g, '');
  const [monthDay, year] = cleanedDate.split(', ');
  const [month, dayWithSuffix] = monthDay.split(' ');

  // Extract the numeric part of the day
  const day = parseInt(dayWithSuffix);

  // Get the month index
  const monthIndex = months[month];

  // Create and return the Date object
  return new Date(year, monthIndex, day);
}

export const actions = {
  launchModal: () => {
    const sidePanelButtonElm = document.querySelector<HTMLSpanElement>(
      '[data-testid="side-panel-wrapper"]'
    );
    sidePanelButtonElm?.click();
  },
  openTagSelector: () => {
    const tagSelectorElm = document.querySelector<HTMLButtonElement>(
      '[data-testid="tag-selector-cta"]'
    );

    tagSelectorElm?.click();
  },
  clickControlButton: async (buttonText: string) => {
    const footerActionsElm = screen.getByTestId('footer-actions-wrapper');
    let targetButton = within(footerActionsElm).queryByText(buttonText);
    if (!targetButton && buttonText !== 'Show Answer') {
      const showAnswerButton = within(footerActionsElm).queryByText('Show Answer');
      const showAnswerElm = showAnswerButton?.closest<HTMLButtonElement>('button');
      showAnswerElm?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
      targetButton = within(screen.getByTestId('footer-actions-wrapper')).queryByText(buttonText);
    }

    if (!targetButton) {
      throw new Error(`Control button not found: ${buttonText}`);
    }
    const buttonElm = targetButton.closest<HTMLButtonElement>('button');
    buttonElm?.click();
    await new Promise((resolve) => setTimeout(resolve, 200));
  },
  clickSwitchReviewModeButton: async (targetLabel?: string) => {
    const footerActionsElm = screen.getByTestId('footer-actions-wrapper');
    const algorithmButton = within(footerActionsElm).queryByTestId('algorithm-button');

    if (!algorithmButton) {
      const showAnswerButton = within(footerActionsElm).queryByText('Show Answer');
      const showAnswerElm = showAnswerButton?.closest<HTMLButtonElement>('button');
      showAnswerElm?.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const button = screen.getByTestId('algorithm-button');
    const buttonElm = button.closest<HTMLButtonElement>('button');

    if (buttonElm) {
      buttonElm.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const targetText = targetLabel || 'SM2';
    const popoverElm = document.querySelector('.bp3-popover .bp3-popover-content');
    if (popoverElm) {
      const items = Array.from(popoverElm.querySelectorAll('[data-testid^="algorithm-option-"]'));
      for (const item of items) {
        if (item.textContent?.includes(targetText)) {
          (item as HTMLElement).click();
          await new Promise((resolve) => setTimeout(resolve, 200));
          return;
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  },
};

export const grade = async (gradeString: string, mockBuilder: MockDataBuilder) => {
  const promise = new Promise<{ updatedRecord: any; practiceInput: any }>((resolve) => {
    const savePracticeDataSpy = jest.spyOn(queries, 'savePracticeData');
    const practiceSpy = jest.spyOn(practice, 'default');
    practiceSpy.mockClear(); // Reset calls so that if grade is called multiple times in the same test we always get the input from the last call

    savePracticeDataSpy.mockImplementation(async (updatedRecord) => {
      const { refUid, ...practiceData } = updatedRecord;

      // Manually save next sessions
      mockBuilder.withSession(refUid, practiceData);
      mockBuilder.mockQueryResults();
      resolve({ updatedRecord, practiceInput: practiceSpy.mock.calls[0]?.[0] });
    });
  });

  await act(async () => {
    await actions.clickControlButton(gradeString);
  });

  return promise;
};
