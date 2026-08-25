'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/components/user-provider';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Sparkles, Check, X } from 'lucide-react';

interface PendingSuggestion {
  id: string;
  task_id: string;
  request_type: string;
  priority: string;
  suggested_assignee: string | null;
  rationale: string;
  created_at: string;
  tasks: {
    title: string;
    task_key: string;
    columns: {
      projects: { id: string; name: string; slug: string };
    };
  };
  profiles: { full_name: string | null; email: string } | null;
}

export default function AiPlannerPage() {
  const { user } = useUser();
  const [suggestions, setSuggestions] = useState<PendingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadSuggestions();
  }, [user]);

  const loadSuggestions = async () => {
    const { data, error } = await supabase
      .from('task_ai_suggestions')
      .select(`
        id, task_id, request_type, priority, suggested_assignee, rationale, created_at,
        tasks:task_id ( title, task_key, columns:column_id ( projects:project_id ( id, name, slug ) ) ),
        profiles:suggested_assignee ( full_name, email )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading AI suggestions:', error);
      toast.error('Failed to load suggestions');
    } else {
      setSuggestions((data as any) || []);
    }
    setLoading(false);
  };

  const accept = async (s: PendingSuggestion) => {
    try {
      const { error: taskError } = await supabase
        .from('tasks')
        .update({
          request_type: s.request_type,
          priority: s.priority,
          assigned_to: s.suggested_assignee,
        })
        .eq('id', s.task_id);
      if (taskError) throw taskError;

      await supabase.from('task_ai_suggestions').update({ status: 'accepted' }).eq('id', s.id);
      setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
      toast.success('Suggestion applied');
    } catch (error: any) {
      console.error('Error accepting suggestion:', error);
      toast.error('Failed to apply suggestion');
    }
  };

  const dismiss = async (s: PendingSuggestion) => {
    await supabase.from('task_ai_suggestions').update({ status: 'dismissed' }).eq('id', s.id);
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          AI Planner
        </h1>
        <p className="text-muted-foreground">
          AI suggestions awaiting review, across every project you have access to.
        </p>
      </div>

      {suggestions.length === 0 ? (
        <p className="text-muted-foreground">No pending suggestions. Generate one from a Request's "Get AI Suggestion" button.</p>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/dashboard/projects/${s.tasks.columns.projects.slug}?task=${s.tasks.task_key}`} className="hover:underline">
                    {s.tasks.task_key ? `${s.tasks.task_key} · ` : ''}{s.tasks.title}
                  </Link>
                </CardTitle>
                <CardDescription>{s.tasks.columns.projects.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{s.request_type}</Badge>
                  <Badge variant="secondary">{s.priority}</Badge>
                  {s.profiles && (
                    <span className="text-muted-foreground">
                      → {s.profiles.full_name || s.profiles.email}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{s.rationale}</p>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => accept(s)}>
                    <Check className="h-3 w-3 mr-1.5" />
                    Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => dismiss(s)}>
                    <X className="h-3 w-3 mr-1.5" />
                    Dismiss
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
