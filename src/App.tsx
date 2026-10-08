import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { evaluate } from 'mathjs';
import * as pdfjsLib from 'pdfjs-dist';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Activity, AlarmClock, ArrowDownToLine, ArrowUp, BookOpen, Bot, Calculator, CalendarDays,
  Check, ChevronRight, CircleHelp, Code2, Command, FileText, Folder, Gauge,
  GraduationCap, Mic, Plus, Search, Settings2, ShieldCheck, Sparkles,
  Pin, SquarePen, Star, Trash2, TriangleAlert, Volume2, Wrench, X,
} from 'lucide-react';
import type { AcademicCollection, AcademicRecord, AppState, CalendarEvent, Message, Note, Session, TabName, Task } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
const AssistantBot = lazy(() => import('./AssistantBot').then((module) => ({ default: module.AssistantBot })));

const STORAGE_KEY = 'student-ai-desktop-agent-state';
const API_BASE_URL = 'http://127.0.0.1:3001';
const workspaceLoader = () => import('./AcademicWorkspaces');
const AcademicHub = lazy(() => workspaceLoader().then((module) => ({ default: module.AcademicHub })));
const DeveloperWorkspace = lazy(() => workspaceLoader().then((module) => ({ default: module.DeveloperWorkspace })));
const ExamCenter = lazy(() => workspaceLoader().then((module) => ({ default: module.ExamCenter })));
const FileVault = lazy(() => workspaceLoader().then((module) => ({ default: module.FileVault })));
const PerformanceDashboard = lazy(() => workspaceLoader().then((module) => ({ default: module.PerformanceDashboard })));
const StudentDashboard = lazy(() => workspaceLoader().then((module) => ({ default: module.StudentDashboard })));
const StudentTools = lazy(() => workspaceLoader().then((module) => ({ default: module.StudentTools })));
const StudyCenter = lazy(() => workspaceLoader().then((module) => ({ default: module.StudyCenter })));

async function apiRequest<T>(resource: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/${resource}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error || `Backend request failed (${response.status}).`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function loadBackendCollection<T extends { id: string }>(resource: string, localItems: T[]): Promise<T[]> {
  const remoteItems = await apiRequest<T[]>(resource);
  const remoteIds = new Set(remoteItems.map((item) => item.id));
  const localOnlyItems = localItems.filter((item) => !remoteIds.has(item.id));
  const migratedItems = await Promise.all(
    localOnlyItems.map((item) => apiRequest<T>(resource, {
      method: 'POST',
      body: JSON.stringify(item),
    })),
  );
  return [...remoteItems, ...migratedItems];
}

async function loadAcademicCollection<T extends { id: string }>(collection: AcademicCollection, localItems: T[]): Promise<T[]> {
  const resource = `academic/${collection}`;
  const remoteItems = await apiRequest<T[]>(resource);
  const remoteIds = new Set(remoteItems.map((item) => item.id));
  const localOnlyItems = localItems.filter((item) => !remoteIds.has(item.id));
  const migratedItems = await Promise.all(localOnlyItems.map((item) => apiRequest<T>(resource, {
    method: 'POST',
    body: JSON.stringify(item),
  })));
  return [...remoteItems, ...migratedItems];
}

const defaultState: AppState = {
  profile: {
    name: 'Ali',
    major: 'Computer Science',
    year: 'Year 3',
  },
  currentSessionId: 'default-session',
  sessions: [
    {
      id: 'default-session',
      title: 'Study Session',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: 'welcome-1',
          role: 'assistant',
          content: 'Welcome! I can explain algorithms, solve math problems, find study information, and help manage your tasks.',
          createdAt: new Date().toISOString(),
        },
      ],
    },
  ],
  notes: [
    {
      id: 'note-1',
      title: 'Algorithms reminder',
      body: 'Big-O: O(log n) for binary search, O(n log n) for mergesort and quicksort average.',
      createdAt: new Date().toISOString(),
    },
  ],
  tasks: [
    {
      id: 'task-1',
      title: 'Review data structures assignment',
      dueDate: '2026-10-12',
      priority: 'high',
      done: false,
      createdAt: new Date().toISOString(),
    },
  ],
  events: [
    {
      id: 'event-1',
      title: 'Algorithms lecture',
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      type: 'class',
      notes: 'Topic: graphs and BFS',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'event-2',
      title: 'Study session',
      date: new Date(Date.now() + 172800000).toISOString().slice(0, 10),
      type: 'study',
      notes: 'Practice exam questions',
      createdAt: new Date().toISOString(),
    },
  ],
  subjects: [],
  exams: [],
  grades: [],
  attendance: [],
  studySessions: [],
  snippets: [],
  vaultItems: [],
  settings: {
    provider: 'local',
    privacyMode: 'strict',
    enableWebSearch: true,
    enableCloudSync: false,
    allowExternalTools: true,
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    dailyGoalMinutes: 120,
    weeklyGoalMinutes: 840,
    plugins: {
      math: true,
      search: true,
      notes: true,
      planner: true,
    },
  },
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateString() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

interface VoiceRecognition {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechWindow = Window & {
  SpeechRecognition?: new () => VoiceRecognition;
  webkitSpeechRecognition?: new () => VoiceRecognition;
};

function getCurrentSession(state: AppState): Session {
  return state.sessions.find((s) => s.id === state.currentSessionId) ?? state.sessions[0];
}

function normalizeState(saved?: Partial<AppState> | null): AppState {
  const source = saved ?? {};
  return {
    ...defaultState,
    ...source,
    profile: { ...defaultState.profile, ...source.profile },
    sessions: source.sessions?.length ? source.sessions : defaultState.sessions,
    notes: source.notes ?? defaultState.notes,
    tasks: source.tasks ?? defaultState.tasks,
    events: source.events ?? defaultState.events,
    subjects: source.subjects ?? [],
    exams: source.exams ?? [],
    grades: source.grades ?? [],
    attendance: source.attendance ?? [],
    studySessions: source.studySessions ?? [],
    snippets: source.snippets ?? [],
    vaultItems: source.vaultItems ?? [],
    settings: {
      ...defaultState.settings,
      ...source.settings,
      plugins: { ...defaultState.settings.plugins, ...source.settings?.plugins },
    },
  };
}

async function loadPersistedState(): Promise<AppState> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    try {
      const state = await window.electronAPI.loadAppState();
      return normalizeState(state);
    } catch {
      return defaultState;
    }
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AppState>;
      if (parsed && parsed.sessions) return normalizeState(parsed);
    }
  } catch {
    // ignore
  }

  return defaultState;
}

async function persistState(state: AppState) {
  if (typeof window !== 'undefined' && window.electronAPI) {
    await window.electronAPI.saveAppState(state);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function parseQuadraticRoots(input: string): string | null {
  const normalized = input.replace(/solve/gi, '').replace(/\s+/g, '').toLowerCase();
  const match = normalized.match(/([+-]?\d*\.?\d*)x\^2([+-]?\d*\.?\d*)x([+-]?\d*\.?\d*)=0/);

  if (!match) return null;

  const a = parseFloat(match[1] || '1');
  const b = parseFloat(match[2] || '0');
  const c = parseFloat(match[3] || '0');

  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c)) return null;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return 'No real roots. The discriminant is negative.';
  }

  const sqrtD = Math.sqrt(discriminant);
  const root1 = (-b + sqrtD) / (2 * a);
  const root2 = (-b - sqrtD) / (2 * a);
  return `x = ${root1.toFixed(4)} or x = ${root2.toFixed(4)}`;
}

function answerMathQuery(input: string): string {
  const quadratic = parseQuadraticRoots(input);
  if (quadratic) return quadratic;

  const cleaned = input
    .replace(/solve|calculate|what is|equals|=|please/gi, '')
    .replace(/\s+/g, '')
    .replace(/x\^2/g, 'pow(x,2)');

  try {
    const expression = cleaned.includes('x') ? cleaned.replace(/x/g, '2') : cleaned;
    const result = evaluate(expression);
    return `Result: ${String(result)}`;
  } catch {
    return 'I can solve straightforward math expressions or simple quadratic equations like x^2 - 5x + 6 = 0.';
  }
}

async function searchWeb(query: string): Promise<string> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Search request failed');
    }
    const data = await response.json();
    const abstract = data.AbstractText || data.RelatedTopics?.[0]?.Text || 'I could not find a concise summary.';
    return abstract.length > 300 ? `${abstract.slice(0, 300)}...` : abstract;
  } catch {
    return 'Search is not available right now, but I can still help explain the topic from your notes and context.';
  }
}

function generateStudyReply(input: string): string {
  const question = input.trim();
  if (!question) return 'Please ask me a question.';

  const lower = question.toLowerCase();
  if (lower.includes('algorithm') || lower.includes('complexity')) {
    return 'A good study answer: time complexity explains how runtime scales with input size. For example, binary search is O(log n), while linear search is O(n).';
  }
  if (lower.includes('database') || lower.includes('sql')) {
    return 'A useful approach is to start with the data model, then identify primary keys, normalization, and joins. If you need, I can help you write SQL queries or explain relational design.';
  }
  if (lower.includes('os') || lower.includes('operating')) {
    return 'Operating systems manage processes, memory, files, and I/O. Core concepts include scheduling, synchronization, deadlocks, and virtual memory.';
  }
  if (lower.includes('network') || lower.includes('tcp') || lower.includes('http')) {
    return 'HTTP is an application-layer protocol, while TCP guarantees ordered delivery over connections. A common exam tip is to distinguish between reliability, ports, and packet flow.';
  }

  return `Here is a focused study response: ${question} is best understood by breaking it into concepts, examples, and trade-offs. If you want, I can turn this into a revision note, a diagram, or a practice quiz.`;
}

