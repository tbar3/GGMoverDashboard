import { currentUser } from '@clerk/nextjs/server';
import { query } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { differenceInMonths, subWeeks } from 'date-fns';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Employee } from '@/types';
import { getWeekBoard, weekStartOf } from '@/lib/bonus';
import { getBaseRate } from '@/lib/settings';
import { effectiveRate } from '@/lib/skills';

function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default async function EmployeesPage() {
  const user = await currentUser();
  if (!user) return null;

  const now = new Date();
  const [employees, lastWeekBoard, baseRate, raiseRows] = await Promise.all([
    query<Employee>('SELECT * FROM employees ORDER BY name'),
    getWeekBoard(weekStartOf(subWeeks(now, 1))),
    getBaseRate(),
    query<{ employee_id: string; raises: number }>(
      `SELECT es.employee_id, COALESCE(SUM(s.raise_amount), 0)::float8 AS raises
         FROM employee_skills es JOIN skills s ON s.id = es.skill_id
        GROUP BY es.employee_id`
    ),
  ]);

  // Last completed week's bonus per employee — the dispatch signal.
  const lastWeekBonus = new Map(lastWeekBoard.map((b) => [b.employeeId, b.result]));
  // Calculated pay/hr = override, else base + earned-skill raises.
  const raisesByEmp = new Map(raiseRows.map((r) => [r.employee_id, Number(r.raises)]));

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Employees</h1>
          <p className="text-muted-foreground mt-1">Manage your crew members</p>
        </div>
        <Link href="/admin/employees/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Employee
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Employees</CardTitle>
          <CardDescription>
            {employees.length} total employees
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Pay/hr</TableHead>
                <TableHead className="text-right">Last wk bonus</TableHead>
                <TableHead>Tenure</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.length > 0 ? (
                employees.map((employee) => {
                  const tenureMonths = differenceInMonths(now, new Date(employee.start_date));
                  const bonus = lastWeekBonus.get(employee.id);
                  const payPerHr = effectiveRate(
                    employee.hourly_rate != null ? Number(employee.hourly_rate) : null,
                    raisesByEmp.get(employee.id) ?? 0,
                    baseRate
                  );
                  return (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>
                        {employee.phone ? (
                          <a href={`tel:${employee.phone}`} className="hover:underline">
                            {employee.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {employee.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span title={employee.hourly_rate != null ? 'Manual override' : 'Base + earned skills'}>
                          {money(payPerHr)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {bonus ? (
                          bonus.multiplier === 0 && bonus.hasStrike ? (
                            <span className="text-destructive font-medium">Forfeit</span>
                          ) : bonus.hours > 0 ? (
                            <span
                              title={`${bonus.multiplier}× · ${bonus.hours.toFixed(1)} hrs${bonus.hasStrike ? ' · GG Points kept' : ''}`}
                              className={bonus.hasStrike ? 'text-amber-600 font-medium' : ''}
                            >
                              {money(bonus.bonus)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {tenureMonths} {tenureMonths === 1 ? 'month' : 'months'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={employee.is_active ? 'default' : 'secondary'}>
                          {employee.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {employee.is_admin && (
                          <Badge variant="outline" className="bg-secondary/40 ml-1">
                            Admin
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/admin/employees/${employee.id}`}>
                          <Button variant="ghost" size="sm">
                            Edit
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No employees found. Add your first employee to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
