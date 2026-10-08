export type Role = 'user' | 'assistant' | 'tool';
export type TabName = 'dashboard' | 'chat' | 'academic' | 'notes' | 'tasks' | 'calendar' | 'study' | 'studentTools' | 'devTools' | 'exams' | 'performance' | 'files' | 'settings';

export interface ClassMeeting {
  weekday: number;
  startTime: string;
  endTime: string;
  room: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  instructor: string;
  creditHours: number;
  color: string;
  meetings: ClassMeeting[];
}

export interface AcademicExam {
  id: string;
  subjectId: string;
  title: string;
  type: 'quiz' | 'midterm' | 'final';
  date: string;
  syllabus: string;
  grade?: number;
  createdAt: string;
}

export interface AcademicGrade {
  id: string;
  subjectId: string;
  title: string;
  score: number;
  outOf: number;
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  subjectId: string;
  date: string;
  status: 'present' | 'absent' | 'excused';
}

export interface StudySession {
  id: string;
  subjectId: string;
  durationMinutes: number;
  startedAt: string;
}

export interface CodeSnippet {
  id: string;
  title: string;
  language: string;
  code: string;
  updatedAt: string;
}

export interface VaultItem {
  id: string;
  name: string;
  kind: 'file' | 'folder';
  location: string;
  addedAt: string;
  favorite: boolean;
  tags?: string[];
}

export type AcademicCollection = 'subjects' | 'exams' | 'grades' | 'attendance' | 'studySessions' | 'snippets' | 'vaultItems';
export type AcademicRecord = Subject | AcademicExam | AcademicGrade | AttendanceRecord | StudySession | CodeSnippet | VaultItem;

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
}

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
}

export interface Note {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  folder?: string;
  tags?: string[];
  favorite?: boolean;
  pinned?: boolean;
  subjectId?: string;
  attachments?: string[];
  taskId?: string;
  examId?: string;
}

export interface Task {
  id: string;
  title: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
  done: boolean;
  createdAt: string;
  subjectId?: string;
  kind?: 'task' | 'assignment';
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'class' | 'assignment' | 'study' | 'personal' | 'exam' | 'quiz' | 'deadline';
  notes?: string;
  createdAt: string;
  subjectId?: string;
  startTime?: string;
  durationMinutes?: number;
}

export interface Settings {
  provider: 'local' | 'openai' | 'claude' | 'gemini';
  privacyMode: 'strict' | 'balanced' | 'open';
  enableWebSearch: boolean;
  enableCloudSync: boolean;
  allowExternalTools: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  plugins: {
    math: boolean;
    search: boolean;
    notes: boolean;
    planner: boolean;
  };
}

export interface AppState {
  profile: {
    name: string;
    major: string;
    year: string;
  };
  currentSessionId: string;
  sessions: Session[];
  notes: Note[];
  tasks: Task[];
  events: CalendarEvent[];
  subjects: Subject[];
  exams: AcademicExam[];
  grades: AcademicGrade[];
  attendance: AttendanceRecord[];
  studySessions: StudySession[];
  snippets: CodeSnippet[];
  vaultItems: VaultItem[];
  settings: Settings;
}

declare global {
  interface Window {
    electronAPI?: {
      loadAppState: () => Promise<AppState>;
      saveAppState: (state: AppState) => Promise<boolean>;
      selectVaultPath: (kind: 'file' | 'folder') => Promise<{ path: string; name: string } | null>;
      openVaultPath: (path: string) => Promise<boolean>;
    };
  }
}
