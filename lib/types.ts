export interface Project {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  created_at: string;
  user_id: string;
  key_prefix: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  subscription_status: 'free' | 'pro' | null;
}

export interface Column {
  id: string;
  name: string;
  position: number;
  tasks: Task[];
}

export interface Task {
  id: string;
  task_key: string;
  title: string;
  description: string | null;
  source_text: string | null;
  position: number;
  priority: 'low' | 'medium' | 'high';
  request_type: 'NDA' | 'Contract' | 'MSA' | 'Other';
  due_date: string | null;
  is_done: boolean;
  created_at: string;
  column_id: string;
  created_by: string | null;
  updated_by: string | null;
  assigned_to: string | null;
  profiles?: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  checklist_items?: TaskChecklistItem[];
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  content: string;
  is_done: boolean;
  position: number;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
  profiles?: {
    id: string;
    email: string;
    full_name: string | null;
  };
}

export interface SlackWorkspace {
  id: string;
  team_id: string;
  team_name: string | null;
  project_id: string;
  installed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectNote {
  id: string;
  project_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  profiles: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface ProjectMember {
  id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  profiles: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}