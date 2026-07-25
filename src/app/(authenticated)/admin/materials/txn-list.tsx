import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { TxnRow } from '@/lib/materials/inventory';

const TYPE_LABEL: Record<string, string> = {
  receive: 'Receive',
  adjustment: 'Adjustment',
  usage: 'Usage',
  transfer: 'Transfer',
};

export function TxnList({ title, rows }: { title: string; rows: TxnRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No movements yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {format(new Date(t.created_at), 'MMM d, h:mm a')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{TYPE_LABEL[t.type] ?? t.type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{t.material}</TableCell>
                    <TableCell>{t.location ?? '—'}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${t.qty_delta < 0 ? 'text-destructive' : 'text-green-600'}`}
                    >
                      {t.qty_delta > 0 ? '+' : ''}
                      {t.qty_delta}
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                      {t.note ?? ''}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.created_by ?? ''}</TableCell>
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
