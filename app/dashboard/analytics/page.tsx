'use client';

import React, { useState, useEffect } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { useUser } from '@/components/user-provider';
import { toast } from 'sonner';
import { FolderOpen, FileText, CircleDot, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type RequestType = 'NDA' | 'Contract' | 'MSA' | 'Other';
type Priority = 'low' | 'medium' | 'high';

const requestTypeConfig: ChartConfig = {
  count: { label: 'Requests' },
  NDA: { label: 'NDA', color: 'hsl(var(--chart-1))' },
  Contract: { label: 'Contract', color: 'hsl(var(--chart-2))' },
  MSA: { label: 'MSA', color: 'hsl(var(--chart-3))' },
  Other: { label: 'Other', color: 'hsl(var(--chart-4))' },
};

const priorityConfig: ChartConfig = {
  count: { label: 'Requests' },
  low: { label: 'Low', color: 'hsl(var(--chart-2))' },
  medium: { label: 'Medium', color: 'hsl(var(--chart-3))' },
  high: { label: 'High', color: 'hsl(var(--chart-1))' },
};

export default function AnalyticsPage() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [totalProjects, setTotalProjects] = useState(0);
  const [totalRequests, setTotalRequests] = useState(0);
  const [openRequests, setOpenRequests] = useState(0);
  const [completedRequests, setCompletedRequests] = useState(0);
  const [byType, setByType] = useState<{ type: string; count: number }[]>([]);
  const [byPriority, setByPriority] = useState<{ priority: string; count: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    loadAnalytics();
  }, [user]);

  const loadAnalytics = async () => {
    try {
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id');

      if (projectsError) throw projectsError;

      const projectIds = (projects || []).map((p) => p.id);
      setTotalProjects(projectIds.length);

      if (projectIds.length === 0) {
        setTotalRequests(0);
        setOpenRequests(0);
        setCompletedRequests(0);
        setByType([]);
        setByPriority([]);
        return;
      }

      const { data: columns, error: columnsError } = await supabase
        .from('columns')
        .select('id')
        .in('project_id', projectIds);

      if (columnsError) throw columnsError;

      const columnIds = (columns || []).map((c) => c.id);

      if (columnIds.length === 0) {
        setTotalRequests(0);
        setOpenRequests(0);
        setCompletedRequests(0);
        setByType([]);
        setByPriority([]);
        return;
      }

      const { data: tasks, error: tasksError } = await supabase
        .from('tasks')
        .select('request_type, priority, is_done')
        .in('column_id', columnIds);

      if (tasksError) throw tasksError;

      const allTasks = tasks || [];
      setTotalRequests(allTasks.length);
      setCompletedRequests(allTasks.filter((t) => t.is_done).length);
      setOpenRequests(allTasks.filter((t) => !t.is_done).length);

      const typeCounts: Record<RequestType, number> = { NDA: 0, Contract: 0, MSA: 0, Other: 0 };
      const priorityCounts: Record<Priority, number> = { low: 0, medium: 0, high: 0 };

      for (const task of allTasks) {
        const type = (task.request_type as RequestType) || 'Other';
        typeCounts[type] = (typeCounts[type] || 0) + 1;

        const priority = (task.priority as Priority) || 'medium';
        priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
      }

      setByType(
        (Object.keys(typeCounts) as RequestType[]).map((type) => ({ type, count: typeCounts[type] }))
      );
      setByPriority(
        (Object.keys(priorityCounts) as Priority[]).map((priority) => ({ priority, count: priorityCounts[priority] }))
      );
    } catch (error: any) {
      console.error('Error loading analytics:', error);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-muted-foreground">
          Request activity across every project you own or are a member of
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProjects}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRequests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Open Requests</CardTitle>
            <CircleDot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openRequests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Completed Requests</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedRequests}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Requests by Type</CardTitle>
            <CardDescription>NDA, Contract, MSA, and Other requests across all projects</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={requestTypeConfig}>
              <BarChart accessibilityLayer data={byType}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="type" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={4} fill="hsl(var(--chart-1))" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests by Priority</CardTitle>
            <CardDescription>Low, medium, and high priority requests across all projects</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={priorityConfig}>
              <BarChart accessibilityLayer data={byPriority}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="priority" tickLine={false} axisLine={false} tickMargin={8} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" radius={4} fill="hsl(var(--chart-2))" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
