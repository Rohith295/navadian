'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Paperclip, Upload, X, Loader2, FileText } from 'lucide-react';
import type { TaskAttachment } from '@/lib/types';

interface TaskAttachmentsProps {
  taskId: string;
  currentUserId: string;
}

const BUCKET = 'task-attachments';
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB, matches the bucket's server-side limit

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId, currentUserId }: TaskAttachmentsProps) {
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAttachments();
  }, [taskId]);

  const loadAttachments = async () => {
    try {
      const { data, error } = await supabase
        .from('task_attachments')
        .select('*, profiles:uploaded_by(id, email, full_name)')
        .eq('task_id', taskId)
        .order('created_at');

      if (error) throw error;
      setAttachments(data || []);
    } catch (error: any) {
      console.error('Error loading attachments:', error);
      toast.error('Failed to load attachments');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('File is too large (25MB max)');
      return;
    }

    setUploading(true);
    try {
      const path = `${taskId}/${crypto.randomUUID()}-${file.name}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from('task_attachments').insert({
        task_id: taskId,
        uploaded_by: currentUserId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || null,
      });
      if (insertError) throw insertError;

      await loadAttachments();
      toast.success('Attachment uploaded');
    } catch (error: any) {
      console.error('Error uploading attachment:', error);
      toast.error('Failed to upload attachment');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (attachment: TaskAttachment) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.file_path, 60);

    if (error || !data) {
      toast.error('Failed to open attachment');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (attachment: TaskAttachment) => {
    try {
      await supabase.storage.from(BUCKET).remove([attachment.file_path]);
      const { error } = await supabase.from('task_attachments').delete().eq('id', attachment.id);
      if (error) throw error;

      await loadAttachments();
      toast.success('Attachment deleted');
    } catch (error: any) {
      console.error('Error deleting attachment:', error);
      toast.error('Failed to delete attachment');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <Paperclip className="h-4 w-4" />
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        </Button>
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="flex items-center gap-2 group">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <button
                type="button"
                onClick={() => handleDownload(attachment)}
                className="text-sm flex-1 text-left hover:underline truncate"
              >
                {attachment.file_name}
              </button>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatFileSize(attachment.file_size)}
              </span>
              {attachment.uploaded_by === currentUserId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 flex-shrink-0"
                  onClick={() => handleDelete(attachment)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}

          {attachments.length === 0 && (
            <p className="text-sm text-muted-foreground">No attachments yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
