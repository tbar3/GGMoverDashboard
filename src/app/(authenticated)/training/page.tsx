import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GraduationCap } from 'lucide-react';

export default function TrainingPlaceholderPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Training</h1>
        <p className="text-muted-foreground mt-1">Certifications and skills training</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            Coming soon
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Training modules — pad-wrapping, packing, stacking, driving, and the certifications
            that move you up the pay scale — will live here. This module is being built.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
