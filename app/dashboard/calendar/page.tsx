'use client';

import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index),
  label: format(new Date(2024, index, 1), 'MMMM'),
}));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 41 }, (_, index) => currentYear - 20 + index);

export default function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const calendarDays = useMemo(() => {
    const firstDay = startOfWeek(startOfMonth(month));
    const lastDay = endOfWeek(endOfMonth(month));
    const days: Date[] = [];

    for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
      days.push(day);
    }

    return days;
  }, [month]);

  const goToToday = () => {
    const today = new Date();
    setMonth(startOfMonth(today));
    setSelectedDate(today);
  };

  const changeMonth = (monthIndex: string) => {
    setMonth((value) => new Date(value.getFullYear(), Number(monthIndex), 1));
  };

  const changeYear = (year: string) => {
    setMonth((value) => new Date(Number(year), value.getMonth(), 1));
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-2 py-4 sm:px-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className="text-sm text-muted-foreground">Plan your time and keep every important date in view.</p>
          </div>
        </div>
        <Button variant="outline" onClick={goToToday}>Today</Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="border-b bg-gradient-to-r from-primary/[0.06] via-background to-background sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl">{format(month, 'MMMM yyyy')}</CardTitle>
              <CardDescription>{format(startOfMonth(month), 'MMMM d')} – {format(endOfMonth(month), 'MMMM d, yyyy')}</CardDescription>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
              <Select value={String(month.getMonth())} onValueChange={changeMonth}>
                <SelectTrigger className="w-[132px] bg-background" aria-label="Choose month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(month.getFullYear())} onValueChange={changeYear}>
                <SelectTrigger className="w-[100px] bg-background" aria-label="Choose year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => setMonth((value) => subMonths(value, 1))} aria-label="Previous month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setMonth((value) => addMonths(value, 1))} aria-label="Next month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-7 border-b bg-muted/30">
                {weekdays.map((weekday) => (
                  <div key={weekday} className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {weekday}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarDays.map((day) => {
                  const selected = isSameDay(day, selectedDate);
                  const outsideMonth = !isSameMonth(day, month);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(day)}
                      className={`group relative min-h-[122px] border-b border-r p-2 text-left transition-colors hover:bg-primary/[0.04] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${outsideMonth ? 'bg-muted/15 text-muted-foreground' : 'bg-background'} ${selected ? 'bg-primary/[0.06]' : ''}`}
                    >
                      {selected && <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />}
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${isToday(day) ? 'bg-primary text-primary-foreground shadow-sm' : selected ? 'bg-primary/10 text-primary' : ''}`}>
                        {format(day, 'd')}
                      </span>
                      {isToday(day) && <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Today</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="overflow-hidden border-border/70 shadow-sm">
            <div className="h-1 bg-gradient-to-r from-primary via-violet-500 to-fuchsia-500" />
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardDescription>{format(selectedDate, 'EEEE')}</CardDescription>
                  <CardTitle className="mt-1 text-xl">{format(selectedDate, 'MMMM d, yyyy')}</CardTitle>
                </div>
                {isToday(selectedDate) && <Badge>Today</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
                  <Clock3 className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="font-medium">No events scheduled</p>
                <p className="mt-1 max-w-[220px] text-sm text-muted-foreground">This day is open and ready for whatever comes next.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/15 bg-gradient-to-br from-primary/[0.08] to-transparent shadow-sm">
            <CardContent className="flex gap-3 p-5">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">A clean start</p>
                <p className="mt-1 text-sm text-muted-foreground">Your calendar is ready. Event sources can be connected whenever you need them.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
