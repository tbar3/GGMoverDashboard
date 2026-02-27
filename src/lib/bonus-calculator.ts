import { differenceInMonths } from 'date-fns';
import { CONFIG, Employee, Damage, PerformanceEvent, MileageEntry, PerfectWeek } from '@/types';

interface BonusCalculationInput {
  totalRevenue: number;
  poolPercentage?: number;
  employees: Employee[];
  damages: Damage[];
  performanceEvents: PerformanceEvent[];
  mileageEntries: MileageEntry[];
  perfectWeeks: PerfectWeek[];
  calculationDate?: Date;
}

interface EmployeeBonusPayout {
  employeeId: string;
  employeeName: string;
  tenureMonths: number;
  tenureShares: number;
  tenureAmount: number;
  performanceScore: number;
  performanceAmount: number;
  mileageAmount: number;
  perfectWeekHours: number;
  perfectWeekAmount: number;
  totalAmount: number;
}

interface BonusCalculationResult {
  totalRevenue: number;
  poolPercentage: number;
  grossPool: number;
  damagesDeducted: number;
  netPool: number;
  tenurePool: number;
  performancePool: number;
  totalTenureShares: number;
  totalPerformanceScore: number;
  payouts: EmployeeBonusPayout[];
}

export function calculateMonthlyBonus(input: BonusCalculationInput): BonusCalculationResult {
  const {
    totalRevenue,
    poolPercentage = CONFIG.DEFAULT_POOL_PERCENTAGE,
    employees,
    damages,
    performanceEvents,
    mileageEntries,
    perfectWeeks,
    calculationDate = new Date(),
  } = input;

  // Filter to active employees only
  const activeEmployees = employees.filter(e => e.is_active);

  // Calculate gross pool
  const grossPool = totalRevenue * (poolPercentage / 100);

  // Calculate damages deduction
  const damagesDeducted = damages.reduce((total, damage) => {
    const multiplier = damage.was_reported ? 1 : CONFIG.UNREPORTED_DAMAGE_MULTIPLIER;
    return total + (damage.amount * multiplier);
  }, 0);

  // Calculate net pool after damages
  const netPool = Math.max(0, grossPool - damagesDeducted);

  // Split pool 50/50
  const tenurePool = netPool / 2;
  const performancePool = netPool / 2;

  // Calculate tenure shares for each employee (1 month = 1 share)
  const employeeTenure = activeEmployees.map(emp => {
    const startDate = new Date(emp.start_date);
    const months = differenceInMonths(calculationDate, startDate);
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      tenureMonths: Math.max(0, months),
      tenureShares: Math.max(0, months), // 1 month = 1 share
    };
  });

  const totalTenureShares = employeeTenure.reduce((sum, e) => sum + e.tenureShares, 0);

  // Calculate performance scores for each employee
  const employeePerformance = activeEmployees.map(emp => {
    const events = performanceEvents.filter(pe => pe.employee_id === emp.id);
    // Simple scoring: each event = 1 point (can be weighted differently)
    const score = events.length;
    return {
      employeeId: emp.id,
      performanceScore: score,
    };
  });

  const totalPerformanceScore = employeePerformance.reduce((sum, e) => sum + e.performanceScore, 0);

  // Calculate mileage for each employee
  const employeeMileage = activeEmployees.map(emp => {
    const entries = mileageEntries.filter(me => me.employee_id === emp.id);
    const totalMiles = entries.reduce((sum, entry) => sum + entry.miles, 0);
    return {
      employeeId: emp.id,
      mileageAmount: totalMiles * CONFIG.MILEAGE_RATE,
    };
  });

  // Calculate perfect weeks for each employee
  const employeePerfectWeeks = activeEmployees.map(emp => {
    const weeks = perfectWeeks.filter(pw => pw.employee_id === emp.id && pw.achieved);
    return {
      employeeId: emp.id,
      perfectWeekHours: weeks.length, // 1 bonus hour per perfect week
    };
  });

  // Calculate payouts
  const payouts: EmployeeBonusPayout[] = activeEmployees.map(emp => {
    const tenure = employeeTenure.find(t => t.employeeId === emp.id)!;
    const performance = employeePerformance.find(p => p.employeeId === emp.id)!;
    const mileage = employeeMileage.find(m => m.employeeId === emp.id)!;
    const perfectWeek = employeePerfectWeeks.find(pw => pw.employeeId === emp.id)!;

    // Calculate tenure amount
    const tenureAmount = totalTenureShares > 0
      ? (tenure.tenureShares / totalTenureShares) * tenurePool
      : 0;

    // Calculate performance amount
    const performanceAmount = totalPerformanceScore > 0
      ? (performance.performanceScore / totalPerformanceScore) * performancePool
      : 0;

    // Perfect week bonus (assuming hourly rate - this would need to be configured)
    // For now, just track the hours - actual dollar amount would depend on hourly rate
    const perfectWeekAmount = 0; // Would need hourly rate to calculate

    const totalAmount = tenureAmount + performanceAmount + mileage.mileageAmount + perfectWeekAmount;

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      tenureMonths: tenure.tenureMonths,
      tenureShares: tenure.tenureShares,
      tenureAmount: Math.round(tenureAmount * 100) / 100,
      performanceScore: performance.performanceScore,
      performanceAmount: Math.round(performanceAmount * 100) / 100,
      mileageAmount: Math.round(mileage.mileageAmount * 100) / 100,
      perfectWeekHours: perfectWeek.perfectWeekHours,
      perfectWeekAmount: Math.round(perfectWeekAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
    };
  });

  return {
    totalRevenue,
    poolPercentage,
    grossPool: Math.round(grossPool * 100) / 100,
    damagesDeducted: Math.round(damagesDeducted * 100) / 100,
    netPool: Math.round(netPool * 100) / 100,
    tenurePool: Math.round(tenurePool * 100) / 100,
    performancePool: Math.round(performancePool * 100) / 100,
    totalTenureShares,
    totalPerformanceScore,
    payouts,
  };
}

// Helper to check if an employee had a perfect week
export function checkPerfectWeek(
  attendance: { date: string; is_tardy: boolean; in_uniform: boolean }[],
  checklistCompletions: { date: string; items_completed: string[]; total_items: number }[]
): boolean {
  // Must have worked at least one day
  if (attendance.length === 0) return false;

  // Check all attendance records for the week
  const allOnTime = attendance.every(a => !a.is_tardy);
  const allInUniform = attendance.every(a => a.in_uniform);

  // Check all checklists were completed
  const allChecklistsComplete = checklistCompletions.every(
    c => c.items_completed.length >= c.total_items
  );

  return allOnTime && allInUniform && allChecklistsComplete;
}
