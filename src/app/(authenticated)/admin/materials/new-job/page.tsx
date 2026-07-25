import { getTrucks, getCrewEmployeeNames } from '@/lib/materials/queries';
import { createJob } from '@/lib/materials/actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

const field = 'w-full rounded-md border bg-background px-3 py-2 text-sm';
const label = 'mb-1 block text-xs font-medium text-muted-foreground';

export default async function NewMaterialsJobPage() {
  const [trucks, crewNames] = await Promise.all([getTrucks(), getCrewEmployeeNames()]);

  async function start(formData: FormData) {
    'use server';
    const truckId = Number(formData.get('truckId'));
    const date = String(formData.get('date'));
    const storageIn = formData.get('storageIn') === 'on';
    await createJob(truckId, date, storageIn, 'crew', {
      customer: String(formData.get('customer') ?? ''),
      jobNumber: String(formData.get('jobNumber') ?? ''),
      crewLead: String(formData.get('crewLead') ?? ''),
      crew: formData.getAll('crew').map(String).join(', '),
    });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>New count sheet</CardTitle>
        <CardDescription>
          Start a truck count. It opens the sheet, pre-filled with the details you enter here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {trucks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add a truck under Settings first.</p>
        ) : (
          <form action={start} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={label}>Truck</label>
                <select name="truckId" required defaultValue="" className={field}>
                  <option value="" disabled>
                    Choose…
                  </option>
                  {trucks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Date</label>
                <input type="date" name="date" required defaultValue={today()} className={field} />
              </div>
              <div>
                <label className={label}>Customer name</label>
                <input name="customer" placeholder="e.g. Amber Mirani" className={field} />
              </div>
              <div>
                <label className={label}>Job #</label>
                <input name="jobNumber" placeholder="e.g. 1804-2" className={field} />
              </div>
              <div>
                <label className={label}>Crew Lead</label>
                <select name="crewLead" defaultValue="" className={field}>
                  <option value="">Select…</option>
                  {crewNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={label}>Crew</label>
              {crewNames.length === 0 ? (
                <p className="text-sm text-muted-foreground">No crew members yet — add them under Employees.</p>
              ) : (
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                  {crewNames.map((n) => (
                    <label key={n} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="crew" value={n} className="h-4 w-4" />
                      {n}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
              <input type="checkbox" name="storageIn" className="mt-0.5 h-4 w-4" />
              <span>
                <span className="font-medium">Storage-In job</span>
                <span className="block text-muted-foreground">Pads stay wrapped in storage.</span>
              </span>
            </label>

            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Open count sheet
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
