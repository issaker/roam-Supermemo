import { CompletionStatus, RenderMode, TodayInitial } from '~/models/practice';
import { InteractionStyle, SchedulingAlgorithm } from '~/models/session';
import * as dateUtils from '~/utils/date';
import {
  deriveDeckSnapshot,
} from './selectors';

describe('review-runtime selectors', () => {
  it('derives deck snapshot from current facts instead of trusting stale today counts', () => {
    const today = {
      ...TodayInitial,
      tags: {
        memo: {
          status: CompletionStatus.Partial,
          completed: 0,
          due: 1,
          new: 1,
          dueUids: ['due-1'],
          newUids: ['new-1'],
          completedUids: ['done-1'],
          renderMode: RenderMode.Normal,
        },
      },
    };

    const now = new Date();
    const facts = {
      'due-1': {
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.NORMAL,
        nextDueDate: now,
        dateCreated: dateUtils.subtractDays(now, 2),
      },
      'new-1': {
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.NORMAL,
        isNew: true,
        dateCreated: now,
      },
      'done-1': {
        algorithm: SchedulingAlgorithm.SM2,
        interaction: InteractionStyle.NORMAL,
        nextDueDate: dateUtils.addDays(now, 2),
        dateCreated: now,
      },
    };

    const snapshot = deriveDeckSnapshot({
      today,
      selectedTag: 'memo',
      latestByUid: facts as any,
      isCramming: false,
    });

    expect(snapshot.dueUids).toEqual(['due-1']);
    expect(snapshot.newUids).toEqual(['new-1']);
    expect(snapshot.completedUids).toEqual(['done-1']);
    expect(snapshot.availablePrimaryQueue).toEqual(['due-1', 'new-1']);
    expect(snapshot.statusSummary).toEqual({
      due: 1,
      new: 1,
      completed: 1,
    });
  });
});
