import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import type { EmployeeEvent } from '@/lib/bonus';

// Presentational (no hooks) so it renders in server or client trees alike.
function kindBadge(kind: EmployeeEvent['kind']) {
  switch (kind) {
    case 'positive':
      return <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100">Positive</Badge>;
    case 'gg_point':
      return <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">GG Point</Badge>;
    case 'strike':
      return <Badge variant="destructive">Strike</Badge>;
    case 'writeup':
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Write-Up</Badge>;
  }
}

export function EventsTable({
  events,
  title = 'Event record',
  description,
  empty = 'No events logged yet.',
}: {
  events: EmployeeEvent[];
  title?: string;
  description?: string;
  empty?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job date</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Effect</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={`${e.kind}-${e.id}`} className={e.voided ? 'opacity-60' : ''}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(`${e.date}T12:00:00`), 'EEE MMM d')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {format(new Date(`${e.effectiveDate}T12:00:00`), 'MMM d')}
                    </TableCell>
                    <TableCell>{kindBadge(e.kind)}</TableCell>
                    <TableCell className={`font-medium ${e.voided ? 'line-through' : ''}`}>
                      {e.label}
                      {e.arrivalTime && (
                        <span className="ml-1 font-normal text-muted-foreground">· in {e.arrivalTime}</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-sm ${
                        e.kind === 'strike' && !e.voided ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {e.effect}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                      {e.note ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
