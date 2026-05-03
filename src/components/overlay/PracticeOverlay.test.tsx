import { act, render, screen } from '@testing-library/react';

import * as testUtils from '~/utils/testUtils';
import * as dateUtils from '~/utils/date';

import App from '~/app';
import { shouldReinsertLblCard } from './PracticeOverlay';
import { SchedulingAlgorithm, InteractionStyle } from '~/models/session';
import * as saveQueries from '~/queries/save';

/** Check that a Date value is within toleranceMs of the expected Date (default 1s) */
const expectDateCloseTo = (actual: Date, expected: Date, toleranceMs = 1000) => {
  expect(actual).toBeInstanceOf(Date);
  expect(Math.abs(actual.getTime() - expected.getTime())).toBeLessThanOrEqual(toleranceMs);
};

describe('PracticeOverlay', () => {
  it("renders done state when there's no practice data", async () => {
    new testUtils.MockDataBuilder().mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      testUtils.actions.launchModal();
    });

    const practiceOverlayDoneState = document.querySelector<HTMLDivElement>(
      '[data-testid="practice-overlay-done-state"]'
    );
    expect(practiceOverlayDoneState).toBeInTheDocument();
  });

  it('Renders correctly when 1 new card', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();

    mockBuilder.withCard({ uid: 'id_new_1' });
    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    // Renders new tag count in sidepanel
    const newTag = screen.queryByTestId('new-tag');
    expect(newTag).toHaveTextContent('1');

    await act(async () => {
      testUtils.actions.launchModal();
    });

    // Renders "New" status badge
    const statusBadge = screen.queryByTestId('status-badge');
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge).toHaveTextContent('New');

    // Renders display count 1/1
    const displayCountCurrent = screen.queryByTestId('display-count-current');
    expect(displayCountCurrent).toBeInTheDocument();
    expect(displayCountCurrent).toHaveTextContent('1');

    const displayCountTotal = screen.queryByTestId('display-count-total');
    expect(displayCountTotal).toBeInTheDocument();
    expect(displayCountTotal).toHaveTextContent('1');
  });

  it("Renders correctly when 1 new card, even when data page doesn't exist yet", async () => {
    const mockBuilder = new testUtils.MockDataBuilder();

    mockBuilder.withCard({ uid: 'id_new_1' });
    mockBuilder.mockQueryResultsWithoutDataPage();

    await act(async () => {
      render(<App />);
    });

    // Renders new tag count in sidepanel
    const newTag = screen.queryByTestId('new-tag');
    expect(newTag).toHaveTextContent('1');

    await act(async () => {
      testUtils.actions.launchModal();
    });

    // Renders "New" status badge
    const statusBadge = screen.queryByTestId('status-badge');
    expect(statusBadge).toBeInTheDocument();
    expect(statusBadge).toHaveTextContent('New');

    // Renders display count 1/1
    const displayCountCurrent = screen.queryByTestId('display-count-current');
    expect(displayCountCurrent).toBeInTheDocument();
    expect(displayCountCurrent).toHaveTextContent('1');

    const displayCountTotal = screen.queryByTestId('display-count-total');
    expect(displayCountTotal).toBeInTheDocument();
    expect(displayCountTotal).toHaveTextContent('1');
  });

  it('Grading works correctly when switching review modes', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();

    jest.spyOn(saveQueries, 'updateReviewConfig').mockResolvedValue(undefined);

    const dueCard1 = 'id_due_1';
    mockBuilder.withCard({ uid: dueCard1 }).withSession(dueCard1, {
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });

    const newCard1 = 'id_new_1';
    mockBuilder.withCard({ uid: newCard1 });

    mockBuilder.mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      testUtils.actions.launchModal();
    });

    const showAnswerButton = screen.queryByText('Show Answer');
    if (showAnswerButton) {
      await act(async () => {
        await testUtils.actions.clickControlButton('Show Answer');
      });
    }

    const result = await testUtils.grade('Good', mockBuilder);
    expect(result.updatedRecord).toMatchObject({
      algorithm: SchedulingAlgorithm.SM2,
      dataPageTitle: testUtils.dataPageTitle,
      refUid: 'id_due_1',
    });
    expectDateCloseTo(result.updatedRecord.dateCreated, new Date());

    const statusBadge = screen.queryByTestId('status-badge');
    expect(statusBadge).toHaveTextContent('New');
  });

  it('Grading works correctly when switching review modes starting with fixed', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();

    jest.spyOn(saveQueries, 'updateReviewConfig').mockResolvedValue(undefined);

    const dueCard1 = 'id_due_1';
    mockBuilder.withCard({ uid: dueCard1 }).withSession(dueCard1, {
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      interaction: InteractionStyle.NORMAL,
      sm2_grade: 1,
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });

    mockBuilder.mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      testUtils.actions.launchModal();
    });

    const result = await testUtils.grade('Next', mockBuilder);
    expect(result.updatedRecord).toMatchObject({
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      dataPageTitle: testUtils.dataPageTitle,
      refUid: 'id_due_1',
    });
  });

  it('persists SM2 when grading right after switching from fixed mode', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();
    jest.spyOn(saveQueries, 'updateReviewConfig').mockResolvedValue(undefined);

    const dueCard1 = 'id_due_1';
    mockBuilder.withCard({ uid: dueCard1 }).withSession(dueCard1, {
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      interaction: InteractionStyle.NORMAL,
      sm2_grade: 1,
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });

    mockBuilder.mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      testUtils.actions.launchModal();
    });

    await act(async () => {
      await testUtils.actions.clickSwitchReviewModeButton('SM2');
    });

    const result = await testUtils.grade('Good', mockBuilder);
    expect(result.updatedRecord).toMatchObject({
      algorithm: SchedulingAlgorithm.SM2,
      dataPageTitle: testUtils.dataPageTitle,
      refUid: 'id_due_1',
    });
  });

  it('Fixed Interval cards are expanded immediately without Show Answer', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();
    const dueCard1 = 'id_due_fixed_1';

    mockBuilder.withCard({ uid: dueCard1 }).withSession(dueCard1, {
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      interaction: InteractionStyle.NORMAL,
      sm2_grade: 1,
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });

    mockBuilder.mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      testUtils.actions.launchModal();
    });

    expect(screen.queryByText('Show Answer')).not.toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('LBL + Progressive shows line-by-line reading UI', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();
    const dueCard1 = 'id_due_fixed_lbl';

    mockBuilder.withCard({ uid: dueCard1 }).withSession(dueCard1, {
      algorithm: SchedulingAlgorithm.PROGRESSIVE,
      interaction: InteractionStyle.LBL,
      sm2_grade: 1,
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });

    mockBuilder.mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      testUtils.actions.launchModal();
    });

    expect(screen.queryByText('Show Answer')).not.toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
  });

  it('returns to the next due line after leaving and revisiting an LBL card', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();
    const lblCard = 'id_due_fixed_lbl';
    const normalCard = 'id_due_normal';
    const childOne = 'lbl-child-1';
    const childTwo = 'lbl-child-2';

    jest.spyOn(saveQueries, 'updateParentNextDueDate').mockResolvedValue(undefined);

    mockBuilder.withCard({ uid: lblCard }).withSession(lblCard, {
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.LBL,
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });
    // Child sessions must be in pluginPageData for classifyLblDeck to work.
    mockBuilder.withSession(childOne, {
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });
    mockBuilder.withSession(childTwo, {
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });
    mockBuilder.withCard({ uid: normalCard }).withSession(normalCard, {
      algorithm: SchedulingAlgorithm.SM2,
      interaction: InteractionStyle.NORMAL,
      dateCreated: dateUtils.subtractDays(new Date(), 1),
      nextDueDate: new Date(),
    });
    mockBuilder
      .withBlockInfo(lblCard, {
        string: 'LBL parent',
        children: [
          { uid: childOne, order: 0, string: 'line 1' },
          { uid: childTwo, order: 1, string: 'line 2' },
        ],
      })
      .withBlockInfo(childOne, {
        string: 'line 1',
        children: [],
      })
      .withBlockInfo(childTwo, {
        string: 'line 2',
        children: [],
      })
      .withBlockInfo(normalCard, {
        string: 'normal card',
        children: [],
      });

    mockBuilder.mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    await act(async () => {
      testUtils.actions.launchModal();
    });

    expect(screen.getByText('Line 1 / 2 (2 due)')).toBeInTheDocument();

    await testUtils.grade('Good', mockBuilder);

    expect(screen.getByText('Line 2 / 2 (1 due)')).toBeInTheDocument();

    await act(async () => {
      const nextButton = screen.getByLabelText('Next');
      nextButton.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    await act(async () => {
      const previousButton = screen.getByLabelText('Previous');
      previousButton.click();
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    expect(screen.getByText('Line 2 / 2 (1 due)')).toBeInTheDocument();
  });

  it('LBL reinsertion stops on the last line', () => {
    expect(
      shouldReinsertLblCard({
        currentChildIndex: 0,
        totalChildren: 1,
        lblNextReinsertOffset: 3,
      })
    ).toBe(false);

    expect(
      shouldReinsertLblCard({
        currentChildIndex: 1,
        totalChildren: 3,
        lblNextReinsertOffset: 3,
      })
    ).toBe(true);

    expect(
      shouldReinsertLblCard({
        currentChildIndex: 2,
        totalChildren: 3,
        lblNextReinsertOffset: 3,
      })
    ).toBe(false);

    expect(
      shouldReinsertLblCard({
        currentChildIndex: 1,
        totalChildren: 3,
        lblNextReinsertOffset: 0,
      })
    ).toBe(false);
  });
});
