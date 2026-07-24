import { getCurrentEmployee } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileForm } from '@/components/crew/profile-form';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const employee = await getCurrentEmployee();

  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Employee profile not found. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
        <p className="text-muted-foreground mt-1">
          {employee.name} · <span className="capitalize">{employee.role}</span>
        </p>
      </div>
      <ProfileForm initialRate={employee.hourly_rate ?? null} />
    </div>
  );
}
