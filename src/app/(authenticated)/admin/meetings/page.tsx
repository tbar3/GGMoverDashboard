import {
  currentQuarter,
  getDueThisQuarter,
  getScheduledMeetings,
  getRecentMeetings,
  getMeetingTargets,
  getAllPendingFeedbackNotes,
  getPendingFeedbackSummary,
} from '@/lib/crew-meetings';
import MeetingsBoard from './meetings-board';

// Who is due is computed against today's date on every view, and booking a
// meeting changes the board under you.
export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  const [quarter, due, scheduled, recent, targets, pendingNotes, feedbackWaiting] =
    await Promise.all([
    currentQuarter(),
    getDueThisQuarter(),
    getScheduledMeetings(),
    getRecentMeetings(),
    getMeetingTargets(),
    getAllPendingFeedbackNotes(),
    getPendingFeedbackSummary(),
  ]);

  return (
    <MeetingsBoard
      quarter={quarter}
      due={due}
      scheduled={scheduled}
      recent={recent}
      targets={targets}
      pendingNotes={pendingNotes}
      feedbackWaiting={feedbackWaiting}
    />
  );
}
