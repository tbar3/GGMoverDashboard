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
import { inviteEmployee } from '@/lib/invite-actions';
import { CREW_ROLES, isBackOfficeRole, roleLabel } from '@/lib/roles';

export function EditEmployeeForm({ employee }: { employee: Employee }) {
  const router = useRouter();
  // Back-office roles are managed in Admin Settings — the Employees tab handles crew.
  const backOffice = isBackOfficeRole(employee.role);
  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState<UserRole>(employee.role);
  const [startDate, setStartDate] = useState(
    new Date(employee.start_date).toISOString().split('T')[0]
  );
  const [hourlyRate, setHourlyRate] = useState(
    employee.hourly_rate != null ? String(employee.hourly_rate) : ''
  );
  const [annualSalary, setAnnualSalary] = useState(
    employee.annual_salary != null ? String(employee.annual_salary) : ''
  );
  const [isActive, setIsActive] = useState(employee.is_active);
  const [phone, setPhone] = useState(employee.phone ?? '');
  const [email, setEmail] = useState(employee.email);
  const [inviting, setInviting] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleInvite() {
    setInviting(true);
    const res = await inviteEmployee(employee.id, email);
    setInviting(false);
    if (res.ok) {
      toast.success(`Invitation sent to ${email.trim().toLowerCase()}`);
      router.refresh();
    } else {
      toast.error(res.error ?? 'Could not send the invite');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const rate = hourlyRate.trim() === '' ? null : parseFloat(hourlyRate.replace(/[$,]/g, ''));
      if (rate !== null && (isNaN(rate) || rate < 0)) {
        toast.error('Enter a valid hourly rate.');
        return;
      }
      const salary = annualSalary.trim() === '' ? null : parseFloat(annualSalary.replace(/[$,]/g, ''));
      if (salary !== null && (isNaN(salary) || salary < 0)) {
        toast.error('Enter a valid annual salary.');
        return;
      }
      const result = await updateEmployee({
        id: employee.id,
        name,
        role,
        startDate,
        isActive,
        hourlyRate: rate,
        annualSalary: salary,
        phone: phone.trim() || null,
        email: email.trim().toLowerCase(),
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
              <Label htmlFor="email">Email (login identity)</Label>
              <div className="flex gap-2">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Button type="button" variant="outline" onClick={handleInvite} disabled={inviting}>
                  {inviting ? 'Sending…' : 'Invite'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Their sign-in email. &ldquo;Invite&rdquo; saves it and emails them a sign-up link.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="(404) 555-0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              {backOffice ? (
                <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm">
                  {roleLabel(employee.role)}
                  <span className="text-muted-foreground ml-2 text-xs">· managed in Admin Settings</span>
                </div>
              ) : (
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {CREW_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
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
                disabled={annualSalary.trim() !== ''}
              />
              {annualSalary.trim() !== '' && (
                <p className="text-xs text-muted-foreground">
                  Not used — this person is salaried.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="salary">Annual Salary</Label>
              <Input
                id="salary"
                inputMode="decimal"
                placeholder="blank = paid hourly"
                value={annualSalary}
                onChange={(e) => setAnnualSalary(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {annualSalary.trim() !== '' && !isNaN(parseFloat(annualSalary.replace(/[$,]/g, '')))
                  ? `$${(parseFloat(annualSalary.replace(/[$,]/g, '')) / 52).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} per week · exempt, no overtime`
                  : 'Leave blank for hourly staff. Setting it makes this person salaried and exempt from overtime.'}
              </p>
            </div>
          </div>

          <div className="space-y-3">
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
