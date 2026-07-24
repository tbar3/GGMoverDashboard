'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Employee, UserRole } from '@/types';
import { updateEmployee } from '../new/actions';

const ROLES: UserRole[] = ['owner', 'manager', 'lead', 'driver', 'helper'];

export function EditEmployeeForm({ employee }: { employee: Employee }) {
  const router = useRouter();
  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState<UserRole>(employee.role);
  const [startDate, setStartDate] = useState(
    new Date(employee.start_date).toISOString().split('T')[0]
  );
  const [hourlyRate, setHourlyRate] = useState(
    employee.hourly_rate != null ? String(employee.hourly_rate) : ''
  );
  const [isAdmin, setIsAdmin] = useState(employee.is_admin);
  const [isActive, setIsActive] = useState(employee.is_active);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const rate = hourlyRate.trim() === '' ? null : parseFloat(hourlyRate.replace(/[$,]/g, ''));
      if (rate !== null && (isNaN(rate) || rate < 0)) {
        toast.error('Enter a valid hourly rate.');
        return;
      }
      const result = await updateEmployee({
        id: employee.id,
        name,
        role,
        startDate,
        isAdmin,
        isActive,
        hourlyRate: rate,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Employee updated');
      router.push('/admin/employees');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Employee Details</CardTitle>
        <CardDescription>
          Set this crew member&apos;s role and tenure. Pay is driven by the skills below (base +
          each skill); the rate field here is an optional <strong>override</strong> — leave it
          blank to use the skill-based rate.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={employee.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="capitalize">
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start">Start Date</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rate">Rate Override ($/hr)</Label>
              <Input
                id="rate"
                inputMode="decimal"
                placeholder="blank = use skill-based rate"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              Back-office admin access
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Active
            </label>
          </div>

          <Button type="submit" disabled={loading}>
            {loading ? 'Saving…' : 'Save Changes'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