async function callOpenAiCompatible(prompt: string, settings: AppState['settings']) {
  if (!settings.apiKey || !settings.baseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful university study assistant for computer science and student life. Keep answers concise, practical, and structured.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`Provider error: ${response.status}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim();
    }
  } catch {
    return null;
  }

  return null;
}

async function callBackendChat(prompt: string, settings: AppState['settings']) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        provider: settings.provider,
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (typeof data?.reply === 'string' && data.reply.trim().length > 0) {
      return data.reply.trim();
    }
  } catch {
    return null;
  }

  return null;
}

async function buildAssistantReply(input: string, settings: AppState['settings']): Promise<{ content: string; tool: string | null }> {
  if (settings.provider !== 'local' && settings.apiKey) {
    const backendReply = await callBackendChat(input, settings);
    if (backendReply) {
      return { content: backendReply, tool: 'ai_provider' };
    }

    const apiResponse = await callOpenAiCompatible(input, settings);
    if (apiResponse) {
      return { content: apiResponse, tool: 'ai_provider' };
    }
  }

  const lower = input.toLowerCase();

  if (lower.includes('solve') || lower.includes('calculate') || /\b\d+\b.*[+\-*/]|=.*\d/.test(lower) || /x\^2|x\s*\+|x\s*-/.test(lower)) {
    return { content: answerMathQuery(input), tool: 'math' };
  }

  if (lower.includes('search') || lower.includes('find') || lower.includes('what is') || lower.includes('who is')) {
    const result = await searchWeb(input);
    return { content: result, tool: 'web_search' };
  }

  if (lower.includes('note') || lower.includes('remember')) {
    return { content: 'I can save that as a note. Use the Notes tab to keep it for later revision and quick recall.', tool: null };
  }

  if (lower.includes('task') || lower.includes('plan') || lower.includes('schedule')) {
    return { content: 'I can help structure your study plan. Add deadlines and priorities in the Tasks tab, and I can suggest a practical order to work through them.', tool: null };
  }

  return { content: generateStudyReply(input), tool: null };
}

function dateMentionedIn(input: string): string | null {
  const explicitDate = input.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (explicitDate) return explicitDate[1];
  const lower = input.toLowerCase();
  const targetWeekday = [
    ['sunday', 'الأحد', 'الاحد'], ['monday', 'الاثنين', 'الإثنين'],
    ['tuesday', 'الثلاثاء'], ['wednesday', 'الأربعاء', 'الاربعاء'],
    ['thursday', 'الخميس'], ['friday', 'الجمعة'], ['saturday', 'السبت'],
  ].find((names) => names.some((name) => lower.includes(name)));
  const date = new Date();
  if (targetWeekday) {
    const target = [
      ['sunday', 'الأحد', 'الاحد'], ['monday', 'الاثنين', 'الإثنين'],
      ['tuesday', 'الثلاثاء'], ['wednesday', 'الأربعاء', 'الاربعاء'],
      ['thursday', 'الخميس'], ['friday', 'الجمعة'], ['saturday', 'السبت'],
    ].findIndex((names) => names.some((name) => lower.includes(name)));
    date.setDate(date.getDate() + ((target - date.getDay() + 7) % 7 || 7));
  } else if (/\btomorrow\b|بكرة|غدًا|غدا/.test(lower)) {
    date.setDate(date.getDate() + 1);
  } else if (/\btoday\b|النهارده|اليوم/.test(lower)) {
    // Keep today's date.
  } else {
    return null;
  }
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function findSubject(input: string, state: AppState) {
  const lower = input.toLowerCase();
  const words = lower.split(/[^\p{L}\p{N}+#]+/u).filter(Boolean);
  return state.subjects.find((subject) => {
    const identifiers = [subject.name, subject.code].filter(Boolean).map((value) => value.toLowerCase());
    return identifiers.some((identifier) => lower.includes(identifier)) || identifiers.some((identifier) => identifier
      .split(/[^\p{L}\p{N}+#]+/u)
      .filter((word) => word.length > 3)
      .some((word) => words.some((queryWord) => queryWord.length > 2 && (word.startsWith(queryWord) || queryWord.startsWith(word.slice(0, 4))))));
  });
}

function answerFromStudentData(input: string, state: AppState): string | null {
  const lower = input.toLowerCase();
  const date = dateMentionedIn(lower);
  const arabic = /[\u0600-\u06ff]/.test(input);

  if (/(tasks?|assignments?|واجبات|مهام|مهمة)/i.test(lower)) {
    const selectedDate = date ?? todayDateString();
    const tasks = state.tasks.filter((task) => !task.done && task.dueDate === selectedDate);
    const phrase = date ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }) : 'today';
    if (arabic) return tasks.length ? `عليك ${tasks.length} ${tasks.length === 1 ? 'مهمة' : 'مهام'} بتاريخ ${selectedDate}: ${tasks.map((task) => `${task.title}${task.priority === 'high' ? ' (أولوية عالية)' : ''}`).join('؛ ')}.` : `ليس لديك مهام معلّقة بتاريخ ${selectedDate}.`;
    if (!tasks.length) return `You have no pending tasks for ${phrase}.`;
    return `You have ${tasks.length} pending task${tasks.length === 1 ? '' : 's'} for ${phrase}: ${tasks.map((task) => `${task.title}${task.priority === 'high' ? ' (high priority)' : ''}`).join('; ')}.`;
  }

  if (/(exams?|اختبار|امتحان)/i.test(lower)) {
    const exams = state.exams.filter((exam) => !date || exam.date === date).filter((exam) => exam.date >= todayDateString()).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
    if (arabic) return exams.length ? `الامتحانات المسجلة: ${exams.map((exam) => `${exam.title} (${state.subjects.find((subject) => subject.id === exam.subjectId)?.name ?? 'مادة غير محددة'}، ${exam.date})`).join('؛ ')}.` : date ? 'لا توجد امتحانات مسجلة في هذا اليوم.' : 'لا توجد امتحانات قادمة مسجلة بعد. أضف امتحانًا في مركز الامتحانات وسأساعدك في التخطيط له.';
    if (!exams.length) return date ? 'There are no exams recorded for that day.' : 'No upcoming exams are recorded yet. Add one in Exam Center and I can help plan around it.';
    return `Upcoming exams: ${exams.map((exam) => `${exam.title} (${state.subjects.find((subject) => subject.id === exam.subjectId)?.name ?? 'subject'}, ${exam.date})`).join('; ')}.`;
  }

  if (/(classes?|lectures?|محاضرات|مواد|محاضرة)/i.test(lower) && date) {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const meetings = state.subjects.flatMap((subject) => subject.meetings.filter((meeting) => meeting.weekday === weekday).map((meeting) => `${meeting.startTime} ${subject.name}${meeting.room ? ` in ${meeting.room}` : ''}`));
    return arabic ? meetings.length ? `محاضراتك بتاريخ ${date}: ${meetings.join('؛ ')}.` : `ليس لديك محاضرات مسجلة بتاريخ ${date}.` : meetings.length ? `Your classes on ${date}: ${meetings.join('; ')}.` : `You have no classes scheduled on ${date}.`;
  }

  if (/(gpa|grade|grades|درجات|المعدل)/i.test(lower)) {
    const perSubject = state.subjects.map((subject) => {
      const grades = state.grades.filter((grade) => grade.subjectId === subject.id);
      const score = grades.reduce((sum, grade) => sum + grade.score, 0);
      const outOf = grades.reduce((sum, grade) => sum + grade.outOf, 0);
      return { credits: subject.creditHours, ratio: outOf ? score / outOf : null };
    }).filter((item): item is { credits: number; ratio: number } => item.ratio !== null);
    const credits = perSubject.reduce((sum, item) => sum + item.credits, 0);
    const points = perSubject.reduce((sum, item) => sum + item.ratio * 4 * item.credits, 0);
    return credits ? arabic ? `معدلك التقديري الموزون بالساعات هو ${(points / credits).toFixed(2)} من 4.00، اعتمادًا على ${state.grades.length} تقييمات مسجلة. قد يختلف سلم جامعتك الرسمي.` : `Your estimated credit-weighted GPA is ${(points / credits).toFixed(2)} / 4.00, based on ${state.grades.length} recorded grades. Your school's official scale may differ.` : arabic ? 'لا توجد درجات مسجلة بعد. أضف درجاتك في Academic Hub لأحسب المعدل التقديري.' : 'No grades are recorded yet. Add grades in Academic Hub and I can estimate your GPA.';
  }

  const asksKnowledgeBase = /(notes?|knowledge base|ملاحظات|ملخص|مذكرتي|مذكراتي|من ملاحظاتي)/i.test(lower);
  if (asksKnowledgeBase) {
    const terms = lower.split(/[^\p{L}\p{N}+#]+/u).filter((term) => term.length > 2 && !['what', 'from', 'about', 'notes', 'note', 'ملاحظات', 'ملاحظاتي', 'مذكراتي', 'من', 'على', 'عن', 'في', 'ايه', 'إيه'].includes(term));
    const rankedNotes = state.notes.map((note) => ({ note, score: terms.reduce((score, term) => score + (note.title.toLowerCase().includes(term) ? 3 : 0) + (note.body.toLowerCase().includes(term) ? 1 : 0), 0) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    if (!rankedNotes.length) return 'I could not find a matching note in your Knowledge Base. Try a subject name or a key term from the note.';
    if (arabic) return `من قاعدة المعرفة: ${rankedNotes.map(({ note }) => `${note.title}: ${note.body.slice(0, 360)}`).join(' | ')}.`;
    return `From your Knowledge Base: ${rankedNotes.map(({ note }) => `${note.title}: ${note.body.slice(0, 360)}`).join(' | ')}.`;
  }
  return null;
}

function todayDateString() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function App() {
  const [state, setState] = useState<AppState>(defaultState);
  const [activeTab, setActiveTab] = useState<TabName>('chat');
  const [draft, setDraft] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<VoiceRecognition | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteFolder, setNoteFolder] = useState('General');
  const [noteTags, setNoteTags] = useState('');
  const [noteSubjectId, setNoteSubjectId] = useState('');
  const [noteTaskId, setNoteTaskId] = useState('');
  const [noteExamId, setNoteExamId] = useState('');
  const [noteAttachments, setNoteAttachments] = useState<string[]>([]);
  const [noteSearch, setNoteSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<'all' | 'favorites' | 'pinned'>('all');
  const [notePreview, setNotePreview] = useState(false);
  const [docSummaryText, setDocSummaryText] = useState('');
  const [summaryResult, setSummaryResult] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskKind, setTaskKind] = useState<NonNullable<Task['kind']>>('task');
  const [taskSubjectId, setTaskSubjectId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [eventType, setEventType] = useState<CalendarEvent['type']>('study');
  const [eventNotes, setEventNotes] = useState('');
  const [eventStartTime, setEventStartTime] = useState('18:00');
  const [eventDuration, setEventDuration] = useState('60');
  const [eventSubjectId, setEventSubjectId] = useState('');
  const [plannerView, setPlannerView] = useState<'day' | 'week' | 'month'>('week');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [dataError, setDataError] = useState('');

  useEffect(() => {
    let mounted = true;

    loadPersistedState().then(async (loadedState) => {
      let stateWithBackend = loadedState;
      try {
        const [notes, tasks, events, subjects, exams, grades, attendance, studySessions, snippets, vaultItems] = await Promise.all([
          loadBackendCollection<Note>('notes', loadedState.notes),
          loadBackendCollection<Task>('tasks', loadedState.tasks),
          loadBackendCollection<CalendarEvent>('events', loadedState.events),
          loadAcademicCollection('subjects', loadedState.subjects),
          loadAcademicCollection('exams', loadedState.exams),
          loadAcademicCollection('grades', loadedState.grades),
          loadAcademicCollection('attendance', loadedState.attendance),
          loadAcademicCollection('studySessions', loadedState.studySessions),
          loadAcademicCollection('snippets', loadedState.snippets),
          loadAcademicCollection('vaultItems', loadedState.vaultItems),
        ]);
        stateWithBackend = { ...loadedState, notes, tasks, events, subjects, exams, grades, attendance, studySessions, snippets, vaultItems };
        setDataError('');
      } catch {
        setDataError('Backend is unavailable. Changes are being kept in local storage.');
      }
      if (!mounted) return;
      setState(stateWithBackend);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void persistState(state);
  }, [state]);

  const currentSession = useMemo(() => getCurrentSession(state), [state]);

  const updateSessionMessages = (newMessages: Message[]) => {
    setState((prev) => {
      const sessionIndex = prev.sessions.findIndex((session) => session.id === prev.currentSessionId);
      const nextSessions = [...prev.sessions];
      nextSessions[sessionIndex] = {
        ...nextSessions[sessionIndex],
        updatedAt: new Date().toISOString(),
        messages: newMessages,
      };
      return { ...prev, sessions: nextSessions };
    });
  };

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: 'smooth' });
  }, [currentSession.messages.length, isBusy]);

  const runAppCommand = async (input: string): Promise<string | null> => {
    const match = input.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
    if (!match) return null;
    const command = match[1].toLowerCase();
    const argument = (match[2] ?? '').trim();

    if (command === 'help') {
      return 'Commands: /task title [YYYY-MM-DD], /note title :: details, /event YYYY-MM-DD title, /exam YYYY-MM-DD subject, /study subject 60m [YYYY-MM-DD], /open dashboard|chat|academic|notes|tasks|calendar|study|exams|performance|files|settings, /math expression. Commands only change data inside this app.';
    }

    if (command === 'open') {
      const tab = argument.toLowerCase() as TabName;
      const availableTabs: TabName[] = ['dashboard', 'chat', 'academic', 'notes', 'tasks', 'calendar', 'study', 'studentTools', 'devTools', 'exams', 'performance', 'files', 'settings'];
      if (!availableTabs.includes(tab)) return 'Choose a page: /open dashboard, chat, academic, notes, tasks, calendar, study, exams, performance, files, studentTools, devTools, or settings.';
      setActiveTab(tab);
      return `Opened ${tab}.`;
    }

    if (command === 'math') {
      return argument ? answerMathQuery(argument) : 'Usage: /math 42 * (8 + 3)';
    }

    if (command === 'task') {
      if (!argument) return 'Usage: /task Review graph algorithms 2026-10-12';
      const dueDateMatch = argument.match(/\b\d{4}-\d{2}-\d{2}\b/);
      const title = argument.replace(dueDateMatch?.[0] ?? '', '').trim();
      if (!title) return 'Add a task title before the optional due date.';
      const task: Task = {
        id: createId('task'),
        title,
        dueDate: dueDateMatch?.[0] ?? localDateString(),
        priority: 'medium',
        done: false,
        createdAt: new Date().toISOString(),
      };
      try {
        const savedTask = await apiRequest<Task>('tasks', { method: 'POST', body: JSON.stringify(task) });
        setState((prev) => ({ ...prev, tasks: [savedTask, ...prev.tasks] }));
        setDataError('');
      } catch {
        setState((prev) => ({ ...prev, tasks: [task, ...prev.tasks] }));
        setDataError('Backend unavailable. The task was saved locally.');
      }
      return `Task added: ${title} (due ${task.dueDate}).`;
    }

    if (command === 'note') {
      if (!argument) return 'Usage: /note Topic title :: note details';
      const [rawTitle, ...bodyParts] = argument.split('::');
      const title = rawTitle.trim();
      const body = bodyParts.join('::').trim() || title;
      const note: Note = { id: createId('note'), title: title.slice(0, 80), body, createdAt: new Date().toISOString() };
      try {
        const savedNote = await apiRequest<Note>('notes', { method: 'POST', body: JSON.stringify(note) });
        setState((prev) => ({ ...prev, notes: [savedNote, ...prev.notes] }));
        setDataError('');
      } catch {
        setState((prev) => ({ ...prev, notes: [note, ...prev.notes] }));
        setDataError('Backend unavailable. The note was saved locally.');
      }
      return `Note saved: ${note.title}.`;
    }

    if (command === 'event') {
      const eventMatch = argument.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
      if (!eventMatch) return 'Usage: /event 2026-10-12 Algorithms study group';
      const calendarEvent: CalendarEvent = {
        id: createId('event'),
        date: eventMatch[1],
        title: eventMatch[2].trim(),
        type: 'study',
        notes: '',
        createdAt: new Date().toISOString(),
      };
      try {
        const savedEvent = await apiRequest<CalendarEvent>('events', { method: 'POST', body: JSON.stringify(calendarEvent) });
        setState((prev) => ({ ...prev, events: [savedEvent, ...prev.events] }));
        setDataError('');
      } catch {
        setState((prev) => ({ ...prev, events: [calendarEvent, ...prev.events] }));
        setDataError('Backend unavailable. The event was saved locally.');
      }
      return `Study event added: ${calendarEvent.title} on ${calendarEvent.date}.`;
    }

    if (command === 'study') {
      const studyMatch = argument.match(/^(.+?)\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours)?(?:\s+(20\d{2}-\d{2}-\d{2}))?$/i);
      if (!studyMatch) return 'Usage: /study C++ 2h 2026-10-12 (date is optional).';
      const subjectName = studyMatch[1].trim();
      const durationMinutes = Number(studyMatch[2]) * (/^(h|hr|hrs|hours)$/i.test(studyMatch[3] || 'm') ? 60 : 1);
      const subject = findSubject(subjectName, state);
      const date = studyMatch[4] ?? localDateString();
      await saveCalendarRecord({ id: createId('event'), title: `Study session: ${subject?.name ?? subjectName}`, date, type: 'study', subjectId: subject?.id, startTime: '18:00', durationMinutes, createdAt: new Date().toISOString() });
      setActiveTab('calendar');
      return `Study session planned: ${subject?.name ?? subjectName}, ${durationMinutes} minutes on ${date} at 18:00.`;
    }

    if (command === 'exam') {
      const examMatch = argument.match(/^(20\d{2}-\d{2}-\d{2})\s+(.+)$/);
      if (!examMatch) return 'Usage: /exam 2026-10-12 Mathematics';
      const subjectName = examMatch[2].trim();
      const subject = findSubject(subjectName, state);
      const exam: AppState['exams'][number] = { id: createId('exam'), subjectId: subject?.id ?? 'unassigned', title: `${subject?.name ?? subjectName} exam`, type: 'final', date: examMatch[1], syllabus: '', createdAt: new Date().toISOString() };
      await saveAcademicRecord('exams', exam);
      await saveCalendarRecord({ id: createId('event'), title: exam.title, date: exam.date, type: 'exam', subjectId: exam.subjectId, notes: exam.id, createdAt: new Date().toISOString() });
      setActiveTab('exams');
      return `Exam added: ${exam.title} on ${exam.date}. I also added it to your planner.`;
    }

    return 'Unknown command. Type /help to see available in-app commands.';
  };

  const runNaturalAction = async (input: string): Promise<string | null> => {
    const lower = input.toLowerCase();
    const taskIntent = /(?:add|create|schedule|remind me|ضيف|اضف|أضف|سجل|حط).*(?:task|assignment|واجب|مهمة)/i.test(input);
    if (taskIntent) {
      const date = dateMentionedIn(input) ?? localDateString();
      const subject = findSubject(input, state);
      const title = input
        .replace(/^(?:please\s+)?(?:add|create|schedule|remind me to|ضيفلي|ضيف|اضفلي|أضفلي|اضف|أضف|سجل|حطلي|حط)\s*/i, '')
        .replace(/\b(?:task|assignment)\b|واجب|مهمة/gi, '')
        .replace(/\b20\d{2}-\d{2}-\d{2}\b|\btomorrow\b|\btoday\b|\bnext week\b|بكرة|غدًا|غدا|اليوم|النهارده|الأحد|الاحد|الاثنين|الإثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت/gi, '')
        .trim() || 'Study task';
      const task: Task = { id: createId('task'), title, dueDate: date, priority: /urgent|عاجل|مهم جدًا/i.test(input) ? 'high' : 'medium', done: false, createdAt: new Date().toISOString(), kind: /assignment|واجب/i.test(input) ? 'assignment' : 'task', subjectId: subject?.id };
      await saveTaskRecord(task);
      setActiveTab('tasks');
      return `تمت إضافة ${task.kind === 'assignment' ? 'الواجب' : 'المهمة'} “${title}” بتاريخ ${date}${subject ? ` لمادة ${subject.name}` : ''}.`;
    }

    const noteIntent = /(?:save (?:this|that )?(?:as a )?note|remember that|make a note|write this down|احفظ(?:لي)?|سجل(?:لي)? ملاحظة|دوّن|اكتب ملاحظة)/i.test(input);
    if (noteIntent) {
      const [rawTitle, ...bodyParts] = input.replace(/^(?:please\s+)?(?:save (?:this|that )?(?:as a )?note|remember that|make a note|write this down|احفظ(?:لي)?|سجل(?:لي)? ملاحظة|دوّن|اكتب ملاحظة)\s*/i, '').split('::');
      const body = bodyParts.join('::').trim() || rawTitle.trim();
      if (!body) return 'قل لي محتوى الملاحظة الذي تريد حفظه.';
      const subject = findSubject(input, state);
      await saveNoteRecord({ id: createId('note'), title: rawTitle.trim().slice(0, 80) || 'Quick note', body, createdAt: new Date().toISOString(), folder: subject?.name || 'Quick notes', tags: subject ? [subject.code || subject.name] : [], subjectId: subject?.id });
      setActiveTab('notes');
      return 'حفظت الملاحظة في Knowledge Base. يمكنك البحث عنها أو ربطها بمادة لاحقًا.';
    }

    const studyIntent = /(add|schedule|plan|create|ضيف|اضف|أضف|سجل|حط).*(study|revision|مذاكرة|مراجعة)/i.test(input)
      || /(study session|جلسة مذاكرة|مذاكرة).*(tomorrow|today|بكرة|غدا|النهارده|اليوم|الساعة|لمدة)/i.test(input);
    if (studyIntent) {
      const durationMatch = input.match(/(?:(\d+)\s*)?((?:\b(?:hours?|hrs?|h|minutes?|mins?|m)\b)|ساعات|ساعة|ساعتين|دقائق|دقيقة|دقيقتين)/i);
      const durationToken = durationMatch?.[2]?.toLowerCase() ?? '';
      const durationValue = Number(durationMatch?.[1]) || (/ساعتين|دقيقتين/.test(durationToken) ? 2 : 1);
      const durationMinutes = durationValue * (/^(h|hr|hrs|hour|hours|ساعات|ساعة|ساعتين)$/i.test(durationToken) ? 60 : 1);
      const date = dateMentionedIn(input) ?? localDateString();
      const timeMatch = input.match(/(?:at|@|الساعة)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|صباحًا|صباحا|مساءً|مساء|ص|م)?/i);
      let startTime = '18:00';
      if (timeMatch) {
        let hours = Number(timeMatch[1]);
        const period = (timeMatch[3] ?? '').toLowerCase();
        if (['pm', 'مساءً', 'مساء', 'م'].includes(period) && hours < 12) hours += 12;
        if (['am', 'صباحًا', 'صباحا', 'ص'].includes(period) && hours === 12) hours = 0;
        if (!period && input.includes('الساعة') && hours > 0 && hours < 12) hours += 12;
        startTime = `${String(hours).padStart(2, '0')}:${timeMatch[2] ?? '00'}`;
      }
      const subject = findSubject(input, state);
      const title = subject?.name || (durationMatch ? input.slice(0, durationMatch.index).replace(/.*(?:study|مذاكرة|مراجعة)\s*/i, '').trim() : '') || 'Study session';
      await saveCalendarRecord({ id: createId('event'), title: `Study session: ${title}`, date, type: 'study', subjectId: subject?.id, startTime, durationMinutes, createdAt: new Date().toISOString() });
      setActiveTab('calendar');
      return `تمت إضافة جلسة مذاكرة ${subject?.name ?? title} لمدة ${durationMinutes} دقيقة يوم ${date} الساعة ${startTime}.`;
    }

    const examIntent = /(عندي امتحان|عندي اختبار|schedule.*exam|add.*exam|عندي ميد|ضيف.*امتحان)/i.test(input);
    if (examIntent) {
      const date = dateMentionedIn(input);
      if (!date) return 'اذكر موعد الامتحان، مثل: عندي امتحان Math يوم الخميس.';
      const subject = findSubject(input, state);
      const subjectName = subject?.name || input.replace(/.*(?:امتحان|اختبار|exam|midterm)\s*/i, '').replace(/tomorrow|today|بكرة|غدا|النهارده|اليوم|الأحد|الاحد|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس|الجمعة|السبت|sunday|monday|tuesday|wednesday|thursday|friday|saturday/gi, '').trim() || 'Unassigned subject';
      const exam: AppState['exams'][number] = { id: createId('exam'), subjectId: subject?.id ?? 'unassigned', title: `${subjectName} exam`, type: 'final', date, syllabus: '', createdAt: new Date().toISOString() };
      await saveAcademicRecord('exams', exam);
      await saveCalendarRecord({ id: createId('event'), title: exam.title, date, type: 'exam', subjectId: exam.subjectId, notes: exam.id, createdAt: new Date().toISOString() });
      setActiveTab('exams');
      return `أضفت ${exam.title} يوم ${date} إلى Exam Center وPlanner.`;
    }

    return null;
  };

  const sendMessage = async () => {
    const input = draft.trim();
    if (!input || isBusy) return;

    const userMessage: Message = {
      id: createId('user'),
      role: 'user',
      content: input,
      createdAt: new Date().toISOString(),
    };

    const nextMessages = [...currentSession.messages, userMessage];
    updateSessionMessages(nextMessages);
    setDraft('');
    setIsBusy(true);

    try {
      const commandReply = await runAppCommand(input);
      const naturalActionReply = commandReply ? null : await runNaturalAction(input);
      const dataReply = commandReply || naturalActionReply ? null : answerFromStudentData(input, state);
      const content = commandReply ?? naturalActionReply ?? dataReply;
      const reply = content
        ? { content, tool: commandReply || naturalActionReply ? 'app_action' : 'student_data' }
        : await buildAssistantReply(input, state.settings);
      const assistantMessage: Message = {
        id: createId('assistant'),
        role: 'assistant',
        content: reply.content,
        createdAt: new Date().toISOString(),
      };

      const finalMessages = [...nextMessages, assistantMessage];
      updateSessionMessages(finalMessages);
      setIsSpeaking(true);
      window.setTimeout(() => setIsSpeaking(false), 1500);
      if (voiceEnabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(assistantMessage.content));
      }
    } catch {
      const errorMessage: Message = {
        id: createId('assistant'),
        role: 'assistant',
        content: 'Something went wrong while responding. Please try again.',
        createdAt: new Date().toISOString(),
      };
      updateSessionMessages([...nextMessages, errorMessage]);
    } finally {
      setIsBusy(false);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setDataError('Voice input is not available in this version of the app.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const spokenText = event.results[0]?.[0]?.transcript;
      if (spokenText) setDraft((previous) => `${previous}${previous ? ' ' : ''}${spokenText}`);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setDataError('');
  };

  const createNewSession = () => {
    const newSession: Session = {
      id: createId('session'),
      title: `Session ${state.sessions.length + 1}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [
        {
          id: createId('assistant'),
          role: 'assistant',
          content: 'New chat started. Ask anything about your course, assignments, or tasks.',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    setState((prev) => ({
      ...prev,
      currentSessionId: newSession.id,
      sessions: [newSession, ...prev.sessions],
    }));
  };

  const exportData = () => {
    const serialized = JSON.stringify(state, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'student-ai-data.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const resetData = () => {
    if (window.confirm('Reset all local app data?')) {
      setState(defaultState);
    }
  };

  const saveNote = async () => {
    const title = noteTitle.trim();
    const body = noteBody.trim();
    if (!title || !body) return;

    const existingNote = state.notes.find((note) => note.id === editingNoteId);
    const note: Note = {
      id: existingNote?.id || createId('note'),
      title,
      body,
      createdAt: existingNote?.createdAt || new Date().toISOString(),
      folder: noteFolder.trim() || 'General',
      tags: noteTags.split(',').map((tag) => tag.trim()).filter(Boolean),
      subjectId: noteSubjectId || undefined,
      taskId: noteTaskId || undefined,
      examId: noteExamId || undefined,
      attachments: noteAttachments,
      favorite: existingNote?.favorite ?? false,
      pinned: existingNote?.pinned ?? false,
    };

    try {
      const savedNote = await apiRequest<Note>(`notes${existingNote ? `/${existingNote.id}` : ''}`, {
        method: existingNote ? 'PUT' : 'POST',
        body: JSON.stringify(note),
      });
      setState((prev) => ({
        ...prev,
        notes: existingNote
          ? prev.notes.map((item) => item.id === savedNote.id ? savedNote : item)
          : [savedNote, ...prev.notes],
      }));
      setDataError('');
      setEditingNoteId(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not save note.');
      return;
    }
    setNoteTitle('');
    setNoteBody('');
    setNoteTags('');
    setNoteAttachments([]);
  };

  const saveTask = async () => {
    const title = taskTitle.trim();
    if (!title) return;

    const existingTask = state.tasks.find((task) => task.id === editingTaskId);
    const task: Task = {
      id: existingTask?.id || createId('task'),
      title,
      dueDate: taskDueDate || new Date().toISOString().slice(0, 10),
      priority: existingTask?.priority || 'medium',
      done: existingTask?.done || false,
      createdAt: existingTask?.createdAt || new Date().toISOString(),
      kind: taskKind,
      subjectId: taskSubjectId || undefined,
    };

    try {
      const savedTask = await apiRequest<Task>(`tasks${existingTask ? `/${existingTask.id}` : ''}`, {
        method: existingTask ? 'PUT' : 'POST',
        body: JSON.stringify(task),
      });
      setState((prev) => ({
        ...prev,
        tasks: existingTask
          ? prev.tasks.map((item) => item.id === savedTask.id ? savedTask : item)
          : [savedTask, ...prev.tasks],
      }));
      setDataError('');
      setEditingTaskId(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not save task.');
      return;
    }
    setTaskTitle('');
    setTaskDueDate('');
    setTaskKind('task');
    setTaskSubjectId('');
  };

  const saveCalendarEvent = async () => {
    const title = eventTitle.trim();
    if (!title) return;

    const existingEvent = state.events.find((event) => event.id === editingEventId);
    const calendarEvent: CalendarEvent = {
      id: existingEvent?.id || createId('event'),
      title,
      date: eventDate,
      type: eventType,
      notes: eventNotes,
      startTime: eventStartTime,
      durationMinutes: Number(eventDuration) || 60,
      subjectId: eventSubjectId || undefined,
      createdAt: existingEvent?.createdAt || new Date().toISOString(),
    };

    try {
      const savedEvent = await apiRequest<CalendarEvent>(`events${existingEvent ? `/${existingEvent.id}` : ''}`, {
        method: existingEvent ? 'PUT' : 'POST',
        body: JSON.stringify(calendarEvent),
      });
      setState((prev) => ({
        ...prev,
        events: existingEvent
          ? prev.events.map((item) => item.id === savedEvent.id ? savedEvent : item)
          : [savedEvent, ...prev.events],
      }));
      setDataError('');
      setEditingEventId(null);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not save event.');
      return;
    }
    setEventTitle('');
    setEventDate(new Date().toISOString().slice(0, 10));
    setEventNotes('');
    setEventType('study');
    setEventStartTime('18:00');
    setEventDuration('60');
    setEventSubjectId('');
  };

  const handleDocumentUpload = async (file: File) => {
    if (!file) return;

    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        let text = '';

        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
          const page = await pdf.getPage(pageIndex);
          const pageText = await page.getTextContent();
          text += pageText.items.map((item: any) => ('str' in item ? item.str : '')).join(' ') + '\n';
        }

        setDocSummaryText(text.trim());
        return;
      }

      const text = await file.text();
      setDocSummaryText(text.trim());
    } catch {
      setDocSummaryText('Could not parse the uploaded document. Please paste text manually instead.');
    }
  };

  const quickTaskSuggestions = [
    'Review algorithms notes',
    'Practice math problems',
    'Prepare for OS quiz',
    'Read database chapter',
  ];

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: Gauge },
    { id: 'chat', label: 'AI assistant', icon: Bot },
    { id: 'academic', label: 'Academic Hub', icon: BookOpen },
    { id: 'notes', label: 'Knowledge base', icon: BookOpen },
    { id: 'tasks', label: 'My tasks', icon: Check },
    { id: 'calendar', label: 'Planner', icon: CalendarDays },
    { id: 'exams', label: 'Exam Center', icon: GraduationCap },
    { id: 'study', label: 'Study Center', icon: AlarmClock },
    { id: 'studentTools', label: 'Student Tools', icon: Calculator },
    { id: 'devTools', label: 'Developer', icon: Code2 },
    { id: 'performance', label: 'Performance', icon: Activity },
    { id: 'files', label: 'File Vault', icon: Folder },
    { id: 'settings', label: 'AI settings', icon: Settings2 },
  ] as const;

  const plannerDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() + index);
      return date;
    });
  }, []);

  const upcomingTasks = useMemo(
    () => [...state.tasks].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [state.tasks],
  );

  const upcomingEvents = useMemo(
    () => [...state.events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [state.events],
  );

  const plannerDates = useMemo(() => {
    const anchor = new Date(`${eventDate}T12:00:00`);
    if (plannerView === 'day') return [anchor];
    if (plannerView === 'week') {
      const start = new Date(anchor);
      start.setDate(anchor.getDate() - anchor.getDay());
      return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    first.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setDate(first.getDate() + index); return date; });
  }, [eventDate, plannerView]);

  const noteFolders = useMemo(() => [...new Set(state.notes.map((note) => note.folder || 'General'))].sort(), [state.notes]);
  const visibleNotes = useMemo(() => state.notes
    .filter((note) => `${note.title} ${note.body} ${note.folder ?? ''} ${(note.tags ?? []).join(' ')}`.toLowerCase().includes(noteSearch.toLowerCase()))
    .filter((note) => noteFilter === 'favorites' ? note.favorite : noteFilter === 'pinned' ? note.pinned : true)
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.createdAt.localeCompare(a.createdAt)),
  [state.notes, noteFilter, noteSearch]);

  const updateTask = async (task: Task) => {
    try {
      const savedTask = await apiRequest<Task>(`tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify(task),
      });
      setState((prev) => ({ ...prev, tasks: prev.tasks.map((item) => item.id === task.id ? savedTask : item) }));
      setDataError('');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not update task.');
    }
  };

  const deleteItem = async (resource: 'notes' | 'tasks' | 'events', id: string) => {
    try {
      await apiRequest(`${resource}/${id}`, { method: 'DELETE' });
      setState((prev) => ({ ...prev, [resource]: prev[resource].filter((item) => item.id !== id) }));
      setDataError('');
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not delete item.');
    }
  };

  const updateNoteMetadata = async (note: Note, changes: Partial<Note>) => {
    const updated = { ...note, ...changes };
    try {
      const saved = await apiRequest<Note>(`notes/${note.id}`, { method: 'PUT', body: JSON.stringify(updated) });
      setState((previous) => ({ ...previous, notes: previous.notes.map((item) => item.id === note.id ? saved : item) }));
      setDataError('');
    } catch (error) {
      setState((previous) => ({ ...previous, notes: previous.notes.map((item) => item.id === note.id ? updated : item) }));
      setDataError(error instanceof Error ? error.message : 'Note updated locally.');
    }
  };

  const saveAcademicRecord = useCallback(async (collection: AcademicCollection, record: AcademicRecord) => {
    let savedRecord = record;
    try {
      savedRecord = await apiRequest<AcademicRecord>(`academic/${collection}`, {
        method: 'POST',
        body: JSON.stringify(record),
      });
      setDataError('');
    } catch {
      setDataError('Academic backend unavailable. This record is saved locally for now.');
    }
    setState((previous) => ({
      ...previous,
      [collection]: [savedRecord, ...(previous[collection] as AcademicRecord[]).filter((item) => item.id !== savedRecord.id)],
    }));
  }, []);

  const updateAcademicRecord = useCallback(async (collection: AcademicCollection, record: AcademicRecord) => {
    try {
      await apiRequest(`academic/${collection}/${record.id}`, {
        method: 'PUT',
        body: JSON.stringify(record),
      });
      setDataError('');
    } catch {
      setDataError('Academic backend unavailable. The update is saved locally for now.');
    }
    setState((previous) => ({
      ...previous,
      [collection]: (previous[collection] as AcademicRecord[]).map((item) => item.id === record.id ? record : item),
    }));
  }, []);

  const deleteAcademicRecord = useCallback(async (collection: AcademicCollection, id: string) => {
    const dependentIds = collection === 'subjects' ? {
      exams: state.exams.filter((item) => item.subjectId === id).map((item) => item.id),
      grades: state.grades.filter((item) => item.subjectId === id).map((item) => item.id),
      attendance: state.attendance.filter((item) => item.subjectId === id).map((item) => item.id),
      studySessions: state.studySessions.filter((item) => item.subjectId === id).map((item) => item.id),
      notes: state.notes.filter((item) => item.subjectId === id).map((item) => item.id),
      tasks: state.tasks.filter((item) => item.subjectId === id).map((item) => item.id),
      events: state.events.filter((item) => item.subjectId === id).map((item) => item.id),
    } : null;
    const linkedExamEvents = collection === 'exams' ? state.events.filter((item) => item.notes === id).map((item) => item.id) : [];
    if (collection === 'subjects' && !window.confirm('Remove this subject and its linked exams, grades, attendance, tasks, notes, and study events?')) return;

    try {
      if (dependentIds) {
        const deletes = [
          ...dependentIds.exams.map((itemId) => apiRequest(`academic/exams/${itemId}`, { method: 'DELETE' })),
          ...dependentIds.grades.map((itemId) => apiRequest(`academic/grades/${itemId}`, { method: 'DELETE' })),
          ...dependentIds.attendance.map((itemId) => apiRequest(`academic/attendance/${itemId}`, { method: 'DELETE' })),
          ...dependentIds.studySessions.map((itemId) => apiRequest(`academic/studySessions/${itemId}`, { method: 'DELETE' })),
          ...dependentIds.notes.map((itemId) => apiRequest(`notes/${itemId}`, { method: 'DELETE' })),
          ...dependentIds.tasks.map((itemId) => apiRequest(`tasks/${itemId}`, { method: 'DELETE' })),
          ...dependentIds.events.map((itemId) => apiRequest(`events/${itemId}`, { method: 'DELETE' })),
        ];
        await Promise.all(deletes);
      }
      if (linkedExamEvents.length) {
        await Promise.all(linkedExamEvents.map((eventId) => apiRequest(`events/${eventId}`, { method: 'DELETE' })));
      }
      await apiRequest(`academic/${collection}/${id}`, { method: 'DELETE' });
      setDataError('');
    } catch {
      setDataError('Some linked items could not be removed from the backend. Review the subject before deleting it again.');
    }
    setState((previous) => ({
      ...previous,
      [collection]: (previous[collection] as AcademicRecord[]).filter((item) => item.id !== id),
      ...(dependentIds ? {
        exams: previous.exams.filter((item) => item.subjectId !== id),
        grades: previous.grades.filter((item) => item.subjectId !== id),
        attendance: previous.attendance.filter((item) => item.subjectId !== id),
        studySessions: previous.studySessions.filter((item) => item.subjectId !== id),
        notes: previous.notes.filter((item) => item.subjectId !== id),
        tasks: previous.tasks.filter((item) => item.subjectId !== id),
        events: previous.events.filter((item) => item.subjectId !== id),
      } : {}),
      ...(linkedExamEvents.length ? { events: previous.events.filter((item) => !linkedExamEvents.includes(item.id)) } : {}),
    }));
  }, [state]);

  const saveCalendarRecord = useCallback(async (calendarEvent: CalendarEvent) => {
    let savedEvent = calendarEvent;
    try {
      savedEvent = await apiRequest<CalendarEvent>('events', { method: 'POST', body: JSON.stringify(calendarEvent) });
      setDataError('');
    } catch {
      setDataError('Backend unavailable. The study session is saved locally.');
    }
    setState((previous) => ({ ...previous, events: [savedEvent, ...previous.events.filter((item) => item.id !== savedEvent.id)] }));
  }, []);

  const saveTaskRecord = useCallback(async (task: Task) => {
    let savedTask = task;
    try {
      savedTask = await apiRequest<Task>('tasks', { method: 'POST', body: JSON.stringify(task) });
      setDataError('');
    } catch {
      setDataError('Backend unavailable. The task is saved locally.');
    }
    setState((previous) => ({ ...previous, tasks: [savedTask, ...previous.tasks.filter((item) => item.id !== savedTask.id)] }));
  }, []);

  const saveNoteRecord = useCallback(async (note: Note) => {
    let savedNote = note;
    try {
      savedNote = await apiRequest<Note>('notes', { method: 'POST', body: JSON.stringify(note) });
      setDataError('');
    } catch {
      setDataError('Backend unavailable. The note is saved locally.');
    }
    setState((previous) => ({ ...previous, notes: [savedNote, ...previous.notes.filter((item) => item.id !== savedNote.id)] }));
  }, []);

  const setStudyGoals = useCallback((dailyGoalMinutes: number, weeklyGoalMinutes: number) => {
    setState((previous) => ({ ...previous, settings: { ...previous.settings, dailyGoalMinutes, weeklyGoalMinutes } }));
  }, []);

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppState>;
      if (!parsed || !Array.isArray(parsed.sessions) || !Array.isArray(parsed.notes) || !Array.isArray(parsed.tasks)) {
        throw new Error('The selected file is not a Student AI Desk backup.');
      }
      if (window.confirm('Restore this backup? Current app data will be replaced.')) {
        const restored = normalizeState(parsed);
        setState(restored);
        const syncCollection = async <T extends { id: string }>(resource: string, items: T[]) => {
          const remote = await apiRequest<T[]>(resource);
          const wanted = new Set(items.map((item) => item.id));
          await Promise.all(remote.filter((item) => !wanted.has(item.id)).map((item) => apiRequest(`${resource}/${item.id}`, { method: 'DELETE' })));
          await Promise.all(items.map((item) => apiRequest<T>(`${resource}/${remote.some((saved) => saved.id === item.id) ? `${item.id}` : ''}`.replace(/\/$/, ''), {
            method: remote.some((saved) => saved.id === item.id) ? 'PUT' : 'POST',
            body: JSON.stringify(item),
          })));
        };
        try {
          await Promise.all([
            syncCollection('notes', restored.notes),
            syncCollection('tasks', restored.tasks),
            syncCollection('events', restored.events),
            ...(['subjects', 'exams', 'grades', 'attendance', 'studySessions', 'snippets', 'vaultItems'] as const).map((collection) => syncCollection<AcademicRecord>(`academic/${collection}`, restored[collection] as AcademicRecord[])),
          ]);
          setDataError('Backup restored to local state and SQLite.');
        } catch {
          setDataError('Backup restored locally. Reconnect the backend to sync it to SQLite.');
        }
      }
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Could not restore this backup.');
    }
  };

  const updateSetting = <K extends keyof AppState['settings']>(key: K, value: AppState['settings'][K]) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, [key]: value },
    }));
  };

  const updatePlugin = (plugin: keyof AppState['settings']['plugins'], enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        plugins: {
          ...prev.settings.plugins,
          [plugin]: enabled,
        },
      },
    }));
  };

  const generateSummary = () => {
    const clean = docSummaryText.trim();
    if (!clean) return;

    fetch(`${API_BASE_URL}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean,
        provider: state.settings.provider,
        apiKey: state.settings.apiKey,
        baseUrl: state.settings.baseUrl,
        model: state.settings.model,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Summary failed');
        }

        const data = await response.json();
        setSummaryResult(data.summary || 'Summary is unavailable for this text.');
      })
      .catch(() => {
        const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
        const top = sentences.slice(0, Math.min(3, sentences.length));
        if (top.length === 0) {
          setSummaryResult('Summary is unavailable for this text.');
          return;
        }

        const summary = top.join(' ');
        setSummaryResult(summary.length > 400 ? `${summary.slice(0, 400)}...` : summary);
      });
  };

  const addNoteAttachment = async () => {
    if (window.electronAPI?.selectVaultPath) {
      const selected = await window.electronAPI.selectVaultPath('file');
      if (selected) setNoteAttachments((previous) => [...previous, selected.path]);
      return;
    }
    setDataError('Open the desktop app to link a file attachment to a note.');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-icon"><Bot size={20} strokeWidth={1.8} /></div>
          <div>
            <strong>STUDENT / AI</strong>
            <small>DESK SYSTEMS</small>
          </div>
        </div>

        <nav className="nav">
          <span className="nav-caption">WORKSPACE</span>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={activeTab === id ? 'nav-btn active' : 'nav-btn'}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {activeTab === id && <ChevronRight className="nav-active-mark" size={14} />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-privacy"><ShieldCheck size={15} /><span>Private workspace</span><span className="privacy-dot" /></div>
          <div className="profile-card">
            <div className="profile-avatar">{state.profile.name.slice(0, 1).toUpperCase()}</div>
            <div><strong>{state.profile.name}</strong><span>{state.profile.major}</span></div>
            <button className="icon-button profile-settings" onClick={() => setActiveTab('settings')} aria-label="Open settings" title="Open settings"><Settings2 size={16} /></button>
          </div>
        </div>

      </aside>

      <main className="main-panel">
        {dataError && <div className="api-error" role="alert">{dataError}</div>}
        <Suspense fallback={<section className="panel workspace-panel"><div className="workspace-loading"><span /><span /><span /></div></section>}>
        {activeTab === 'dashboard' && (
          <StudentDashboard state={state} onNavigate={setActiveTab} />
        )}

        {activeTab === 'academic' && <AcademicHub state={state} onSaveRecord={saveAcademicRecord} onUpdateRecord={updateAcademicRecord} onDeleteRecord={deleteAcademicRecord} onSaveNote={saveNoteRecord} />}
        {activeTab === 'study' && <StudyCenter state={state} onSaveRecord={saveAcademicRecord} onSetStudyGoals={setStudyGoals} />}
        {activeTab === 'exams' && <ExamCenter state={state} onSaveRecord={saveAcademicRecord} onUpdateRecord={updateAcademicRecord} onSaveEvent={saveCalendarRecord} />}
        {activeTab === 'studentTools' && <StudentTools state={state} />}
        {activeTab === 'devTools' && <DeveloperWorkspace state={state} onSaveRecord={saveAcademicRecord} onDeleteRecord={deleteAcademicRecord} />}
        {activeTab === 'performance' && <PerformanceDashboard state={state} />}
        {activeTab === 'files' && <FileVault state={state} onSaveRecord={saveAcademicRecord} onUpdateRecord={updateAcademicRecord} onDeleteRecord={deleteAcademicRecord} />}

        {activeTab === 'chat' && (
          <section className="panel chat-panel">
            <div className="chat-topbar">
              <div className="breadcrumb"><span>WORKSPACE</span><ChevronRight size={13} /><strong>AI ASSISTANT</strong></div>
              <div className="topbar-actions">
                <span className="connection-status"><span /> SYSTEM ONLINE</span>
                <button className="icon-button" onClick={createNewSession} aria-label="Start new conversation" title="Start new conversation"><SquarePen size={17} /></button>
                <button className="icon-button" onClick={() => setActiveTab('settings')} aria-label="Open AI settings" title="Open AI settings"><Settings2 size={17} /></button>
              </div>
            </div>

            <div className="chat-workspace">
              <section className="assistant-stage">
                <div className="stage-grain" />
                <div className="stage-orbit stage-orbit-one" />
                <div className="stage-orbit stage-orbit-two" />
                <div className="stage-label"><span className="stage-live-dot" /> LIVE COMPANION <span>·</span> {state.settings.provider.toUpperCase()}</div>
                <Suspense fallback={<div className="bot-loading" aria-label="Loading assistant"><span /><span /><span /></div>}>
                  <AssistantBot isThinking={isBusy} isSpeaking={isSpeaking} />
                </Suspense>
                <div className="assistant-identity">
                  <span className="assistant-eyebrow"><Sparkles size={13} /> YOUR STUDY PARTNER</span>
                  <h1>NOVA<span>.</span></h1>
                  <p>{isBusy ? 'Thinking through it...' : isSpeaking ? 'I’m right here.' : 'Ready for whatever’s on your mind.'}</p>
                </div>
                <div className="stage-controls">
                  <button className={voiceEnabled ? 'round-control selected' : 'round-control'} onClick={() => setVoiceEnabled((enabled) => !enabled)} aria-label={voiceEnabled ? 'Disable spoken replies' : 'Enable spoken replies'} aria-pressed={voiceEnabled} title={voiceEnabled ? 'Disable spoken replies' : 'Enable spoken replies'}><Volume2 size={17} /></button>
                  <span>{voiceEnabled ? 'VOICE ON' : 'VOICE OFF'}</span>
                </div>
                <div className="stage-corner stage-corner-left"><span>CORE</span><strong>STUDY / 01</strong></div>
                <div className="stage-corner stage-corner-right"><Activity size={14} /><span>NEURAL LINK</span><strong>ACTIVE</strong></div>
              </section>

              <section className="conversation-panel" aria-label="Conversation">
                <div className="conversation-heading">
                  <div><span className="conversation-kicker">YOUR SPACE TO THINK</span><h2>Let’s figure it out.</h2></div>
                  <span className="model-chip"><span /> {state.settings.provider === 'local' ? 'LOCAL MODE' : state.settings.provider.toUpperCase()}</span>
                </div>
                <div className="messages" ref={messagesRef} aria-live="polite">
                  {currentSession.messages.map((message) => (
                    <div key={message.id} className={`message ${message.role}`}>
                      {message.role === 'assistant' && <div className="message-avatar"><Bot size={15} /></div>}
                      <div className="bubble">
                        <span className="message-role">{message.role === 'user' ? 'YOU' : 'NOVA'}</span>
                        <p>{message.content}</p>
                      </div>
                    </div>
                  ))}
                  {isBusy && <div className="message assistant"><div className="message-avatar"><Bot size={15} /></div><div className="bubble thinking-bubble"><span className="message-role">NOVA</span><div className="thinking-indicator"><i /><i /><i /><span>Thinking</span></div></div></div>}
                </div>
                {currentSession.messages.length <= 1 && (
                  <div className="starter-prompts">
                    <button onClick={() => setDraft('Explain recursion with a simple example')}><CircleHelp size={15} /> Explain a concept</button>
                    <button onClick={() => setDraft('/task Review data structures')}><Check size={15} /> Plan a study task</button>
                    <button onClick={() => setDraft('Help me understand my next exam topic')}><BookOpen size={15} /> Prep for an exam</button>
                  </div>
                )}

                <div className="composer-wrap">
                  <div className="command-tools" aria-label="Assistant tools">
                    <span><Wrench size={13} /> TOOLS</span>
                    <button onClick={() => setDraft('/task ')}><Plus size={13} /> Task</button>
                    <button onClick={() => setDraft('/note  :: ')}><FileText size={13} /> Note</button>
                    <button onClick={() => setDraft(`/event ${localDateString()} `)}><CalendarDays size={13} /> Event</button>
                    <button onClick={() => setDraft('/help')}><Command size={13} /> Commands</button>
                  </div>
                  <div className="composer">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="Ask anything, or type /help for app commands..."
                      rows={2}
                      aria-label="Message the AI assistant"
                    />
                    <div className="composer-footer">
                      <span><Search size={13} /> AI TOOLS {state.settings.enableWebSearch ? 'READY' : 'LIMITED'}</span>
                      <div className="composer-actions">
                        <button className={isListening ? 'icon-button listening' : 'icon-button'} onClick={toggleVoiceInput} aria-label={isListening ? 'Stop voice input' : 'Start voice input'} title={isListening ? 'Stop voice input' : 'Start voice input'}><Mic size={17} /></button>
                        <button className="send-button" onClick={() => void sendMessage()} disabled={isBusy || !draft.trim()} aria-label="Send message" title="Send message"><ArrowUp size={17} /></button>
                      </div>
                    </div>
                  </div>
                  <div className="composer-disclaimer"><ShieldCheck size={12} /> Private by design <span>·</span> Return to send <span>·</span> Shift + Return for a new line</div>
                </div>
              </section>
            </div>
          </section>
        )}

        {activeTab === 'notes' && (
          <section className="panel workspace-panel knowledge-workspace">
            <div className="knowledge-heading">
              <div><span>YOUR PERSONAL REFERENCE SYSTEM</span><h1>Knowledge Base</h1><p>Notes with context, not just scraps of text.</p></div>
              <span className="knowledge-count">{state.notes.length} NOTES</span>
            </div>
            <div className="knowledge-layout">
              <section className="knowledge-editor workspace-section">
                <div className="section-title"><div><span>{editingNoteId ? 'EDIT ENTRY' : 'CAPTURE AN IDEA'}</span><h2>{editingNoteId ? 'Continue your note' : 'Make a note useful.'}</h2></div></div>
                <input aria-label="Note title" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Give this a clear title" />
                <div className="form-split">
                  <input aria-label="Note folder" value={noteFolder} onChange={(event) => setNoteFolder(event.target.value)} placeholder="Folder, e.g. Databases" />
                  <input aria-label="Note tags" value={noteTags} onChange={(event) => setNoteTags(event.target.value)} placeholder="Tags, comma separated" />
                </div>
                <select aria-label="Link note to subject" value={noteSubjectId} onChange={(event) => setNoteSubjectId(event.target.value)}>
                  <option value="">No linked subject</option>
                  {state.subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}
                </select>
                <div className="form-split">
                  <select aria-label="Link note to task" value={noteTaskId} onChange={(event) => setNoteTaskId(event.target.value)}><option value="">No linked task</option>{state.tasks.map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select>
                  <select aria-label="Link note to exam" value={noteExamId} onChange={(event) => setNoteExamId(event.target.value)}><option value="">No linked exam</option>{state.exams.map((exam) => <option value={exam.id} key={exam.id}>{exam.title}</option>)}</select>
                </div>
                <div className="markdown-toolbar"><span>MARKDOWN</span><button className={notePreview ? 'active' : ''} onClick={() => setNotePreview((preview) => !preview)}>{notePreview ? 'Edit' : 'Preview'}</button></div>
                {notePreview
                  ? <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]}>{noteBody || '*Nothing to preview yet.*'}</ReactMarkdown></div>
                  : <textarea className="knowledge-note-input" aria-label="Note body in markdown" value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder={'Write a thought, a theorem, or a code idea…\n\nMarkdown works: **bold**, `code`, lists, tables.'} rows={8} />}
                <div className="note-attachments">
                  <button type="button" className="subtle-button" onClick={() => void addNoteAttachment()}><Plus size={14} /> Attach a file reference</button>
                  {noteAttachments.map((attachment) => <span key={attachment}>{attachment.split(/[\\/]/).pop()}<button onClick={() => setNoteAttachments((previous) => previous.filter((item) => item !== attachment))} aria-label="Remove attachment"><X size={12} /></button></span>)}
                </div>
                <div className="inline-actions">
                  <button onClick={() => void saveNote()}><Check size={14} /> {editingNoteId ? 'Update note' : 'Save note'}</button>
                  {editingNoteId && <button className="subtle-button" onClick={() => { setEditingNoteId(null); setNoteTitle(''); setNoteBody(''); setNoteTags(''); setNoteAttachments([]); }}>Cancel</button>}
                </div>
                <div className="summary-box note-summary">
                  <div className="section-title"><div><span>FROM SOURCE TO SIGNAL</span><h3>Summarize a lecture or PDF</h3></div></div>
                  <textarea value={docSummaryText} onChange={(event) => setDocSummaryText(event.target.value)} placeholder="Drop in lecture text or choose a PDF. NOVA can condense it into a review-ready summary." rows={3} />
                  <label className="upload-box"><span>Choose a .txt or .pdf</span><input type="file" accept=".txt,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleDocumentUpload(file); }} /></label>
                  <button className="subtle-button" onClick={generateSummary}><Sparkles size={14} /> Summarize</button>
                  {summaryResult && <div className="summary-result">{summaryResult}</div>}
                </div>
              </section>
              <section className="knowledge-library">
                <div className="knowledge-search"><Search size={16} /><input aria-label="Search notes" placeholder="Search notes, tags, and folders" value={noteSearch} onChange={(event) => setNoteSearch(event.target.value)} /></div>
                <div className="note-filter-row">
                  {([{ id: 'all', label: 'All notes' }, { id: 'favorites', label: 'Favorites' }, { id: 'pinned', label: 'Pinned' }] as const).map((filter) => <button key={filter.id} className={noteFilter === filter.id ? 'selected' : ''} onClick={() => setNoteFilter(filter.id)}>{filter.label}</button>)}
                </div>
                <div className="folder-filter-row"><span>FOLDERS</span><button className="folder-pill selected" onClick={() => setNoteSearch('')}>Everything</button>{noteFolders.map((folder) => <button key={folder} className="folder-pill" onClick={() => setNoteSearch(folder)}><Folder size={12} /> {folder}</button>)}</div>
                <div className="knowledge-note-list">
                  {visibleNotes.map((note) => {
                    const subject = state.subjects.find((item) => item.id === note.subjectId);
                    return (
                      <article key={note.id} className={`knowledge-note ${note.pinned ? 'pinned' : ''}`}>
                        <div className="knowledge-note-meta"><span>{note.folder || 'General'}</span><small>{new Date(note.createdAt).toLocaleDateString()}</small></div>
                        <div className="knowledge-note-title">
                          <h2>{note.title}</h2>
                          <div>
                            <button className={`icon-button ${note.pinned ? 'note-action-active' : ''}`} aria-label={note.pinned ? 'Unpin note' : 'Pin note'} title={note.pinned ? 'Unpin note' : 'Pin note'} onClick={() => void updateNoteMetadata(note, { pinned: !note.pinned })}><Pin size={14} /></button>
                            <button className={`icon-button ${note.favorite ? 'note-action-active' : ''}`} aria-label={note.favorite ? 'Remove favorite' : 'Favorite note'} title={note.favorite ? 'Remove favorite' : 'Favorite note'} onClick={() => void updateNoteMetadata(note, { favorite: !note.favorite })}><Star size={14} /></button>
                          </div>
                        </div>
                        <div className="knowledge-note-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body}</ReactMarkdown></div>
                        <div className="note-tag-row">{(note.tags ?? []).map((tag) => <span key={tag}>#{tag}</span>)}{subject && <span className="linked-subject"><BookOpen size={11} /> {subject.name}</span>}{note.taskId && <span className="linked-task"><Check size={11} /> {state.tasks.find((task) => task.id === note.taskId)?.title || 'Linked task'}</span>}{note.examId && <span className="linked-exam"><GraduationCap size={11} /> {state.exams.find((exam) => exam.id === note.examId)?.title || 'Linked exam'}</span>}</div>
                        {(note.attachments ?? []).length > 0 && <div className="note-attachment-list">{note.attachments?.map((attachment) => <button key={attachment} onClick={() => void window.electronAPI?.openVaultPath(attachment)}><FileText size={13} /> {attachment.split(/[\\/]/).pop()}</button>)}</div>}
                        <div className="item-actions"><button className="subtle-button" onClick={() => { setEditingNoteId(note.id); setNoteTitle(note.title); setNoteBody(note.body); setNoteFolder(note.folder || 'General'); setNoteTags((note.tags ?? []).join(', ')); setNoteSubjectId(note.subjectId || ''); setNoteTaskId(note.taskId || ''); setNoteExamId(note.examId || ''); setNoteAttachments(note.attachments ?? []); }}>Edit</button><button className="danger-btn" onClick={() => void deleteItem('notes', note.id)}>Delete</button></div>
                      </article>
                    );
                  })}
                  {visibleNotes.length === 0 && <div className="empty-state"><Search size={22} /><span>No notes match this view.</span></div>}
                </div>
              </section>
            </div>
          </section>
        )}

        {activeTab === 'tasks' && (
          <section className="panel">
            <div className="panel-header">
              <h2>Tasks</h2>
            </div>

            <div className="task-form">
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="Task title"
              />
              <input
                type="date"
                value={taskDueDate}
                onChange={(event) => setTaskDueDate(event.target.value)}
              />
              <select aria-label="Task kind" value={taskKind} onChange={(event) => setTaskKind(event.target.value as NonNullable<Task['kind']>)}><option value="task">Task</option><option value="assignment">Assignment</option></select>
              <select aria-label="Link task to subject" value={taskSubjectId} onChange={(event) => setTaskSubjectId(event.target.value)}><option value="">No linked subject</option>{state.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
              <button onClick={saveTask}>{editingTaskId ? 'Update task' : 'Add task'}</button>
              {editingTaskId && (
                <button type="button" className="secondary-btn" onClick={() => {
                  setEditingTaskId(null);
                  setTaskTitle('');
                  setTaskDueDate('');
                  setTaskKind('task');
                  setTaskSubjectId('');
                }}>Cancel</button>
              )}
            </div>

            <div className="quick-actions">
              {quickTaskSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  className="quick-pill"
                  onClick={() => setTaskTitle(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="planner-grid">
              {plannerDays.map((date) => {
                const iso = date.toISOString().slice(0, 10);
                const dayTasks = upcomingTasks.filter((task) => task.dueDate === iso);

                return (
                  <div key={iso} className="planner-day">
                    <strong>{date.toLocaleDateString(undefined, { weekday: 'short' })}</strong>
                    <span>{date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    <div className="planner-day-items">
                      {dayTasks.length === 0 ? (
                        <small className="planner-empty">Free</small>
                      ) : (
                        dayTasks.map((task) => (
                          <div key={task.id} className="planner-item">
                            {task.title}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="task-list">
              {upcomingTasks.map((task) => (
                <div key={task.id} className={`task-item ${task.done ? 'done' : ''}`}>
                  <label>
                    <input type="checkbox" checked={task.done} onChange={() => void updateTask({ ...task, done: !task.done })} />
                    <span>{task.title}</span>
                  </label>
                  <small>{task.dueDate}</small>
                  <small>{task.kind === 'assignment' ? 'Assignment' : 'Task'}{task.subjectId ? ` · ${state.subjects.find((subject) => subject.id === task.subjectId)?.name ?? ''}` : ''}</small>
                  <div className="item-actions">
                    <button onClick={() => {
                      setEditingTaskId(task.id);
                      setTaskTitle(task.title);
                      setTaskDueDate(task.dueDate);
                      setTaskKind(task.kind || 'task');
                      setTaskSubjectId(task.subjectId || '');
                    }}>Edit</button>
                    <button className="danger-btn" onClick={() => void deleteItem('tasks', task.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'calendar' && (
          <section className="panel workspace-panel">
            <div className="panel-header">
              <div><span className="eyebrow-label">DEADLINES, CLASSES, INTENTIONAL TIME</span><h2>Planner</h2></div>
            </div>

            <div className="planner-toolbar"><div className="segmented-control">{(['day', 'week', 'month'] as const).map((view) => <button key={view} className={plannerView === view ? 'selected' : ''} onClick={() => setPlannerView(view)}>{view}</button>)}</div><label>Jump to date<input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></label><span>{plannerDates[0]?.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></div>
            <div className={`calendar-grid ${plannerView}`}>
              {plannerDates.map((date) => {
                const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const dayEvents = upcomingEvents.filter((item) => item.date === iso);
                const dayTasks = state.tasks.filter((item) => !item.done && item.dueDate === iso);
                const outsideMonth = plannerView === 'month' && date.getMonth() !== new Date(`${eventDate}T12:00:00`).getMonth();
                return <button key={iso} className={`calendar-cell ${outsideMonth ? 'outside-month' : ''} ${iso === localDateString() ? 'today' : ''}`} onClick={() => { setEventDate(iso); setEventType('study'); }}><span className="calendar-date-label">{plannerView === 'month' ? date.getDate() : `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${date.getDate()}`}</span>{dayEvents.slice(0, plannerView === 'month' ? 2 : 5).map((item) => <small key={item.id} className={`calendar-event-pill ${item.type}`}>{item.startTime ? `${item.startTime} ` : ''}{item.title}</small>)}{dayTasks.slice(0, 2).map((item) => <small key={item.id} className="calendar-task-pill">{item.title}</small>)}{dayEvents.length + dayTasks.length > (plannerView === 'month' ? 4 : 7) && <small className="calendar-more">+ more</small>}</button>;
              })}
            </div>

            <div className="event-form">
              <input
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                placeholder="Event title"
              />
              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
              />
              <select value={eventType} onChange={(event) => setEventType(event.target.value as CalendarEvent['type'])}>
                <option value="class">Class</option>
                <option value="assignment">Assignment</option>
                <option value="study">Study</option>
                <option value="personal">Personal</option>
                <option value="exam">Exam</option>
                <option value="quiz">Quiz</option>
                <option value="deadline">Deadline</option>
              </select>
              <div className="form-split"><label>Start time<input type="time" value={eventStartTime} onChange={(event) => setEventStartTime(event.target.value)} /></label><label>Duration in minutes<input type="number" min="5" step="5" value={eventDuration} onChange={(event) => setEventDuration(event.target.value)} /></label></div>
              <select aria-label="Link event to subject" value={eventSubjectId} onChange={(event) => setEventSubjectId(event.target.value)}><option value="">No linked subject</option>{state.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
              <textarea
                value={eventNotes}
                onChange={(event) => setEventNotes(event.target.value)}
                placeholder="Event notes"
                rows={3}
              />
              <button onClick={saveCalendarEvent}>{editingEventId ? 'Update event' : 'Add event'}</button>
              {editingEventId && (
                <button type="button" className="secondary-btn" onClick={() => {
                  setEditingEventId(null);
                  setEventTitle('');
                  setEventDate(new Date().toISOString().slice(0, 10));
                  setEventNotes('');
                  setEventType('study');
                }}>Cancel</button>
              )}
            </div>

            <div className="event-list">
              {upcomingEvents.map((event) => (
                <div key={event.id} className="event-item">
                  <div>
                    <strong>{event.title}</strong>
                    <small>{event.type} · {event.startTime ? `${event.startTime} · ` : ''}{event.durationMinutes ? `${event.durationMinutes} min` : ''}</small>
                  </div>
                  <span>{new Date(`${event.date}T00:00:00`).toLocaleDateString()}</span>
                  {state.subjects.find((subject) => subject.id === event.subjectId) && <small>{state.subjects.find((subject) => subject.id === event.subjectId)?.name}</small>}
                  {event.notes && <p>{event.notes}</p>}
                  <div className="item-actions">
                    <button onClick={() => {
                      setEditingEventId(event.id);
                      setEventTitle(event.title);
                      setEventDate(event.date);
                      setEventType(event.type);
                      setEventNotes(event.notes || '');
                      setEventStartTime(event.startTime || '18:00');
                      setEventDuration(String(event.durationMinutes || 60));
                      setEventSubjectId(event.subjectId || '');
                    }}>Edit</button>
                    <button className="danger-btn" onClick={() => void deleteItem('events', event.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'settings' && (
          <section className="panel workspace-panel">
            <div className="panel-header">
              <div><span className="eyebrow-label">YOUR WORKSPACE, YOUR RULES</span><h2>Settings</h2></div>
            </div>

            <div className="settings-grid">
              <div className="settings-section">
                <h3>Account & academic profile</h3>
                <label>Display name<input value={state.profile.name} onChange={(event) => setState((previous) => ({ ...previous, profile: { ...previous.profile, name: event.target.value } }))} /></label>
                <label>Major<input value={state.profile.major} onChange={(event) => setState((previous) => ({ ...previous, profile: { ...previous.profile, major: event.target.value } }))} /></label>
                <label>Year<input value={state.profile.year} onChange={(event) => setState((previous) => ({ ...previous, profile: { ...previous.profile, year: event.target.value } }))} /></label>
              </div>

              <div className="settings-section">
                <h3>AI connections</h3>
              <label>
                AI Provider
                <select value={state.settings.provider} onChange={(event) => updateSetting('provider', event.target.value as AppState['settings']['provider'])}>
                  <option value="local">Local</option>
                  <option value="openai">OpenAI</option>
                  <option value="claude">Claude</option>
                  <option value="gemini">Gemini</option>
                </select>
              </label>

              <label>
                API Key
                <input
                  type="password"
                  value={state.settings.apiKey}
                  onChange={(event) => updateSetting('apiKey', event.target.value)}
                  placeholder="sk-... or provider key"
                />
              </label>

              <label>
                Base URL
                <input
                  value={state.settings.baseUrl}
                  onChange={(event) => updateSetting('baseUrl', event.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </label>

              <label>
                Model
                <input
                  value={state.settings.model}
                  onChange={(event) => updateSetting('model', event.target.value)}
                  placeholder="gpt-4o-mini"
                />
              </label>

              <label>
                Privacy Mode
                <select value={state.settings.privacyMode} onChange={(event) => updateSetting('privacyMode', event.target.value as AppState['settings']['privacyMode'])}>
                  <option value="strict">Strict</option>
                  <option value="balanced">Balanced</option>
                  <option value="open">Open</option>
                </select>
              </label>
              </div>

              <div className="settings-section">
                <h3>Tool permissions</h3>
              <label className="toggle-row">
                <span>Enable web search</span>
                <input type="checkbox" checked={state.settings.enableWebSearch} onChange={(event) => updateSetting('enableWebSearch', event.target.checked)} />
              </label>

              <label className="toggle-row">
                <span>Enable cloud sync</span>
                <input type="checkbox" checked={state.settings.enableCloudSync} onChange={(event) => updateSetting('enableCloudSync', event.target.checked)} />
              </label>

              <label className="toggle-row">
                <span>Allow external tools</span>
                <input type="checkbox" checked={state.settings.allowExternalTools} onChange={(event) => updateSetting('allowExternalTools', event.target.checked)} />
              </label>

              <div className="plugin-box">
                <h3>Enabled plugins</h3>
                <label className="toggle-row">
                  <span>Math</span>
                  <input type="checkbox" checked={state.settings.plugins.math} onChange={(event) => updatePlugin('math', event.target.checked)} />
                </label>
                <label className="toggle-row">
                  <span>Search</span>
                  <input type="checkbox" checked={state.settings.plugins.search} onChange={(event) => updatePlugin('search', event.target.checked)} />
                </label>
                <label className="toggle-row">
                  <span>Notes</span>
                  <input type="checkbox" checked={state.settings.plugins.notes} onChange={(event) => updatePlugin('notes', event.target.checked)} />
                </label>
                <label className="toggle-row">
                  <span>Planner</span>
                  <input type="checkbox" checked={state.settings.plugins.planner} onChange={(event) => updatePlugin('planner', event.target.checked)} />
                </label>
              </div>
              </div>

              <div className="settings-section">
                <h3>Backup & restore</h3>
                <p className="muted-copy">Your backup includes app records and preferences. Store the file somewhere private; API keys in app settings are included.</p>
                <input ref={restoreInputRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importData(file); event.target.value = ''; }} />
                <div className="settings-actions"><button onClick={exportData}><ArrowDownToLine size={14} /> Export backup</button><button className="subtle-button" onClick={() => restoreInputRef.current?.click()}><FileText size={14} /> Restore backup</button><button className="danger-btn" onClick={resetData}><Trash2 size={14} /> Reset app</button></div>
              </div>

              <div className="settings-section">
                <h3>Security & privacy</h3>
                <div className="security-note"><ShieldCheck size={17} /><span>App data stays local unless you call an AI provider or use web search. API keys are currently stored in local app state and are not encrypted at rest.</span></div>
                <div className="security-note warning"><TriangleAlert size={17} /><span>A secure app lock and encrypted storage need OS-backed secret storage and recovery design; no password-only visual lock is being represented as protection.</span></div>
              </div>

              <div className="settings-section shortcuts-section">
                <h3>Keyboard shortcuts</h3>
                <div><span>Send a NOVA message</span><kbd>Enter</kbd></div><div><span>New line in a message</span><kbd>Shift</kbd> + <kbd>Enter</kbd></div><div><span>Open NOVA command list</span><kbd>/help</kbd></div>
              </div>
            </div>
          </section>
        )}
        </Suspense>
      </main>
    </div>
  );
}

export default App;
