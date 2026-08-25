'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { ListChecks, Plus, X, Loader2 } from 'lucide-react';
import type { TaskChecklistItem } from '@/lib/types';

interface TaskChecklistProps {
  taskId: string;
}

export function TaskChecklist({ taskId }: TaskChecklistProps) {
  const [items, setItems] = useState<TaskChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemText, setNewItemText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadItems();
  }, [taskId]);

  const loadItems = async () => {
    try {
      const { data: items, error } = await supabase
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', taskId)
        .order('position');

      if (error) throw error;
      setItems(items || []);
    } catch (error: any) {
      console.error('Error loading checklist:', error);
      toast.error('Failed to load checklist');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newItemText.trim()) {
      toast.error('Please enter a checklist item');
      return;
    }

    setSubmitting(true);

    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .insert({
          task_id: taskId,
          content: newItemText.trim(),
          position: items.length,
        });

      if (error) throw error;

      setNewItemText('');
      await loadItems();
      toast.success('Checklist item added!');
    } catch (error: any) {
      console.error('Error adding checklist item:', error);
      toast.error('Failed to add checklist item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleItem = async (item: TaskChecklistItem) => {
    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .update({ is_done: !item.is_done })
        .eq('id', item.id);

      if (error) throw error;
      await loadItems();
    } catch (error: any) {
      console.error('Error updating checklist item:', error);
      toast.error('Failed to update checklist item');
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('task_checklist_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      await loadItems();
      toast.success('Checklist item deleted');
    } catch (error: any) {
      console.error('Error deleting checklist item:', error);
      toast.error('Failed to delete checklist item');
    }
  };

  const doneCount = items.filter((i) => i.is_done).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <ListChecks className="h-4 w-4" />
          Checklist {items.length > 0 && `(${doneCount}/${items.length})`}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 group">
              <Checkbox
                checked={item.is_done}
                onCheckedChange={() => handleToggleItem(item)}
              />
              <span className={`text-sm flex-1 ${item.is_done ? 'line-through text-muted-foreground' : ''}`}>
                {item.content}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                onClick={() => handleDeleteItem(item.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No checklist items yet.</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Add a checklist item..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddItem(e);
            }
          }}
          className="h-8 text-sm"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitting || !newItemText.trim()}
          onClick={handleAddItem}
        >
          {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}
