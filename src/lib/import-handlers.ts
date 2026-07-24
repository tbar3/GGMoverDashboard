import { query } from './db';

// Each handler takes an array of row objects (from the parsed spreadsheet)
// and upserts them into the appropriate table.
// Returns { imported: number, skipped: number, errors: string[] }

type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};

// Normalize column names: lowercase, trim, replace spaces/special chars with underscores
function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[normalizeKey(key)] = value;
  }
  return normalized;
}

function getString(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = row[key];
    if (val != null && val !== '') return String(val).trim();
  }
  return null;
}

function getNumber(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = row[key];
    if (val != null && val !== '') {
      const num = parseFloat(String(val).replace(/[$,]/g, ''));
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

export async function importEmployees(rows: Record<string, unknown>[]): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const name = getString(row, 'name', 'employee_name', 'full_name', 'employee');
    const email = getString(row, 'email', 'email_address');
    const role = getString(row, 'role', 'position', 'title')?.toLowerCase() || 'helper';
    const startDate = getString(row, 'start_date', 'hire_date', 'date_hired');
    const hourlyRate = getNumber(row, 'hourly_rate', 'rate', 'pay_rate', 'wage');

    if (!name || !email) {
      errors.push(`Skipped row: missing name or email`);
      continue;
    }

    try {
      await query(
        `INSERT INTO employees (name, email, role, start_date, hourly_rate, is_active)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           hourly_rate = COALESCE(EXCLUDED.hourly_rate, employees.hourly_rate),
           start_date = COALESCE(EXCLUDED.start_date, employees.start_date)`,
        [name, email, role, startDate || new Date().toISOString().split('T')[0], hourlyRate]
      );
      imported++;
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped: rows.length - imported - errors.length, errors };
}

export async function importPayroll(rows: Record<string, unknown>[]): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  // Load employees for name matching
  const employees = await query<{ id: string; name: string; hourly_rate: number | null }>(
    'SELECT id, name, hourly_rate FROM employees WHERE is_active = true'
  );
  const nameToEmp = new Map(employees.map(e => [e.name.toLowerCase(), e]));

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const empName = getString(row, 'employee', 'employee_name', 'name', 'full_name');
    if (!empName) {
      errors.push('Skipped row: missing employee name');
      continue;
    }

    const emp = nameToEmp.get(empName.toLowerCase());
    if (!emp) {
      errors.push(`${empName}: employee not found in dashboard`);
      continue;
    }

    const weekStart = getString(row, 'week_start', 'week_starting', 'period_start', 'start_date');
    if (!weekStart) {
      errors.push(`${empName}: missing week_start date`);
      continue;
    }

    // Calculate week_end (Sunday) and pay_date (Friday of next week)
    const ws = new Date(weekStart);
    const weekEnd = new Date(ws);
    weekEnd.setDate(ws.getDate() + 6);
    const payDate = new Date(ws);
    payDate.setDate(ws.getDate() + 11);

    const travelHours = getNumber(row, 'travel_hours', 'travel') || 0;
    const jobHours = getNumber(row, 'job_hours', 'job', 'work_hours') || 0;
    const warehouseHours = getNumber(row, 'warehouse_hours', 'warehouse', 'wh_hours') || 0;
    const totalHours = travelHours + jobHours + warehouseHours;
    const rate = getNumber(row, 'hourly_rate', 'rate', 'pay_rate') || emp.hourly_rate || 0;
    const grossPay = getNumber(row, 'gross_pay', 'gross') || totalHours * rate;

    try {
      await query(
        `INSERT INTO payroll_entries (
          employee_id, week_start, week_end, pay_date,
          travel_hours, job_hours, warehouse_hours, total_hours,
          hourly_rate, gross_pay,
          lunch_reimbursement, mileage_reimbursement, other_reimbursement, tip, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (employee_id, week_start) DO UPDATE SET
          week_end = EXCLUDED.week_end, pay_date = EXCLUDED.pay_date,
          travel_hours = EXCLUDED.travel_hours, job_hours = EXCLUDED.job_hours,
          warehouse_hours = EXCLUDED.warehouse_hours, total_hours = EXCLUDED.total_hours,
          hourly_rate = EXCLUDED.hourly_rate, gross_pay = EXCLUDED.gross_pay,
          lunch_reimbursement = EXCLUDED.lunch_reimbursement,
          mileage_reimbursement = EXCLUDED.mileage_reimbursement,
          other_reimbursement = EXCLUDED.other_reimbursement,
          tip = EXCLUDED.tip, notes = EXCLUDED.notes`,
        [
          emp.id,
          weekStart,
          weekEnd.toISOString().split('T')[0],
          payDate.toISOString().split('T')[0],
          travelHours, jobHours, warehouseHours, totalHours,
          rate, grossPay,
          getNumber(row, 'lunch_reimbursement', 'lunch') || 0,
          getNumber(row, 'mileage_reimbursement', 'mileage', 'mileage_reimb') || 0,
          getNumber(row, 'other_reimbursement', 'other', 'other_reimb') || 0,
          getNumber(row, 'tip', 'tips') || 0,
          getString(row, 'notes', 'note') || null,
        ]
      );
      imported++;
    } catch (err) {
      errors.push(`${empName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped: rows.length - imported - errors.length, errors };
}

export async function importJobs(rows: Record<string, unknown>[]): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const date = getString(row, 'date', 'job_date', 'move_date');
    const customerName = getString(row, 'customer_name', 'customer', 'client', 'name');

    if (!date || !customerName) {
      errors.push('Skipped row: missing date or customer_name');
      continue;
    }

    const jobNumber = getString(row, 'job_number', 'job_#', 'job_no', 'job_id');

    try {
      if (jobNumber) {
        // Upsert by job_number
        await query(
          `INSERT INTO jobs (date, customer_name, pickup_address, dropoff_address, revenue, job_number, service_type,
            customer_phone, customer_email, estimated_hours, volume_cuft, weight_lbs, pricing_type, truck_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (calendar_event_id) DO NOTHING`,
          [
            date, customerName,
            getString(row, 'pickup_address', 'origin', 'address', 'origin_address') || '',
            getString(row, 'dropoff_address', 'destination', 'dest_address') || '',
            getNumber(row, 'revenue', 'amount', 'total', 'price'),
            jobNumber,
            getString(row, 'service_type', 'service', 'type'),
            getString(row, 'customer_phone', 'phone'),
            getString(row, 'customer_email', 'email'),
            getNumber(row, 'estimated_hours', 'est_hours', 'hours'),
            getNumber(row, 'volume_cuft', 'volume', 'cuft', 'cu_ft'),
            getNumber(row, 'weight_lbs', 'weight', 'lbs'),
            getString(row, 'pricing_type', 'billing_type'),
            getString(row, 'truck_name', 'truck'),
          ]
        );
      } else {
        await query(
          `INSERT INTO jobs (date, customer_name, pickup_address, dropoff_address, revenue, service_type,
            customer_phone, customer_email, estimated_hours, truck_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            date, customerName,
            getString(row, 'pickup_address', 'origin', 'address') || '',
            getString(row, 'dropoff_address', 'destination') || '',
            getNumber(row, 'revenue', 'amount', 'total', 'price'),
            getString(row, 'service_type', 'service', 'type'),
            getString(row, 'customer_phone', 'phone'),
            getString(row, 'customer_email', 'email'),
            getNumber(row, 'estimated_hours', 'est_hours', 'hours'),
            getString(row, 'truck_name', 'truck'),
          ]
        );
      }
      imported++;
    } catch (err) {
      errors.push(`${customerName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped: rows.length - imported - errors.length, errors };
}

export async function importAttendance(rows: Record<string, unknown>[]): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  const employees = await query<{ id: string; name: string }>(
    'SELECT id, name FROM employees WHERE is_active = true'
  );
  const nameToId = new Map(employees.map(e => [e.name.toLowerCase(), e.id]));

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const empName = getString(row, 'employee', 'employee_name', 'name');
    const date = getString(row, 'date');

    if (!empName || !date) {
      errors.push('Skipped row: missing employee or date');
      continue;
    }

    const empId = nameToId.get(empName.toLowerCase());
    if (!empId) {
      errors.push(`${empName}: employee not found`);
      continue;
    }

    const arrivalTime = getString(row, 'arrival_time', 'time_in', 'clock_in');
    const isTardy = row['is_tardy'] === true || row['is_tardy'] === 'true' || row['tardy'] === true || row['tardy'] === 'true';

    try {
      await query(
        `INSERT INTO attendance (employee_id, date, arrival_time, is_tardy, in_uniform, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (employee_id, date) DO UPDATE SET
           arrival_time = EXCLUDED.arrival_time,
           is_tardy = EXCLUDED.is_tardy,
           notes = EXCLUDED.notes`,
        [empId, date, arrivalTime, isTardy, true, getString(row, 'notes', 'note')]
      );
      imported++;
    } catch (err) {
      errors.push(`${empName} ${date}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped: rows.length - imported - errors.length, errors };
}

export async function importDamages(rows: Record<string, unknown>[]): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const description = getString(row, 'description', 'damage', 'details');
    const amount = getNumber(row, 'amount', 'cost', 'damage_amount');

    if (!description || amount == null) {
      errors.push('Skipped row: missing description or amount');
      continue;
    }

    const wasReported = row['was_reported'] !== false && row['was_reported'] !== 'false' && row['reported'] !== false && row['reported'] !== 'false';

    try {
      await query(
        `INSERT INTO damages (description, amount, was_reported) VALUES ($1, $2, $3)`,
        [description, amount, wasReported]
      );
      imported++;
    } catch (err) {
      errors.push(`${description}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped: rows.length - imported - errors.length, errors };
}

export async function importPerformance(rows: Record<string, unknown>[]): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  const employees = await query<{ id: string; name: string }>(
    'SELECT id, name FROM employees WHERE is_active = true'
  );
  const nameToId = new Map(employees.map(e => [e.name.toLowerCase(), e.id]));

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const empName = getString(row, 'employee', 'employee_name', 'name');
    const date = getString(row, 'date');
    const type = getString(row, 'type', 'event_type')?.toLowerCase();

    if (!empName || !date || !type) {
      errors.push('Skipped row: missing employee, date, or type');
      continue;
    }

    const empId = nameToId.get(empName.toLowerCase());
    if (!empId) {
      errors.push(`${empName}: employee not found`);
      continue;
    }

    // Map common variations to valid types
    let eventType = type;
    if (type.includes('5') || type.includes('star') || type.includes('five')) eventType = 'five_star_review';
    else if (type.includes('customer')) eventType = 'customer_callout';
    else if (type.includes('crew')) eventType = 'crew_callout';

    try {
      await query(
        `INSERT INTO performance_events (employee_id, type, description, date)
         VALUES ($1, $2, $3, $4)`,
        [empId, eventType, getString(row, 'description', 'details', 'note'), date]
      );
      imported++;
    } catch (err) {
      errors.push(`${empName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped: rows.length - imported - errors.length, errors };
}

export async function importMileage(rows: Record<string, unknown>[]): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  const employees = await query<{ id: string; name: string }>(
    'SELECT id, name FROM employees WHERE is_active = true'
  );
  const nameToId = new Map(employees.map(e => [e.name.toLowerCase(), e.id]));

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const empName = getString(row, 'employee', 'employee_name', 'name');
    const date = getString(row, 'date');
    const miles = getNumber(row, 'miles', 'distance', 'mileage');

    if (!empName || !date || miles == null) {
      errors.push('Skipped row: missing employee, date, or miles');
      continue;
    }

    const empId = nameToId.get(empName.toLowerCase());
    if (!empId) {
      errors.push(`${empName}: employee not found`);
      continue;
    }

    const rate = 0.60;
    const amount = getNumber(row, 'amount', 'reimbursement') || miles * rate;

    try {
      await query(
        `INSERT INTO mileage_entries (employee_id, date, miles, amount)
         VALUES ($1, $2, $3, $4)`,
        [empId, date, miles, amount]
      );
      imported++;
    } catch (err) {
      errors.push(`${empName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped: rows.length - imported - errors.length, errors };
}

// The import route parses with { cellDates: true }, so date cells arrive as JS
// Date objects; text exports arrive as "M/D/YYYY" strings. Handle both, and
// return a plain YYYY-MM-DD (UTC parts, since SmartMoving dates are calendar
// dates stored at UTC midnight).
function getDate(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = row[key];
    if (val == null || val === '') continue;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) continue;
      return val.toISOString().slice(0, 10);
    }
    const s = String(val).trim();
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

// Full timestamp (booked/completed at). Returns an ISO string or null.
function getTimestamp(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = row[key];
    if (val == null || val === '') continue;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) continue;
      return val.toISOString();
    }
    const d = new Date(String(val).trim());
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

// SmartMoving "all jobs" report (91 columns). Back-office only — company-wide
// financials and pipeline; never fed to crew. Upserts by SmartMoving Job Id so a
// re-uploaded weekly export refreshes existing rows (status/actuals) and adds new
// ones. Keeps a useful subset of the columns; skips granular fee breakdowns.
export async function importSmartMovingJobs(
  rows: Record<string, unknown>[]
): Promise<ImportResult> {
  let imported = 0;
  const errors: string[] = [];

  for (const raw of rows) {
    const row = normalizeRow(raw);
    const jobId = getString(row, 'job_id');
    if (!jobId) {
      errors.push('Skipped row: missing Job Id');
      continue;
    }

    try {
      await query(
        `INSERT INTO smartmoving_jobs (
           smartmoving_job_id, job_number, opportunity_status, job_type, opportunity_type,
           job_rating, job_date, booked_at_utc, completed_at_utc,
           customer_name, customer_email, customer_phone, referral_source,
           sales_person_name, estimator_name, move_coordinator_name, branch_name,
           volume, weight, mileage,
           est_trucks, est_crew, est_materials_cost, est_labor_cost, total_estimated_cost,
           actual_trucks, actual_crew, actual_materials_cost, actual_labor_cost,
           total_actual_cost, tip_amount,
           origin_city, origin_state, destination_city, destination_state,
           crew_member_names, truck_names, pricing_method, services_requested,
           imported_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
           $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,
           NOW()
         )
         ON CONFLICT (smartmoving_job_id) DO UPDATE SET
           job_number = EXCLUDED.job_number,
           opportunity_status = EXCLUDED.opportunity_status,
           job_type = EXCLUDED.job_type,
           opportunity_type = EXCLUDED.opportunity_type,
           job_rating = EXCLUDED.job_rating,
           job_date = EXCLUDED.job_date,
           booked_at_utc = EXCLUDED.booked_at_utc,
           completed_at_utc = EXCLUDED.completed_at_utc,
           customer_name = EXCLUDED.customer_name,
           customer_email = EXCLUDED.customer_email,
           customer_phone = EXCLUDED.customer_phone,
           referral_source = EXCLUDED.referral_source,
           sales_person_name = EXCLUDED.sales_person_name,
           estimator_name = EXCLUDED.estimator_name,
           move_coordinator_name = EXCLUDED.move_coordinator_name,
           branch_name = EXCLUDED.branch_name,
           volume = EXCLUDED.volume,
           weight = EXCLUDED.weight,
           mileage = EXCLUDED.mileage,
           est_trucks = EXCLUDED.est_trucks,
           est_crew = EXCLUDED.est_crew,
           est_materials_cost = EXCLUDED.est_materials_cost,
           est_labor_cost = EXCLUDED.est_labor_cost,
           total_estimated_cost = EXCLUDED.total_estimated_cost,
           actual_trucks = EXCLUDED.actual_trucks,
           actual_crew = EXCLUDED.actual_crew,
           actual_materials_cost = EXCLUDED.actual_materials_cost,
           actual_labor_cost = EXCLUDED.actual_labor_cost,
           total_actual_cost = EXCLUDED.total_actual_cost,
           tip_amount = EXCLUDED.tip_amount,
           origin_city = EXCLUDED.origin_city,
           origin_state = EXCLUDED.origin_state,
           destination_city = EXCLUDED.destination_city,
           destination_state = EXCLUDED.destination_state,
           crew_member_names = EXCLUDED.crew_member_names,
           truck_names = EXCLUDED.truck_names,
           pricing_method = EXCLUDED.pricing_method,
           services_requested = EXCLUDED.services_requested,
           imported_at = NOW()`,
        [
          jobId,
          getString(row, 'job_number'),
          getString(row, 'opportunity_status'),
          getString(row, 'job_type'),
          getString(row, 'opportunity_type'),
          getString(row, 'job_rating'),
          getDate(row, 'job_date'),
          getTimestamp(row, 'booked_at_utc'),
          getTimestamp(row, 'completed_at_utc'),
          getString(row, 'customer_name'),
          getString(row, 'customer_email'),
          getString(row, 'customer_phone'),
          getString(row, 'referral_source'),
          getString(row, 'sales_person_name'),
          getString(row, 'estimator_name'),
          getString(row, 'move_coordinator_name'),
          getString(row, 'branch_name'),
          getNumber(row, 'volume'),
          getNumber(row, 'weight'),
          getNumber(row, 'origin_to_destination_mileage'),
          getNumber(row, 'estimated_number_of_trucks'),
          getNumber(row, 'estimated_number_of_crew'),
          getNumber(row, 'estimated_materials_cost'),
          getNumber(row, 'estimated_labor_cost'),
          getNumber(row, 'total_estimated_cost'),
          getNumber(row, 'actual_number_of_trucks'),
          getNumber(row, 'actual_number_of_crew'),
          getNumber(row, 'actual_materials_cost'),
          getNumber(row, 'actual_labor_cost'),
          getNumber(row, 'total_actual_cost'),
          getNumber(row, 'tip_amount'),
          getString(row, 'origin_city'),
          getString(row, 'origin_state'),
          getString(row, 'destination_city'),
          getString(row, 'destination_state'),
          getString(row, 'crew_member_names'),
          getString(row, 'truck_names'),
          getString(row, 'pricing_method'),
          getString(row, 'services_requested'),
        ]
      );
      imported++;
    } catch (err) {
      errors.push(`Job ${jobId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { imported, skipped: rows.length - imported - errors.length, errors };
}

export const IMPORT_HANDLERS: Record<string, (rows: Record<string, unknown>[]) => Promise<ImportResult>> = {
  employees: importEmployees,
  payroll: importPayroll,
  jobs: importJobs,
  attendance: importAttendance,
  damages: importDamages,
  performance: importPerformance,
  mileage: importMileage,
  smartmoving_jobs: importSmartMovingJobs,
};

export const IMPORT_TYPES = [
  { value: 'employees', label: 'Employees', description: 'Name, email, role, start date, hourly rate' },
  { value: 'payroll', label: 'Payroll', description: 'Employee, week start, travel/job/warehouse hours, reimbursements, tips' },
  { value: 'jobs', label: 'Jobs', description: 'Date, customer, address, revenue, service type' },
  { value: 'attendance', label: 'Attendance', description: 'Employee, date, arrival time, tardy status' },
  { value: 'damages', label: 'Damages', description: 'Description, amount, reported status' },
  { value: 'performance', label: 'Performance Events', description: 'Employee, date, type (5-star, customer, crew), description' },
  { value: 'mileage', label: 'Mileage', description: 'Employee, date, miles' },
  { value: 'smartmoving_jobs', label: 'SmartMoving Jobs Report', description: 'SmartMoving "all jobs" export — status, trucks, financials (back office)' },
];
