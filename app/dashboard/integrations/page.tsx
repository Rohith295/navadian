'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Slack, Check, Mail } from 'lucide-react';
import { useUser } from '@/components/user-provider';
import { supabase } from '@/lib/supabase';

interface OwnedProject {
  id: string;
  name: string;
}

interface SlackStatus {
  connected: boolean;
  teamName: string | null;
  passiveMonitoring: boolean;
  dmEnabled: boolean;
}

interface EmailStatus {
  connected: boolean;
  inboundAddress: string | null;
}

export default function IntegrationsPage() {
  const { user } = useUser();
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<OwnedProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [emailSelectedProjectId, setEmailSelectedProjectId] = useState<string>('');
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadProjects();

    if (searchParams.get('slack_connected')) {
      toast.success('Slack connected');
    }
    const slackError = searchParams.get('slack_error');
    if (slackError) {
      toast.error(`Slack connection failed (${slackError})`);
    }
  }, [user]);

  useEffect(() => {
    if (selectedProjectId) loadStatus(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (emailSelectedProjectId) loadEmailStatus(emailSelectedProjectId);
  }, [emailSelectedProjectId]);

  const loadProjects = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('projects')
      .select('id, name, user_id, project_members!inner(role)')
      .order('created_at', { ascending: false });

    const owned = (data || []).filter(
      (p: any) =>
        p.user_id === user.id ||
        p.project_members?.some((m: any) => ['owner', 'admin'].includes(m.role))
    );

    setProjects(owned);
    if (owned.length > 0) {
      setSelectedProjectId(owned[0].id);
      setEmailSelectedProjectId(owned[0].id);
    }
    setLoading(false);
  };

  const loadStatus = async (projectId: string) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return;

    const res = await fetch(`/api/slack/status?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setStatus(await res.json());
  };

  const loadEmailStatus = async (projectId: string) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token) return;

    const res = await fetch(`/api/email/settings?project_id=${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setEmailStatus(await res.json());
  };

  const connect = async () => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token || !selectedProjectId) return;

    window.location.href = `/api/slack/install?project_id=${selectedProjectId}&access_token=${token}`;
  };

  const disconnect = async () => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token || !selectedProjectId) return;

    const res = await fetch(`/api/slack/status?project_id=${selectedProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      toast.success('Slack disconnected');
      loadStatus(selectedProjectId);
    } else {
      toast.error('Failed to disconnect Slack');
    }
  };

  const toggleSlackSetting = async (field: 'passive_monitoring' | 'dm_enabled', value: boolean) => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token || !selectedProjectId) return;

    const res = await fetch(`/api/slack/status?project_id=${selectedProjectId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });

    if (res.ok) {
      loadStatus(selectedProjectId);
    } else {
      toast.error('Failed to update setting');
    }
  };

  const connectEmail = async () => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token || !emailSelectedProjectId) return;

    const res = await fetch(`/api/email/settings?project_id=${emailSelectedProjectId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      toast.success('Email intake connected');
      loadEmailStatus(emailSelectedProjectId);
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to connect email intake');
    }
  };

  const disconnectEmail = async () => {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (!token || !emailSelectedProjectId) return;

    const res = await fetch(`/api/email/settings?project_id=${emailSelectedProjectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      toast.success('Email intake disconnected');
      loadEmailStatus(emailSelectedProjectId);
    } else {
      toast.error('Failed to disconnect email intake');
    }
  };

  if (loading) return null;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <p className="text-muted-foreground">Connect navadian to the tools your team already uses.</p>
      </div>

      {projects.length === 0 ? (
        <p className="text-muted-foreground">You need to own or admin a project to connect an integration.</p>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Slack className="h-6 w-6" />
              <div>
                <CardTitle>Slack</CardTitle>
                <CardDescription>
                  Tag the bot in a Slack channel to automatically create a Request.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Requests will be created in</label>
              <select
                className="w-full border rounded-md px-3 py-2 bg-background"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {status?.connected ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="gap-1">
                    <Check className="h-3 w-3" />
                    Connected{status.teamName ? ` to ${status.teamName}` : ''}
                  </Badge>
                  <Button variant="outline" onClick={disconnect}>
                    Disconnect
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="passive-monitoring">Watch all channel messages</Label>
                    <p className="text-xs text-muted-foreground">
                      Create Requests from messages that don't mention the bot, when they look like a real request.
                    </p>
                  </div>
                  <Switch
                    id="passive-monitoring"
                    checked={status.passiveMonitoring}
                    onCheckedChange={(checked) => toggleSlackSetting('passive_monitoring', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="dm-enabled">Respond to DMs</Label>
                    <p className="text-xs text-muted-foreground">
                      Create a Request from any direct message sent to the bot.
                    </p>
                  </div>
                  <Switch
                    id="dm-enabled"
                    checked={status.dmEnabled}
                    onCheckedChange={(checked) => toggleSlackSetting('dm_enabled', checked)}
                  />
                </div>
              </div>
            ) : (
              <Button onClick={connect} disabled={!selectedProjectId}>
                Add to Slack
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {projects.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Mail className="h-6 w-6" />
              <div>
                <CardTitle>Email</CardTitle>
                <CardDescription>
                  Forward or CC an email to automatically create a Request.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Requests will be created in</label>
              <select
                className="w-full border rounded-md px-3 py-2 bg-background"
                value={emailSelectedProjectId}
                onChange={(e) => setEmailSelectedProjectId(e.target.value)}
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {emailStatus?.connected ? (
              <div className="space-y-2">
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" />
                  Connected
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Forward requests to <span className="font-mono">{emailStatus.inboundAddress}</span>
                </p>
                <Button variant="outline" onClick={disconnectEmail}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={connectEmail} disabled={!emailSelectedProjectId}>
                Enable Email Intake
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
