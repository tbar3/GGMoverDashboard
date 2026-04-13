import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { Employee, Job } from '@/types';
import { JobsContent } from './jobs-content';

export default async function MyJobsPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  const employee = await queryOne<Employee>(
    'SELECT * FROM employees WHERE email = $1',
    [email]
  );

  if (!employee) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6"><p className="text-gray-500">Employee profile not found. Please contact your administrator.</p></CardContent></Card>
      </div>
    );
  }

  const today = format(new Date(), 'yyyy-MM-dd');

  const [upcomingJobs, pastJobs] = await Promise.all([
    query<Job>('SELECT * FROM jobs WHERE $1 = ANY(crew_ids) AND date >= $2 ORDER BY date ASC, start_time ASC', [employee.id, today]),
    query<Job>('SELECT * FROM jobs WHERE $1 = ANY(crew_ids) AND date < $2 ORDER BY date DESC LIMIT 10', [employee.id, today]),
  ]);

  return <JobsContent upcomingJobs={upcomingJobs} pastJobs={pastJobs} today={today} />;
}
