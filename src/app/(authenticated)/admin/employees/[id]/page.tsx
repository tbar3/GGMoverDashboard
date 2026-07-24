import { queryOne } from '@/lib/db';
import { Employee } from '@/types';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EditEmployeeForm } from './edit-form';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const employee = await queryOne<Employee>('SELECT * FROM employees WHERE id = $1', [id]);
  if (!employee) notFound();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/employees">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Employee</h1>
          <p className="text-muted-foreground mt-1">{employee.name}</p>
        </div>
      </div>
      <EditEmployeeForm employee={employee} />
    </div>
  );
}
