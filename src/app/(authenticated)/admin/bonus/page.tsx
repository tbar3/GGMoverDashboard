'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { format, startOfMonth, endOfMonth, differenceInMonths } from 'date-fns';
import { Calculator, DollarSign, Users, TrendingDown, AlertTriangle, Star, Car } from 'lucide-react';
import { toast } from 'sonner';
import { Employee, Damage, PerformanceEvent, MileageEntry, PerfectWeek, CONFIG } from '@/types';
import { calculateMonthlyBonus } from '@/lib/bonus-calculator';

export default function BonusCalculatorPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [damages, setDamages] = useState<Damage[]>([]);
  const [performanceEvents, setPerformanceEvents] = useState<PerformanceEvent[]>([]);
  const [mileageEntries, setMileageEntries] = useState<MileageEntry[]>([]);
  const [perfectWeeks, setPerfectWeeks] = useState<PerfectWeek[]>([]);
  const [loading, setLoading] = useState(true);

  const [revenue, setRevenue] = useState('');
  const [poolPercentage, setPoolPercentage] = useState(CONFIG.DEFAULT_POOL_PERCENTAGE.toString());
  const [calculated, setCalculated] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof calculateMonthlyBonus> | null>(null);

  const supabase = createClient();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');
    const monthEndStr = format(monthEnd, 'yyyy-MM-dd');

    const [employeesRes, damagesRes, performanceRes, mileageRes, perfectWeeksRes] = await Promise.all([
      supabase.from('employees').select('*').eq('is_active', true),
      supabase.from('damages').select('*').gte('created_at', monthStartStr).lte('created_at', monthEndStr),
      supabase.from('performance_events').select('*').gte('date', monthStartStr).lte('date', monthEndStr),
      supabase.from('mileage_entries').select('*').gte('date', monthStartStr).lte('date', monthEndStr),
      supabase.from('perfect_weeks').select('*').gte('week_start', monthStartStr).lte('week_end', monthEndStr),
    ]);

    if (employeesRes.data) setEmployees(employeesRes.data);
    if (damagesRes.data) setDamages(damagesRes.data);
    if (performanceRes.data) setPerformanceEvents(performanceRes.data);
    if (mileageRes.data) setMileageEntries(mileageRes.data);
    if (perfectWeeksRes.data) setPerfectWeeks(perfectWeeksRes.data);

    setLoading(false);
  }

  function handleCalculate() {
    if (!revenue || parseFloat(revenue) <= 0) {
      toast.error('Please enter a valid revenue amount');
      return;
    }

    const calcResult = calculateMonthlyBonus({
      totalRevenue: parseFloat(revenue),
      poolPercentage: parseFloat(poolPercentage),
      employees,
      damages,
      performanceEvents,
      mileageEntries,
      perfectWeeks,
      calculationDate: now,
    });

    setResult(calcResult);
    setCalculated(true);
  }

  const totalDamages = damages.reduce((sum, d) => {
    return sum + (d.was_reported ? d.amount : d.amount * CONFIG.UNREPORTED_DAMAGE_MULTIPLIER);
  }, 0);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bonus Calculator</h1>
        <p className="text-gray-500 mt-1">
          Calculate monthly bonus pool distribution for {format(now, 'MMMM yyyy')}
        </p>
      </div>

      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculate Bonus Pool
          </CardTitle>
          <CardDescription>
            Enter the total revenue to calculate bonus distribution
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="revenue">Total Monthly Revenue ($)</Label>
              <Input
                id="revenue"
                type="number"
                step="0.01"
                value={revenue}
                onChange={(e) => {
                  setRevenue(e.target.value);
                  setCalculated(false);
                }}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="percentage">Pool Percentage (%)</Label>
              <Input
                id="percentage"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={poolPercentage}
                onChange={(e) => {
                  setPoolPercentage(e.target.value);
                  setCalculated(false);
                }}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCalculate} className="w-full">
                Calculate Bonus
              </Button>
            </div>
          </div>

          {/* Preview Metrics */}
          <Separator />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-500">
                <Users className="h-4 w-4" />
                Active Employees
              </div>
              <p className="text-xl font-bold mt-1">{employees.length}</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 text-red-600">
                <TrendingDown className="h-4 w-4" />
                Damages Impact
              </div>
              <p className="text-xl font-bold mt-1 text-red-600">-${totalDamages.toFixed(2)}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 text-green-600">
                <Star className="h-4 w-4" />
                Performance Events
              </div>
              <p className="text-xl font-bold mt-1 text-green-600">{performanceEvents.length}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 text-blue-600">
                <Car className="h-4 w-4" />
                Mileage Entries
              </div>
              <p className="text-xl font-bold mt-1 text-blue-600">{mileageEntries.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Section */}
      {calculated && result && (
        <>
          {/* Pool Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <CardHeader className="pb-2">
                <CardDescription className="text-blue-100">Gross Pool</CardDescription>
                <CardTitle className="text-2xl text-white">
                  ${result.grossPool.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-blue-100 text-sm">
                  {result.poolPercentage}% of ${result.totalRevenue.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card className="bg-red-50 border-red-200">
              <CardHeader className="pb-2">
                <CardDescription className="text-red-600">Damages Deducted</CardDescription>
                <CardTitle className="text-2xl text-red-600">
                  -${result.damagesDeducted.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-500 text-sm">{damages.length} damage incidents</p>
              </CardContent>
            </Card>

            <Card className="bg-green-50 border-green-200">
              <CardHeader className="pb-2">
                <CardDescription className="text-green-600">Net Pool</CardDescription>
                <CardTitle className="text-2xl text-green-600">
                  ${result.netPool.toFixed(2)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-green-500 text-sm">Available for distribution</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pool Split</CardDescription>
                <CardTitle className="text-lg">50% / 50%</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>Tenure: ${result.tenurePool.toFixed(2)}</p>
                <p>Performance: ${result.performancePool.toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Individual Payouts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Individual Payouts
              </CardTitle>
              <CardDescription>
                Breakdown by employee for {format(now, 'MMMM yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Tenure</TableHead>
                    <TableHead className="text-right">Tenure $</TableHead>
                    <TableHead className="text-right">Perf Score</TableHead>
                    <TableHead className="text-right">Perf $</TableHead>
                    <TableHead className="text-right">Mileage $</TableHead>
                    <TableHead className="text-right">Perfect Wks</TableHead>
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.payouts
                    .sort((a, b) => b.totalAmount - a.totalAmount)
                    .map((payout) => (
                      <TableRow key={payout.employeeId}>
                        <TableCell className="font-medium">{payout.employeeName}</TableCell>
                        <TableCell className="text-right">
                          {payout.tenureMonths} mo
                          <span className="text-gray-400 text-xs ml-1">
                            ({payout.tenureShares} shares)
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          ${payout.tenureAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {payout.performanceScore > 0 ? (
                            <Badge variant="secondary">{payout.performanceScore}</Badge>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          ${payout.performanceAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          ${payout.mileageAmount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          {payout.perfectWeekHours > 0 ? (
                            <Badge variant="default">{payout.perfectWeekHours}hr</Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-600">
                          ${payout.totalAmount.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  {/* Total Row */}
                  <TableRow className="bg-gray-50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">{result.totalTenureShares} shares</TableCell>
                    <TableCell className="text-right">${result.tenurePool.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{result.totalPerformanceScore}</TableCell>
                    <TableCell className="text-right">${result.performancePool.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-blue-600">
                      ${result.payouts.reduce((sum, p) => sum + p.mileageAmount, 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {result.payouts.reduce((sum, p) => sum + p.perfectWeekHours, 0)}hr
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      ${result.payouts.reduce((sum, p) => sum + p.totalAmount, 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* How It Works */}
          <Card>
            <CardHeader>
              <CardTitle>How the Bonus Pool Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-700">Tenure Pool (50%)</h4>
                  <p className="text-blue-600 mt-1">
                    Split based on months of service. 1 month = 1 share.
                    The more months you've worked, the larger your share.
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-700">Performance Pool (50%)</h4>
                  <p className="text-green-600 mt-1">
                    Split based on performance events: 5-star reviews,
                    customer call-outs, and crew recognition.
                  </p>
                </div>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  <h4 className="font-medium text-yellow-700">Damages</h4>
                </div>
                <p className="text-yellow-600 mt-1">
                  Damages are deducted from the pool before distribution.
                  Unreported damages cost 2x the actual amount.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
