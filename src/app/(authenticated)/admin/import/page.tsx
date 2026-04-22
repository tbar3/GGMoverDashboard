'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';

const IMPORT_TYPES = [
  { value: 'employees', label: 'Employees', description: 'Name, email, role, start date, hourly rate' },
  { value: 'payroll', label: 'Payroll', description: 'Employee, week start, travel/job/warehouse hours, reimbursements, tips' },
  { value: 'jobs', label: 'Jobs', description: 'Date, customer, address, revenue, service type' },
  { value: 'attendance', label: 'Attendance', description: 'Employee, date, arrival time, tardy status' },
  { value: 'damages', label: 'Damages', description: 'Description, amount, reported status' },
  { value: 'performance', label: 'Performance Events', description: 'Employee, date, type (5-star, customer, crew), description' },
  { value: 'mileage', label: 'Mileage', description: 'Employee, date, miles' },
];

const COLUMN_HINTS: Record<string, string[]> = {
  employees: ['name', 'email', 'role', 'start_date', 'hourly_rate'],
  payroll: ['employee', 'week_start', 'travel_hours', 'job_hours', 'warehouse_hours', 'hourly_rate', 'lunch_reimbursement', 'mileage_reimbursement', 'other_reimbursement', 'tip'],
  jobs: ['date', 'customer_name', 'pickup_address', 'dropoff_address', 'revenue', 'job_number', 'service_type', 'customer_phone'],
  attendance: ['employee', 'date', 'arrival_time', 'is_tardy', 'notes'],
  damages: ['description', 'amount', 'was_reported'],
  performance: ['employee', 'date', 'type', 'description'],
  mileage: ['employee', 'date', 'miles'],
};

export default function ImportPage() {
  const [importType, setImportType] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    total_rows: number;
    imported: number;
    skipped: number;
    errors: string[];
    columns: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImport() {
    if (!file || !importType) return;

    setImporting(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', importType);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Import failed');
        return;
      }

      setResult(data);
      if (data.imported > 0) {
        toast.success(`Successfully imported ${data.imported} records`);
      } else {
        toast.error('No records were imported. Check the errors below.');
      }
    } catch {
      toast.error('Failed to upload file');
    } finally {
      setImporting(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setResult(null);
    }
  }

  function resetForm() {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const selectedType = IMPORT_TYPES.find(t => t.value === importType);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import Data</h1>
        <p className="text-muted-foreground mt-1">
          Upload CSV or Excel files to import data from SmartMoving or other sources
        </p>
      </div>

      {/* Import Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Upload File
          </CardTitle>
          <CardDescription>
            Supports .csv, .xlsx, and .xls files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Select type */}
          <div className="space-y-2">
            <Label>1. What are you importing?</Label>
            <Select value={importType} onValueChange={(val) => { setImportType(val); setResult(null); }}>
              <SelectTrigger className="w-full md:w-[400px]">
                <SelectValue placeholder="Select data type..." />
              </SelectTrigger>
              <SelectContent>
                {IMPORT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <span className="font-medium">{type.label}</span>
                    <span className="text-muted-foreground ml-2 text-xs">— {type.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Column hints */}
          {importType && COLUMN_HINTS[importType] && (
            <div className="rounded-lg border p-3 bg-secondary/40">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-primary">Expected columns for {selectedType?.label}:</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {COLUMN_HINTS[importType].map((col) => (
                      <Badge key={col} variant="secondary" className="text-xs font-mono">{col}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-primary mt-1">
                    Column names are flexible — spaces, caps, and slight variations are handled automatically.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Upload file */}
          {importType && (
            <div className="space-y-2">
              <Label>2. Choose your file</Label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  className="block text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary/40 file:text-primary hover:file:bg-secondary"
                />
                {file && (
                  <Badge variant="outline">
                    {file.name} ({(file.size / 1024).toFixed(0)} KB)
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Import */}
          {file && importType && (
            <div className="flex gap-3 pt-2">
              <Button onClick={handleImport} disabled={importing}>
                {importing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {importing ? 'Importing...' : `Import ${selectedType?.label}`}
              </Button>
              <Button variant="outline" onClick={resetForm}>
                Reset
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.imported > 0 ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-2xl font-bold">{result.total_rows}</p>
                <p className="text-xs text-muted-foreground">Total Rows</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-green-50">
                <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                <p className="text-xs text-muted-foreground">Imported</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-red-50">
                <p className="text-2xl font-bold text-destructive">{result.errors.length}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
            </div>

            {result.columns.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Detected columns:</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.columns.map((col) => (
                    <Badge key={col} variant="outline" className="text-xs font-mono">{col}</Badge>
                  ))}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div>
                <p className="text-sm font-medium text-destructive mb-1">Errors ({result.errors.length}):</p>
                <div className="max-h-48 overflow-y-auto space-y-1 bg-red-50 rounded-lg p-3">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-sm text-red-700">{err}</p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
