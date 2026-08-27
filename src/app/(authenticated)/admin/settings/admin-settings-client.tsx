'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { MapPin, ShieldCheck } from 'lucide-react';
import { BACK_OFFICE_ROLES, roleLabel } from '@/lib/roles';
import {
  setAdminRole,
  addAdminMember,
  removeFromAdminTeam,
  addLocation,
  toggleLocation,
  deleteLocation,
} from '@/lib/admin-settings-actions';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  /** A portal login for someone already on the roster — hidden from Employees. */
  exclude_from_roster?: boolean;
}
interface Location {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export function AdminTeamManager({ team }: { team: TeamMember[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('manager');

  function changeRole(id: string, role: string) {
    startTransition(async () => {
      const res = await setAdminRole(id, role);
      if (res.ok) {
        toast.success('Role updated');
        router.refresh();
      } else toast.error(res.error ?? 'Could not update');
    });
  }

  function add() {
    if (!addName.trim()) return toast.error('Enter a name');
    if (!addEmail.trim()) return toast.error('Enter an email');
    startTransition(async () => {
      const res = await addAdminMember(addName, addEmail, addRole);
      if (res.ok) {
        toast.success(
          res.invited
            ? 'Admin member added and invited'
            : 'Admin member added — send the invite from their profile'
        );
        setAddName('');
        setAddEmail('');
        router.refresh();
      } else toast.error(res.error ?? 'Could not add');
    });
  }

  function remove(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from the admin team? They become a crew helper.`)) return;
    startTransition(async () => {
      const res = await removeFromAdminTeam(id);
      if (res.ok) {
        toast.success('Removed from admin team');
        router.refresh();
      } else toast.error(res.error ?? 'Could not remove');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Admin team
        </CardTitle>
        <CardDescription>
          People with back-office access. Roles: owner, admin, manager, sales. This is the only place
          admin access is granted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                  No admin team members yet.
                </TableCell>
              </TableRow>
            ) : (
              team.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    {m.name}
                    {m.exclude_from_roster && (
                      <span
                        className="ml-2 inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground"
                        title="This is a portal login for someone already on the crew roster, so it is hidden from the Employees list. Access is unaffected."
                      >
                        portal login · not on roster
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell>
                    <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)} disabled={pending}>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BACK_OFFICE_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {roleLabel(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove(m.id, m.name)} disabled={pending}>
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-medium">Add an admin member</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Full name" className="w-48" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-56"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACK_OFFICE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={add} disabled={pending}>
              Add &amp; invite
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Creates a new back-office account and emails them a sign-up link.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function LocationsManager({ locations }: { locations: Location[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  function add() {
    if (!name.trim()) return toast.error('Add a location name');
    startTransition(async () => {
      const res = await addLocation(name, address);
      if (res.ok) {
        toast.success('Location added');
        setName('');
        setAddress('');
        router.refresh();
      } else toast.error(res.error ?? 'Could not add');
    });
  }

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      const res = await toggleLocation(id, active);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? 'Could not update');
    });
  }

  function remove(id: string) {
    if (!window.confirm('Delete this location?')) return;
    startTransition(async () => {
      const res = await deleteLocation(id);
      if (res.ok) {
        toast.success('Location deleted');
        router.refresh();
      } else toast.error(res.error ?? 'Could not delete');
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" /> Locations
        </CardTitle>
        <CardDescription>Company locations / branches.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {locations.length > 0 ? (
          <ul className="divide-y">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{l.name}</span>
                    {!l.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  {l.address && <p className="text-sm text-muted-foreground truncate">{l.address}</p>}
                </div>
                <Button variant="outline" size="sm" onClick={() => toggle(l.id, !l.is_active)} disabled={pending}>
                  {l.is_active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(l.id)} disabled={pending}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No locations yet.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end border-t pt-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Atlanta Warehouse" />
          </div>
          <div className="space-y-1.5">
            <Label>Address (optional)</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1285 Collier Rd NW, Atlanta, GA" />
          </div>
          <Button onClick={add} disabled={pending}>
            Add location
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
