'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';

interface Suggestion {
  id: string;
  request_type: string;
  priority: string;
  suggested_assignee: string | null;
  rationale: string;
}

interface TaskAiSuggestionProps {
  taskId: string;
  projectMembers: { user_id: string; profiles: { full_name: string | null; email: string } }[];
  onApply: (fields: { request_type: string; priority: string; suggested_assignee: string | null }) => void;
}

export function TaskAiSuggestion({ taskId, projectMembers, onApply }: TaskAiSuggestionProps) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);

  const getSuggestion = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/tasks/${taskId}/suggest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to get suggestion');
      setSuggestion(await res.json());
    } catch (error) {
      console.error('Error getting AI suggestion:', error);
      toast.error('Failed to get AI suggestion');
    } finally {
      setLoading(false);
    }
  };

  const accept = async () => {
    if (!suggestion) return;
    onApply({
      request_type: suggestion.request_type,
      priority: suggestion.priority,
      suggested_assignee: suggestion.suggested_assignee,
    });
    await supabase.from('task_ai_suggestions').update({ status: 'accepted' }).eq('id', suggestion.id);
    setSuggestion(null);
    toast.success('Suggestion applied — review and save');
  };

  const dismiss = async () => {
    if (!suggestion) return;
    await supabase.from('task_ai_suggestions').update({ status: 'dismissed' }).eq('id', suggestion.id);
    setSuggestion(null);
  };

  const assigneeName = suggestion
    ? projectMembers.find((m) => m.user_id === suggestion.suggested_assignee)?.profiles?.full_name ||
      projectMembers.find((m) => m.user_id === suggestion.suggested_assignee)?.profiles?.email
    : null;

  if (!suggestion) {
    return (
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={getSuggestion}>
        {loading ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1.5" />}
        Get AI Suggestion
      </Button>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-2 bg-muted/40">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-4 w-4" />
        AI Suggestion
      </div>
      <p className="text-sm">
        Type: <strong>{suggestion.request_type}</strong> · Priority: <strong>{suggestion.priority}</strong>
        {assigneeName && (
          <>
            {' '}· Assignee: <strong>{assigneeName}</strong>
          </>
        )}
      </p>
      <p className="text-xs text-muted-foreground">{suggestion.rationale}</p>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={accept}>
          <Check className="h-3 w-3 mr-1.5" />
          Accept
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={dismiss}>
          <X className="h-3 w-3 mr-1.5" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}
