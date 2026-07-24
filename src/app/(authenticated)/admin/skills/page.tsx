import { getAllSkills } from '@/lib/skills';
import { getBaseRate } from '@/lib/settings';
import { PayScaleEditor } from './pay-scale-editor';

export const dynamic = 'force-dynamic';

export default async function PayScaleAdminPage() {
  const [skills, baseRate] = await Promise.all([getAllSkills(), getBaseRate()]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Pay Scale &amp; Skills</h1>
        <p className="text-muted-foreground mt-1">
          Manage the base rate and the skills that raise it. Grant skills to individual crew on
          their employee page.
        </p>
      </div>
      <PayScaleEditor skills={skills} baseRate={baseRate} />
    </div>
  );
}
