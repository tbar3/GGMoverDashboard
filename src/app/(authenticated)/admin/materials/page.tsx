import Link from 'next/link';
import { getOnHandMatrix, getUnclosedSheets } from '@/lib/materials/inventory';
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
import { AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MaterialsInventoryPage() {
  const [view, unclosed] = await Promise.all([getOnHandMatrix(), getUnclosedSheets()]);
  const lowCount = view.rows.filter((r) => r.low).length;

  return (
    <div className="space-y-6">
      {unclosed.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-warning" />
              {unclosed.length} count {unclosed.length === 1 ? 'sheet' : 'sheets'} not closed out
            </CardTitle>
            <CardDescription>
              Opened on an earlier day and never completed. Close them so truck counts stay accurate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {unclosed.map((s) => (
                <li key={s.id}>
                  <Link href={`/materials/jobs/${s.id}`} className="text-sm text-primary hover:underline">
                    {s.label}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            On Hand
            {lowCount > 0 && <Badge variant="destructive">{lowCount} low</Badge>}
          </CardTitle>
          <CardDescription>
            Each warehouse + every truck = total. Low means the total is below par × your{' '}
            {view.truckNames.length} {view.truckNames.length === 1 ? 'truck' : 'trucks'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No materials yet — add them under Settings.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Material</TableHead>
                    <TableHead className="text-right">Par</TableHead>
                    <TableHead className="text-right">Warehouse</TableHead>
                    {view.truckNames.map((n) => (
                      <TableHead key={n} className="text-right whitespace-nowrap">
                        {n}
                      </TableHead>
                    ))}
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.rows.map((r) => (
                    <TableRow key={r.material} className={r.low ? 'bg-destructive/5' : ''}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {r.material}
                        {r.low && <Badge variant="destructive" className="ml-2">Low</Badge>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{r.par ?? '—'}</TableCell>
                      <TableCell className="text-right">{r.warehouse}</TableCell>
                      {r.trucks.map((q, i) => (
                        <TableCell key={i} className={`text-right ${q < 0 ? 'text-destructive' : ''}`}>
                          {q}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-bold">{r.total}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
