import { MaterialsTabs } from './materials-tabs';

export default function MaterialsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Materials</h1>
        <p className="text-muted-foreground mt-1">
          Settings, receiving, adjustments, movement history, and inventory reports.
        </p>
      </div>
      <MaterialsTabs />
      {children}
    </div>
  );
}
