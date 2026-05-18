import {
  getPluginPageBlockDataQuery,
  getPluginPageData,
} from '~/queries/data';

const parseMockRoamDate = (value: string) => {
  if (!value || value.split(' ').length < 3) return undefined;
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
  const [month, dayWithSuffix, year] = value.replace(',', '').split(' ');
  if (!(month in months) || !dayWithSuffix || !year) return undefined;
  const day = Number(dayWithSuffix.replace(/(st|nd|rd|th)$/, ''));
  return new Date(Date.UTC(Number(year), months[month as keyof typeof months], day));
};

describe('getPluginPageData', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reads all fields from the latest session block', async () => {
    Object.defineProperty(window, 'roamAlphaAPI', {
      value: {
        q: jest.fn(() => [
          [
            {
              children: [
                {
                  string: '((card-1))',
                  children: [
                    {
                      string: '[[April 14th, 2026]] 🟢',
                      order: 0,
                      children: [
                        { string: 'algorithm:: SM2' },
                        { string: 'interaction:: NORMAL' },
                        { string: 'nextDueDate:: [[April 20th, 2026]]' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        ]),
        util: {
          pageTitleToDate: jest.fn((value: string) => parseMockRoamDate(value)),
        },
      },
      writable: true,
    });

    const result = await getPluginPageData({
      dataPageTitle: 'roam/Supermemo',
      limitToLatest: true,
    });

    expect(window.roamAlphaAPI.q).toHaveBeenCalledWith(
      getPluginPageBlockDataQuery,
      'roam/Supermemo',
      'data'
    );
    expect(result['card-1']).toMatchObject({
      algorithm: 'SM2',
      interaction: 'NORMAL',
    });
    const cardData = result['card-1'] as any;
    expect(cardData.nextDueDate).toEqual(new Date('2026-04-20T00:00:00.000Z'));
  });

  it('reads algorithm and interaction from latest session block', async () => {
    Object.defineProperty(window, 'roamAlphaAPI', {
      value: {
        q: jest.fn(() => [
          [
            {
              children: [
                {
                  string: '((card-spaced))',
                  children: [
                    {
                      string: '[[April 14th, 2026]] 🟢',
                      order: 0,
                      children: [
                        { string: 'algorithm:: SM2' },
                        { string: 'interaction:: NORMAL' },
                        { string: 'sm2_repetitions:: 3' },
                        { string: 'sm2_interval:: 12' },
                        { string: 'sm2_eFactor:: 2.4' },
                        { string: 'nextDueDate:: [[April 20th, 2026]]' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        ]),
        util: {
          pageTitleToDate: jest.fn((value: string) => parseMockRoamDate(value)),
        },
      },
      writable: true,
    });

    const result = await getPluginPageData({
      dataPageTitle: 'roam/Supermemo',
      limitToLatest: true,
    });

    expect(result['card-spaced']).toMatchObject({
      algorithm: 'SM2',
      interaction: 'NORMAL',
      sm2_repetitions: 3,
      sm2_interval: 12,
      sm2_eFactor: 2.4,
    });
  });

  it('reads only the latest session block fields without merging from older sessions', async () => {
    Object.defineProperty(window, 'roamAlphaAPI', {
      value: {
        q: jest.fn(() => [
          [
            {
              children: [
                {
                  string: '((card-switching))',
                  children: [
                    {
                      string: '[[April 12th, 2026]] 🟢',
                      order: 1,
                      children: [
                        { string: 'algorithm:: SM2' },
                        { string: 'interaction:: NORMAL' },
                        { string: 'sm2_repetitions:: 3' },
                        { string: 'sm2_interval:: 12' },
                        { string: 'sm2_eFactor:: 2.4' },
                      ],
                    },
                    {
                      string: '[[April 14th, 2026]] 🟢',
                      order: 0,
                      children: [
                        { string: 'algorithm:: PROGRESSIVE' },
                        { string: 'interaction:: NORMAL' },
                        { string: 'progressive_repetitions:: 1' },
                        { string: 'progressive_interval:: 6' },
                        { string: 'nextDueDate:: [[April 20th, 2026]]' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        ]),
        util: {
          pageTitleToDate: jest.fn((value: string) => parseMockRoamDate(value)),
        },
      },
      writable: true,
    });

    const result = await getPluginPageData({
      dataPageTitle: 'roam/Supermemo',
      limitToLatest: true,
    });

    expect(result['card-switching']).toMatchObject({
      algorithm: 'PROGRESSIVE',
      interaction: 'NORMAL',
      progressive_repetitions: 1,
      progressive_interval: 6,
    });
  });

  it('merges sparse historical sessions into complete snapshots for migration reads', async () => {
    Object.defineProperty(window, 'roamAlphaAPI', {
      value: {
        q: jest.fn(() => [
          [
            {
              children: [
                {
                  string: '((card-switching))',
                  children: [
                    {
                      string: '[[April 12th, 2026]] 🔴',
                      order: 2,
                      children: [
                        { string: 'algorithm:: SM2' },
                        { string: 'interaction:: NORMAL' },
                        { string: 'sm2_repetitions:: 3' },
                        { string: 'sm2_interval:: 12' },
                        { string: 'sm2_eFactor:: 2.4' },
                        { string: 'sm2_grade:: 4' },
                      ],
                    },
                    {
                      string: '[[April 13th, 2026]] 🔴',
                      order: 1,
                      children: [
                        { string: 'algorithm:: FIXED_TIME' },
                        { string: 'interaction:: LBL' },
                        { string: 'fixed_multiplier:: 5' },
                        { string: 'fixed_unit:: weeks' },
                      ],
                    },
                    {
                      string: '[[April 14th, 2026]] 🟢',
                      order: 0,
                      children: [
                        { string: 'algorithm:: PROGRESSIVE' },
                        { string: 'progressive_repetitions:: 1' },
                        { string: 'progressive_interval:: 6' },
                        { string: 'nextDueDate:: [[April 20th, 2026]]' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        ]),
        util: {
          pageTitleToDate: jest.fn((value: string) => parseMockRoamDate(value)),
        },
      },
      writable: true,
    });

    const result = await getPluginPageData({
      dataPageTitle: 'roam/Supermemo',
      limitToLatest: false,
    });

    expect(result['card-switching'][2]).toMatchObject({
      algorithm: 'PROGRESSIVE',
      interaction: 'LBL',
      progressive_repetitions: 1,
      progressive_interval: 6,
      sm2_repetitions: 3,
      sm2_interval: 12,
      sm2_eFactor: 2.4,
      sm2_grade: 4,
      fixed_multiplier: 5,
      fixed_unit: 'weeks',
    });
  });

  it('defaults algorithm to PROGRESSIVE and interaction to NORMAL when session block has none', async () => {
    Object.defineProperty(window, 'roamAlphaAPI', {
      value: {
        q: jest.fn(() => [
          [
            {
              children: [
                {
                  string: '((card-fixed))',
                  children: [
                    {
                      string: '[[April 14th, 2026]] 🟢',
                      order: 0,
                      children: [{ string: 'nextDueDate:: [[April 20th, 2026]]' }],
                    },
                  ],
                },
              ],
            },
          ],
        ]),
        util: {
          pageTitleToDate: jest.fn((value: string) => parseMockRoamDate(value)),
        },
      },
      writable: true,
    });

    const result = await getPluginPageData({
      dataPageTitle: 'roam/Supermemo',
      limitToLatest: true,
    });

    expect(result['card-fixed']).toMatchObject({
      dateCreated: new Date('2026-04-14T00:00:00.000Z'),
      nextDueDate: new Date('2026-04-20T00:00:00.000Z'),
      algorithm: 'PROGRESSIVE',
      interaction: 'NORMAL',
    });
  });
});
