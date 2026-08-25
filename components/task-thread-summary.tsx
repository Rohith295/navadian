'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Sparkles, Loader2 } from 'lucide-react';

interface TaskThreadSummaryProps {
  taskId: string;
}

export function TaskThreadSummary({ taskId }: TaskThreadSummaryProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const summarize = async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) return;

      const res = await fetch(`/api/tasks/${taskId}/summarize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to summarize');
      const data = await res.json();
      setSummary(data.summary);
    } catch (error) {
      console.error('Error summarizing thread:', error);
      toast.error('Failed to summarize thread');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={summarize}>
        {loading ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1.5" />}
        Summarize
      </Button>
      {summary && (
        <div className="rounded-md border p-3 bg-muted/40">
          <p className="text-sm">{summary}</p>
        </div>
      )}
    </div>
  );
}
