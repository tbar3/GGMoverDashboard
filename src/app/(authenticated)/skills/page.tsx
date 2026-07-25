import { getCurrentEmployee } from '@/lib/auth';
import { getSkills, getEmployeeSkills, effectiveRate, sumRaises } from '@/lib/skills';
import { getBaseRate } from '@/lib/settings';
import { getEmployeeCertProgress } from '@/lib/certifications';
import { Card, CardContent } from '@/components/ui/card';
import { SkillsContent } from './skills-content';

export const dynamic = 'force-dynamic';

export default async function SkillsPage() {
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

  const [skills, earned, baseRate, certProgress] = await Promise.all([
    getSkills(),
    getEmployeeSkills(employee.id),
    getBaseRate(),
    getEmployeeCertProgress(employee.id),
  ]);
  const earnedRaiseSum = sumRaises(earned);
  const currentRate = effectiveRate(employee.hourly_rate ?? null, earnedRaiseSum, baseRate);

  return (
    <SkillsContent
      skills={skills}
      earnedSkillIds={earned.map((e) => e.skill_id)}
      currentRate={currentRate}
      baseRate={baseRate}
      isOverride={employee.hourly_rate != null}
      certProgress={certProgress}
    />
  );
}
