import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen } from 'lucide-react';

export default function PoliciesPlaceholderPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Handbook &amp; Policies</h1>
        <p className="text-muted-foreground mt-1">Company handbook, SOPs, and standing policy</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Coming soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            The employee handbook and company policies will live here — readable in English and
            Spanish, with a record of who&apos;s reviewed each one. This module is being built.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
