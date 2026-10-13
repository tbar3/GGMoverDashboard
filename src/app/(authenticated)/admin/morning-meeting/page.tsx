import {
  getRecognitionBoard,
  getRotationPolicies,
  getNotes,
  getPolicyOfDay,
  getPolicyHistory,
  getDiscussions,
  getDiscussionJobs,
  getCrewOptions,
  getFeedback,
  meetingToday,
} from '@/lib/morning-meeting';
import MorningMeetingBoard from './morning-meeting-board';

// The pick of the day is written on first view, and dismissals change the board
// under you — nothing here is safe to cache.
export const dynamic = 'force-dynamic';

export default async function MorningMeetingPage() {
  const today = await meetingToday();

  // Policy of the day runs first and alone: on the first view of the day it claims
  // today's row, which getPolicyHistory below must then be able to see.
  const policyOfDay = await getPolicyOfDay(today);
  const [board, policies, notes, history, discussions, jobs, crew, feedback] = await Promise.all([
    getRecognitionBoard(),
    getRotationPolicies(),
    getNotes(),
    getPolicyHistory(),
    getDiscussions(),
    getDiscussionJobs(),
    getCrewOptions(),
    getFeedback(),
  ]);

  return (
    <MorningMeetingBoard
      today={today}
      board={board}
      policies={policies}
      notes={notes}
      policyOfDay={policyOfDay}
      history={history}
      discussions={discussions}
      jobs={jobs}
      crew={crew}
      feedback={feedback}
    />
  );
}
