'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useUser } from '@/components/user-provider';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Sparkles, Send, Check, X, Plus, MessageSquare } from 'lucide-react';

interface ChatSession {
  id: string;
  title: string | null;
  updated_at: string;
}

export default function AssistantPage() {
  const { user } = useUser();
  const [token, setToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token || null));
    loadSessions();
  }, [user]);

  const loadSessions = async () => {
    const { data } = await supabase
      .from('chat_sessions')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false });
    setSessions(data || []);
  };

  const openSession = async (sessionId: string) => {
    setLoadingSession(true);
    setActiveSessionId(sessionId);
    const { data } = await supabase
      .from('chat_messages')
      .select('id, role, parts')
      .eq('session_id', sessionId)
      .order('created_at');

    setInitialMessages((data || []).map((m) => ({ id: m.id, role: m.role, parts: m.parts })) as UIMessage[]);
    setLoadingSession(false);
  };

  const newChat = () => {
    setActiveSessionId(null);
    setInitialMessages([]);
  };

  if (!token) return null;

  return (
    <div className="flex h-[calc(100vh-2rem)]">
      <div className="w-56 border-r pr-3 mr-3 flex flex-col">
        <Button size="sm" variant="outline" className="mb-3" onClick={newChat}>
          <Plus className="h-3 w-3 mr-1.5" />
          New Chat
        </Button>
        <div className="flex-1 overflow-y-auto space-y-1">
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => openSession(s.id)}
              className={`w-full text-left text-sm px-2 py-1.5 rounded flex items-center gap-1.5 truncate ${
                activeSessionId === s.id ? 'bg-muted font-medium' : 'hover:bg-muted/50 text-muted-foreground'
              }`}
            >
              <MessageSquare className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{s.title || 'New chat'}</span>
            </button>
          ))}
        </div>
      </div>

      {loadingSession ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        </div>
      ) : (
        <ChatPanel
          key={activeSessionId || 'new'}
          token={token}
          userId={user!.id}
          sessionId={activeSessionId}
          initialMessages={initialMessages}
          onSessionCreated={(id) => {
            setActiveSessionId(id);
            loadSessions();
          }}
          onTurnFinished={loadSessions}
        />
      )}
    </div>
  );
}

