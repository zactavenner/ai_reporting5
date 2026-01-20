import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface DateRange {
  from: Date;
  to: Date;
}

interface DateFilterContextType {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  startDate: string;
  endDate: string;
}

const DateFilterContext = createContext<DateFilterContextType | undefined>(undefined);

export function DateFilterProvider({ children }: { children: ReactNode }) {
  // Default to last 30 days
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const [dateRange, setDateRange] = useState<DateRange>({
    from: thirtyDaysAgo,
    to: today,
  });

  // Format dates for SQL queries
  const startDate = useMemo(() => {
    return dateRange.from.toISOString().split('T')[0];
  }, [dateRange.from]);

  const endDate = useMemo(() => {
    return dateRange.to.toISOString().split('T')[0];
  }, [dateRange.to]);

  return (
    <DateFilterContext.Provider value={{ dateRange, setDateRange, startDate, endDate }}>
      {children}
    </DateFilterContext.Provider>
  );
}

export function useDateFilter() {
  const context = useContext(DateFilterContext);
  if (context === undefined) {
    throw new Error('useDateFilter must be used within a DateFilterProvider');
  }
  return context;
}
