import { RecordUid, Session } from '~/models/session';
import { SessionFacts } from './types';

export const deriveChildSessionMap = ({
  childUidsList,
  facts,
}: {
  childUidsList: string[];
  facts: SessionFacts['latestByUid'];
}) =>
  childUidsList.reduce((acc, uid) => {
    const session = facts[uid];
    if (session) {
      acc[uid] = session as Session;
    }
    return acc;
  }, {} as Record<RecordUid, Session>);