function ChatPanel({
  token,
  userId,
  sessionId,
  initialMessages,
  onSessionCreated,
  onTurnFinished,
}: {
  token: string;
  userId: string;
  sessionId: string | null;
  initialMessages: UIMessage[];
  onSessionCreated: (id: string) => void;
  onTurnFinished: () => void;
}) {
  const [input, setInput] = useState('');
  const [resolvedProposals, setResolvedProposals] = useState<Record<string, 'confirmed' | 'cancelled'>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(sessionId);

  const { messages, sendMessage, status } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: '/api/ai/chat', headers: { Authorization: `Bearer ${token}` } }),
    onFinish: async ({ message }) => {
      if (!sessionIdRef.current) return;
      await supabase.from('chat_messages').insert({
        session_id: sessionIdRef.current,
        role: 'assistant',
        parts: message.parts,
      });
      await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionIdRef.current);
      onTurnFinished();
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');

    let currentSessionId = sessionIdRef.current;
    if (!currentSessionId) {
      const { data, error } = await supabase
        .from('chat_sessions')
        .insert({ user_id: userId, title: text.slice(0, 60) })
        .select('id')
        .single();
      if (error || !data) {
        toast.error('Failed to start chat');
        return;
      }
      currentSessionId = data.id;
      sessionIdRef.current = data.id;
      onSessionCreated(data.id);
    }

    await supabase.from('chat_messages').insert({
      session_id: currentSessionId,
      role: 'user',
      parts: [{ type: 'text', text }],
    });

    sendMessage({ text });
  };

  const confirmProposal = async (toolCallId: string, proposal: any) => {
    try {
      if (proposal.action === 'create_request') {
        const { data: column } = await supabase
          .from('columns')
          .select('id')
          .eq('project_id', proposal.project_id)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (!column) throw new Error('Project has no columns');

        const { error } = await supabase.from('tasks').insert({
          title: proposal.title,
          description: proposal.description,
          column_id: column.id,
          request_type: proposal.request_type,
          priority: proposal.priority,
          created_by: userId,
        });
        if (error) throw error;
        toast.success('Request created');
      } else if (proposal.action === 'reassign_request') {
        const { error } = await supabase.from('tasks').update({ assigned_to: proposal.assignee_id }).eq('id', proposal.task_id);
        if (error) throw error;
        toast.success('Request reassigned');
      } else if (proposal.action === 'update_status') {
        const { error } = await supabase.from('tasks').update({ column_id: proposal.column_id }).eq('id', proposal.task_id);
        if (error) throw error;
        toast.success('Request moved');
      }
      setResolvedProposals((prev) => ({ ...prev, [toolCallId]: 'confirmed' }));
    } catch (error: any) {
      console.error('Error confirming proposal:', error);
      toast.error('Failed to apply — you may not have permission');
    }
  };

  const cancelProposal = (toolCallId: string) => {
    setResolvedProposals((prev) => ({ ...prev, [toolCallId]: 'cancelled' }));
  };

  return (
    <div className="flex flex-col flex-1 max-w-3xl">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6" />
          Assistant
        </h1>
        <p className="text-muted-foreground">Ask about your Requests, or ask it to draft one for you.</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((message) => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
            <div className={message.role === 'user' ? 'max-w-[80%] rounded-lg bg-primary text-primary-foreground px-3 py-2' : 'max-w-[90%] space-y-2'}>
              {message.parts.map((part: any, i: number) => {
                if (part.type === 'text') {
                  return <p key={i} className="text-sm whitespace-pre-wrap">{part.text}</p>;
                }

                if (part.type === 'tool-listRequests' || part.type === 'tool-searchRequests') {
                  if (part.state !== 'output-available') return null;
                  const requests = part.output?.requests || [];
                  return (
                    <Card key={i}>
                      <CardContent className="p-3 space-y-2">
                        {requests.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No matching requests.</p>
                        ) : (
                          requests.map((r: any) => (
                            <Link
                              key={r.id}
                              href={`/dashboard/projects/${r.columns?.projects?.slug}?task=${r.task_key || r.id}`}
                              className="block text-sm hover:underline"
                            >
                              {r.task_key ? `${r.task_key} · ` : ''}{r.title} <span className="text-muted-foreground">— {r.columns?.projects?.name}</span>{' '}
                              <Badge variant="secondary" className="ml-1 text-xs">{r.request_type}</Badge>
                            </Link>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  );
                }

                if (part.type === 'tool-getProjectSummary') {
                  if (part.state !== 'output-available') return null;
                  const s = part.output;
                  return (
                    <Card key={i}>
                      <CardContent className="p-3 text-sm">
                        <p>Total: {s.total} · Done: {s.done}</p>
                        <p className="text-muted-foreground">By type: {Object.entries(s.by_type || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
                        <p className="text-muted-foreground">By priority: {Object.entries(s.by_priority || {}).map(([k, v]) => `${k}: ${v}`).join(', ')}</p>
                      </CardContent>
                    </Card>
                  );
                }

                if (
                  part.type === 'tool-proposeCreateRequest' ||
                  part.type === 'tool-proposeReassignRequest' ||
                  part.type === 'tool-proposeUpdateStatus'
                ) {
                  if (part.state !== 'output-available') return null;
                  const proposal = part.output;
                  const resolved = resolvedProposals[part.toolCallId];
                  return (
                    <Card key={i} className="border-primary/40 bg-muted/40">
                      <CardContent className="p-3 space-y-2">
                        <p className="text-sm font-medium">Proposed action</p>
                        <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{JSON.stringify(proposal, null, 2)}</pre>
                        {resolved === 'confirmed' ? (
                          <p className="text-xs text-green-600">Applied</p>
                        ) : resolved === 'cancelled' ? (
                          <p className="text-xs text-muted-foreground">Cancelled</p>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => confirmProposal(part.toolCallId, proposal)}>
                              <Check className="h-3 w-3 mr-1.5" />
                              Confirm
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => cancelProposal(part.toolCallId)}>
                              <X className="h-3 w-3 mr-1.5" />
                              Cancel
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                }

                return null;
              })}
            </div>
          </div>
        ))}
        {status === 'submitted' && (
          <p className="text-sm text-muted-foreground animate-pulse">Thinking…</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2 pt-2 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your requests..."
          disabled={status === 'streaming'}
        />
        <Button type="submit" disabled={!input.trim() || status === 'streaming'}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
