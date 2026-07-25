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
}
interface Candidate {
  id: string;
  name: string;
}
interface Location {
  id: string;
  name: string;
  address: string | null;
  is_active: boolean;
}

export function AdminTeamManager({
  team,
  candidates,
}: {
  team: TeamMember[];
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addId, setAddId] = useState('');
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
    if (!addId) return toast.error('Pick a person');
    startTransition(async () => {
      const res = await setAdminRole(addId, addRole);
      if (res.ok) {
        toast.success('Added to admin team');
        setAddId('');
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
                  <TableCell className="font-medium">{m.name}</TableCell>
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

        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          <div className="space-y-1.5">
            <Label>Add person</Label>
            <Select value={addId} onValueChange={setAddId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select an employee…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Button onClick={add} disabled={pending || candidates.length === 0}>
            Add to admin team
          </Button>
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
