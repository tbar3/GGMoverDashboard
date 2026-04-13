'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Locale = 'en' | 'es';

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Sidebar
    'nav.my_dashboard': 'My Dashboard',
    'nav.dashboard': 'Dashboard',
    'nav.my_jobs': 'My Jobs',
    'nav.my_checklists': 'My Checklists',
    'nav.my_payroll': 'My Payroll',
    'nav.my_stats': 'My Stats',
    'nav.crew': 'Crew',

    // Dashboard
    'dash.welcome': 'Welcome back, {name}!',
    'dash.summary_for': "Here's your performance summary for {period}",
    'dash.tenure': 'Tenure',
    'dash.months_shares': '{count} months (= {count} shares)',
    'dash.month_share': '1 month (= 1 share)',
    'dash.perfect_weeks': 'Perfect Weeks',
    'dash.bonus_hours': '{count} bonus hours earned',
    'dash.bonus_hour': '1 bonus hour earned',
    'dash.tardies': 'Tardies This Month',
    'dash.days_worked': '{count} days worked',
    'dash.mileage_earnings': 'Mileage Earnings',
    'dash.miles_at': '{miles} miles @ ${rate}/mi',
    'dash.upcoming_jobs': 'Upcoming Jobs',
    'dash.next_moves': 'Your next assigned moves',
    'dash.view_all': 'View All',
    'dash.today': 'Today',
    'dash.recognition': 'Recent Recognition',
    'dash.recognition_desc': '5-star reviews, customer call-outs, and crew recognition',
    'dash.five_star': '5-Star',
    'dash.customer': 'Customer',
    'dash.crew': 'Crew',
    'dash.great_work': 'Great work!',
    'dash.no_recognition': 'No recognition events this month yet. Keep up the great work!',
    'dash.at_a_glance': 'This Month at a Glance',
    'dash.your_metrics': 'Your performance metrics',
    'dash.role': 'Role',
    'dash.checklists_completed': 'Checklists Completed',
    'dash.attendance_rate': 'Attendance Rate',
    'dash.performance_events': 'Performance Events',
    'dash.start_date': 'Start Date',
    'dash.profile_not_found': 'Employee profile not found. Please contact your administrator.',

    // My Jobs
    'jobs.title': 'My Jobs',
    'jobs.subtitle': 'Your assigned moves and job details',
    'jobs.today_upcoming': 'Today & Upcoming ({count})',
    'jobs.no_upcoming': 'No upcoming jobs assigned to you.',
    'jobs.recent_past': 'Recent Past Jobs',
    'jobs.arrival': 'Arrival: {window}',
    'jobs.truck': 'Truck: {name}',
    'jobs.est_hours': 'Est: {hours} hrs',
    'jobs.crew_count': 'Crew ({count})',
    'jobs.crew_notes': 'Crew Notes',
    'jobs.customer_notes': 'Customer Notes',

    // My Payroll
    'pay.title': 'My Payroll',
    'pay.subtitle': 'Your weekly pay breakdown and history',
    'pay.this_week': "This Week's Expected",
    'pay.jobs_count': '{count} jobs',
    'pay.job_count': '1 job',
    'pay.expected_hours': 'Expected Hours',
    'pay.expected_pay': 'Expected Pay',
    'pay.hourly_rate': 'Hourly Rate',
    'pay.per_hour': 'per hour',
    'pay.last_period': 'Last Pay Period',
    'pay.total_hours_recent': 'Total Hours (Recent)',
    'pay.across_periods': 'across {count} pay periods',
    'pay.latest_period': 'Latest Pay Period',
    'pay.paid': 'Paid {date}',
    'pay.travel_hours': 'Travel Hours',
    'pay.job_hours': 'Job Hours',
    'pay.warehouse_hours': 'Warehouse Hours',
    'pay.total_hours': 'Total Hours',
    'pay.gross_pay': 'Gross Pay',
    'pay.lunch_reimb': 'Lunch Reimbursement',
    'pay.mileage_reimb': 'Mileage Reimbursement',
    'pay.other_reimb': 'Other Reimbursement',
    'pay.tips': 'Tips',
    'pay.total': 'Total',
    'pay.history': 'Pay History',
    'pay.last_periods': 'Last {count} pay periods',
    'pay.week': 'Week',
    'pay.pay_date': 'Pay Date',
    'pay.travel': 'Travel',
    'pay.job': 'Job',
    'pay.wh': 'WH',
    'pay.gross': 'Gross',
    'pay.reimb': 'Reimb',
    'pay.no_records': 'No payroll records yet.',

    // Checklists
    'check.title': 'My Checklists',
    'check.today_checklists': "Today's job checklists",
    'check.your_role': 'Your Role: {role}',
    'check.items_to_complete': '{count} items to complete per job',
    'check.complete': 'Complete',
    'check.reference': 'Checklist Reference',
    'check.role_items': 'Your role-specific checklist items ({role})',
    'check.no_jobs': 'No jobs assigned to you for today.',
    'check.jobs_appear': "Jobs will appear here once you're assigned to a move.",
    'check.loading': 'Loading...',

    // Stats
    'stats.title': 'My Stats',
    'stats.subtitle': 'Your performance metrics and history',
    'stats.tenure': 'Tenure',
    'stats.on_time_rate': 'On-Time Rate',
    'stats.days_this_month': '{ontime}/{total} days this month',
    'stats.perfect_weeks': 'Perfect Weeks',
    'stats.this_month_total': 'this month ({total} total)',
    'stats.perf_score': 'Performance Score',
    'stats.events_this_month': 'recognition events this month',
    'stats.recent_attendance': 'Recent Attendance',
    'stats.last_work_days': 'Your last 10 work days',
    'stats.date': 'Date',
    'stats.arrival': 'Arrival',
    'stats.status': 'Status',
    'stats.uniform': 'Uniform',
    'stats.tardy': 'Tardy',
    'stats.on_time': 'On Time',
    'stats.yes': 'Yes',
    'stats.no': 'No',
    'stats.no_attendance': 'No attendance records found',
    'stats.recognition_history': 'Recognition History',
    'stats.your_events': 'Your performance events',
    'stats.mileage_month': 'Mileage This Month',
    'stats.mileage_desc': 'Personal vehicle compensation',
    'stats.profile_summary': 'Profile Summary',
    'stats.employment_details': 'Your employment details',
    'stats.tenure_shares': 'Tenure Shares',
    'stats.this_month': 'this month',
    'stats.uniform_violations': 'Uniform Violations',

    // Common
    'common.language': 'Language',
    'common.english': 'English',
    'common.spanish': 'Español',
  },

  es: {
    // Sidebar
    'nav.my_dashboard': 'Mi Panel',
    'nav.dashboard': 'Panel',
    'nav.my_jobs': 'Mis Trabajos',
    'nav.my_checklists': 'Mis Listas',
    'nav.my_payroll': 'Mi Nómina',
    'nav.my_stats': 'Mis Estadísticas',
    'nav.crew': 'Equipo',

    // Dashboard
    'dash.welcome': '¡Bienvenido, {name}!',
    'dash.summary_for': 'Tu resumen de desempeño para {period}',
    'dash.tenure': 'Antigüedad',
    'dash.months_shares': '{count} meses (= {count} acciones)',
    'dash.month_share': '1 mes (= 1 acción)',
    'dash.perfect_weeks': 'Semanas Perfectas',
    'dash.bonus_hours': '{count} horas de bono ganadas',
    'dash.bonus_hour': '1 hora de bono ganada',
    'dash.tardies': 'Tardanzas Este Mes',
    'dash.days_worked': '{count} días trabajados',
    'dash.mileage_earnings': 'Ganancias por Millaje',
    'dash.miles_at': '{miles} millas @ ${rate}/mi',
    'dash.upcoming_jobs': 'Próximos Trabajos',
    'dash.next_moves': 'Tus próximas mudanzas asignadas',
    'dash.view_all': 'Ver Todos',
    'dash.today': 'Hoy',
    'dash.recognition': 'Reconocimiento Reciente',
    'dash.recognition_desc': 'Reseñas de 5 estrellas, menciones de clientes y del equipo',
    'dash.five_star': '5 Estrellas',
    'dash.customer': 'Cliente',
    'dash.crew': 'Equipo',
    'dash.great_work': '¡Buen trabajo!',
    'dash.no_recognition': 'Ningún evento de reconocimiento este mes. ¡Sigue con el buen trabajo!',
    'dash.at_a_glance': 'Resumen del Mes',
    'dash.your_metrics': 'Tus métricas de desempeño',
    'dash.role': 'Rol',
    'dash.checklists_completed': 'Listas Completadas',
    'dash.attendance_rate': 'Tasa de Asistencia',
    'dash.performance_events': 'Eventos de Desempeño',
    'dash.start_date': 'Fecha de Inicio',
    'dash.profile_not_found': 'Perfil de empleado no encontrado. Por favor contacta a tu administrador.',

    // My Jobs
    'jobs.title': 'Mis Trabajos',
    'jobs.subtitle': 'Tus mudanzas asignadas y detalles',
    'jobs.today_upcoming': 'Hoy y Próximos ({count})',
    'jobs.no_upcoming': 'No tienes trabajos próximos asignados.',
    'jobs.recent_past': 'Trabajos Recientes',
    'jobs.arrival': 'Llegada: {window}',
    'jobs.truck': 'Camión: {name}',
    'jobs.est_hours': 'Est: {hours} hrs',
    'jobs.crew_count': 'Equipo ({count})',
    'jobs.crew_notes': 'Notas del Equipo',
    'jobs.customer_notes': 'Notas del Cliente',

    // My Payroll
    'pay.title': 'Mi Nómina',
    'pay.subtitle': 'Tu desglose de pago semanal e historial',
    'pay.this_week': 'Esperado Esta Semana',
    'pay.jobs_count': '{count} trabajos',
    'pay.job_count': '1 trabajo',
    'pay.expected_hours': 'Horas Esperadas',
    'pay.expected_pay': 'Pago Esperado',
    'pay.hourly_rate': 'Tarifa por Hora',
    'pay.per_hour': 'por hora',
    'pay.last_period': 'Último Período de Pago',
    'pay.total_hours_recent': 'Horas Totales (Recientes)',
    'pay.across_periods': 'en {count} períodos de pago',
    'pay.latest_period': 'Último Período de Pago',
    'pay.paid': 'Pagado {date}',
    'pay.travel_hours': 'Horas de Viaje',
    'pay.job_hours': 'Horas de Trabajo',
    'pay.warehouse_hours': 'Horas de Almacén',
    'pay.total_hours': 'Horas Totales',
    'pay.gross_pay': 'Pago Bruto',
    'pay.lunch_reimb': 'Reembolso de Almuerzo',
    'pay.mileage_reimb': 'Reembolso de Millaje',
    'pay.other_reimb': 'Otro Reembolso',
    'pay.tips': 'Propinas',
    'pay.total': 'Total',
    'pay.history': 'Historial de Pagos',
    'pay.last_periods': 'Últimos {count} períodos de pago',
    'pay.week': 'Semana',
    'pay.pay_date': 'Fecha de Pago',
    'pay.travel': 'Viaje',
    'pay.job': 'Trabajo',
    'pay.wh': 'Almacén',
    'pay.gross': 'Bruto',
    'pay.reimb': 'Reemb',
    'pay.no_records': 'No hay registros de nómina aún.',

    // Checklists
    'check.title': 'Mis Listas',
    'check.today_checklists': 'Listas de trabajo de hoy',
    'check.your_role': 'Tu Rol: {role}',
    'check.items_to_complete': '{count} elementos para completar por trabajo',
    'check.complete': 'Completo',
    'check.reference': 'Referencia de Lista',
    'check.role_items': 'Elementos de tu lista por rol ({role})',
    'check.no_jobs': 'No tienes trabajos asignados para hoy.',
    'check.jobs_appear': 'Los trabajos aparecerán aquí cuando te asignen a una mudanza.',
    'check.loading': 'Cargando...',

    // Stats
    'stats.title': 'Mis Estadísticas',
    'stats.subtitle': 'Tus métricas de desempeño e historial',
    'stats.tenure': 'Antigüedad',
    'stats.on_time_rate': 'Tasa de Puntualidad',
    'stats.days_this_month': '{ontime}/{total} días este mes',
    'stats.perfect_weeks': 'Semanas Perfectas',
    'stats.this_month_total': 'este mes ({total} total)',
    'stats.perf_score': 'Puntuación de Desempeño',
    'stats.events_this_month': 'eventos de reconocimiento este mes',
    'stats.recent_attendance': 'Asistencia Reciente',
    'stats.last_work_days': 'Tus últimos 10 días de trabajo',
    'stats.date': 'Fecha',
    'stats.arrival': 'Llegada',
    'stats.status': 'Estado',
    'stats.uniform': 'Uniforme',
    'stats.tardy': 'Tardanza',
    'stats.on_time': 'A Tiempo',
    'stats.yes': 'Sí',
    'stats.no': 'No',
    'stats.no_attendance': 'No se encontraron registros de asistencia',
    'stats.recognition_history': 'Historial de Reconocimiento',
    'stats.your_events': 'Tus eventos de desempeño',
    'stats.mileage_month': 'Millaje Este Mes',
    'stats.mileage_desc': 'Compensación por vehículo personal',
    'stats.profile_summary': 'Resumen del Perfil',
    'stats.employment_details': 'Tus detalles de empleo',
    'stats.tenure_shares': 'Acciones por Antigüedad',
    'stats.this_month': 'este mes',
    'stats.uniform_violations': 'Violaciones de Uniforme',

    // Common
    'common.language': 'Idioma',
    'common.english': 'English',
    'common.spanish': 'Español',
  },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale | null;
    if (saved && (saved === 'en' || saved === 'es')) {
      setLocaleState(saved);
    }
  }, []);

  function setLocale(newLocale: Locale) {
    setLocaleState(newLocale);
    localStorage.setItem('locale', newLocale);
  }

  function t(key: string, vars?: Record<string, string | number>): string {
    let text = translations[locale]?.[key] || translations.en[key] || key;
    if (vars) {
      for (const [varName, varValue] of Object.entries(vars)) {
        text = text.replace(new RegExp(`\\{${varName}\\}`, 'g'), String(varValue));
      }
    }
    return text;
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
