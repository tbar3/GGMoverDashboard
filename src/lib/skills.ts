import { query } from '@/lib/db';
import { CONFIG } from '@/types';

export interface Skill {
  id: string;
  name: string;
  raise_amount: number;
  sort_order: number;
  active: boolean;
}

export interface EarnedSkill {
  id: string;
  skill_id: string;
  name: string;
  raise_amount: number;
  sort_order: number;
  granted_at: string;
  acknowledged: boolean;
}

export async function getSkills(): Promise<Skill[]> {
  return query<Skill>(
    'SELECT id, name, raise_amount, sort_order, active FROM skills WHERE active = TRUE ORDER BY sort_order, name'
  );
}

export async function getEmployeeSkills(employeeId: string): Promise<EarnedSkill[]> {
  return query<EarnedSkill>(
    `SELECT es.id, es.skill_id, s.name, s.raise_amount, s.sort_order,
            es.granted_at, es.acknowledged
       FROM employee_skills es
       JOIN skills s ON s.id = es.skill_id
      WHERE es.employee_id = $1
      ORDER BY s.sort_order, s.name`,
    [employeeId]
  );
}

/**
 * Effective hourly rate: the manual override if set, otherwise the pay-scale
 * rate (base + the raise from every earned skill).
 */
export function effectiveRate(override: number | null, earnedRaiseSum: number): number {
  return override != null ? override : CONFIG.BASE_HOURLY_RATE + earnedRaiseSum;
}

export function sumRaises(earned: Pick<EarnedSkill, 'raise_amount'>[]): number {
  return earned.reduce((s, e) => s + Number(e.raise_amount), 0);
}
