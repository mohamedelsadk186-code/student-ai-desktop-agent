import { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { evaluate } from 'mathjs';
import { oneDark } from '@codemirror/theme-one-dark';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { csharp } from '@replit/codemirror-lang-csharp';
import QRCode from 'qrcode';
import {
  Activity, AlarmClock, ArrowDownToLine, ArrowRight, BookOpen, CalendarDays, Check,
  ChevronDown, ChevronUp, Clipboard, Code2, Copy, Download, File, FileCode2,
  FileText, Folder, FolderPlus, Gauge, GraduationCap, Layers3, Plus, Search,
  ShieldAlert, Sparkles, TimerReset, Trash2, TriangleAlert, Trophy, X,
} from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  AcademicCollection, AcademicExam, AcademicGrade, AcademicRecord, AppState,
  AttendanceRecord, CalendarEvent, CodeSnippet, Note, StudySession, Subject, Task, VaultItem,
} from './types';

const COLORS = ['#69e7df', '#95b7ff', '#e7b76c', '#e98a78', '#a9d89a', '#bb9df5'];
const today = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const formatMinutes = (minutes: number) => `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
const dayLabel = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function estimateGpa(state: AppState) {
  const bySubject = state.subjects.map((subject) => {
    const grades = state.grades.filter((grade) => grade.subjectId === subject.id);
    const score = grades.reduce((sum, grade) => sum + grade.score, 0);
    const outOf = grades.reduce((sum, grade) => sum + grade.outOf, 0);
    return { creditHours: subject.creditHours, normalized: outOf ? score / outOf : null };
  }).filter((item): item is { creditHours: number; normalized: number } => item.normalized !== null);
  const credits = bySubject.reduce((sum, item) => sum + item.creditHours, 0);
  if (!credits) return '--';
  return (bySubject.reduce((sum, item) => sum + item.normalized * 4 * item.creditHours, 0) / credits).toFixed(2);
}

interface WorkspaceProps {
  state: AppState;
  onSaveRecord: (collection: AcademicCollection, record: AcademicRecord) => Promise<void>;
  onUpdateRecord: (collection: AcademicCollection, record: AcademicRecord) => Promise<void>;
  onDeleteRecord: (collection: AcademicCollection, id: string) => Promise<void>;
  onSaveEvent: (event: CalendarEvent) => Promise<void>;
  onSaveTask: (task: Task) => Promise<void>;
  onSaveNote: (note: Note) => Promise<void>;
  onNavigate: (tab: 'academic' | 'calendar' | 'study' | 'exams' | 'performance' | 'tasks') => void;
  onSetStudyGoals: (daily: number, weekly: number) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

function WorkspaceHeading({ eyebrow, title, detail, icon: Icon }: { eyebrow: string; title: string; detail: string; icon: typeof BookOpen }) {
  return <div className="workspace-heading"><div className="workspace-heading-icon"><Icon size={20} /></div><div><span>{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div></div>;
}

function SubjectChip({ subject }: { subject?: Subject }) {
  if (!subject) return <span className="subject-chip">UNASSIGNED</span>;
  return <span className="subject-chip" style={{ '--subject-color': subject.color } as React.CSSProperties}>{subject.code || subject.name}</span>;
}

export function StudentDashboard({ state, onNavigate }: Pick<WorkspaceProps, 'state' | 'onNavigate'>) {
  const now = new Date();
  const isoToday = today();
  const todayWeekday = now.getDay();
  const todayClasses = state.subjects.flatMap((subject) => subject.meetings
    .filter((meeting) => meeting.weekday === todayWeekday)
    .map((meeting) => ({ ...meeting, subject }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime)));
  const upcomingExams = [...state.exams].filter((exam) => exam.date >= isoToday).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const pendingTasks = state.tasks.filter((task) => !task.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const todayMinutes = state.studySessions.filter((session) => session.startedAt.slice(0, 10) === isoToday).reduce((sum, session) => sum + session.durationMinutes, 0);
  const attendanceRate = state.attendance.length ? Math.round(state.attendance.filter((record) => record.status !== 'absent').length / state.attendance.length * 100) : 0;
  const gpa = estimateGpa(state);
  const weekData = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - 6 + index);
    const day = date.toISOString().slice(0, 10);
    return { day: date.toLocaleDateString(undefined, { weekday: 'short' }), minutes: state.studySessions.filter((session) => session.startedAt.slice(0, 10) === day).reduce((sum, session) => sum + session.durationMinutes, 0) };
  });
  const deadlineEvents = state.events.filter((event) => event.date >= isoToday && ['assignment', 'deadline', 'exam', 'quiz'].includes(event.type)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const metrics = [
    { label: 'STUDY TIME', value: formatMinutes(todayMinutes), hint: `Daily target ${formatMinutes(state.settings.dailyGoalMinutes)}`, icon: AlarmClock, tint: 'mint' },
    { label: 'CURRENT GPA', value: gpa, hint: `${state.grades.length} graded records`, icon: GraduationCap, tint: 'blue' },
    { label: 'ATTENDANCE', value: `${attendanceRate}%`, hint: `${state.attendance.length} classes recorded`, icon: Check, tint: 'gold' },
    { label: 'TO DO', value: String(pendingTasks.length), hint: pendingTasks[0] ? `Next: ${pendingTasks[0].title}` : 'Nothing overdue', icon: Layers3, tint: 'coral' },
  ];

  return <section className="panel workspace-panel dashboard-workspace">
    <div className="workspace-topline"><WorkspaceHeading eyebrow="YOUR CONTROL ROOM" title={`Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, ${state.profile.name}.`} detail="Your academic week, at a glance." icon={Gauge} /><button className="workspace-date" onClick={() => onNavigate('calendar')}><CalendarDays size={15} /> {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</button></div>
    <div className="metric-grid">{metrics.map(({ label, value, hint, icon: Icon, tint }) => <article className={`metric-tile ${tint}`} key={label}><div className="metric-tile-top"><span>{label}</span><Icon size={17} /></div><strong>{value}</strong><small>{hint}</small></article>)}</div>
    <div className="dashboard-main-grid">
      <section className="workspace-section progress-section"><div className="section-title"><div><span>CONSISTENCY</span><h2>Weekly study rhythm</h2></div><button className="text-action" onClick={() => onNavigate('performance')}>Performance <ArrowRight size={14} /></button></div><div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weekData} margin={{ top: 12, right: 8, bottom: 0, left: -22 }}><defs><linearGradient id="studyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#69e7df" stopOpacity={0.25} /><stop offset="95%" stopColor="#69e7df" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(180,210,210,.08)" vertical={false} /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#77898c', fontSize: 10 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#627579', fontSize: 9 }} /><Tooltip contentStyle={{ border: '1px solid #27383d', borderRadius: 7, color: '#e7f0f0', background: '#121b20' }} formatter={(value) => [`${value} min`, 'Study']} /><Area type="monotone" dataKey="minutes" stroke="#69e7df" strokeWidth={2} fill="url(#studyFill)" /></AreaChart></ResponsiveContainer></div><div className="goal-progress"><span>DAILY GOAL</span><div><i style={{ width: `${Math.min(100, Math.round(todayMinutes / Math.max(state.settings.dailyGoalMinutes, 1) * 100))}%` }} /></div><strong>{Math.min(100, Math.round(todayMinutes / Math.max(state.settings.dailyGoalMinutes, 1) * 100))}%</strong></div></section>
      <section className="workspace-section"><div className="section-title"><div><span>ON CAMPUS</span><h2>Today’s classes</h2></div><button className="text-action" onClick={() => onNavigate('academic')}>Academic hub <ArrowRight size={14} /></button></div><div className="timeline-list">{todayClasses.length ? todayClasses.map((meeting, index) => <div className="timeline-row" key={`${meeting.subject.id}-${index}`}><time>{meeting.startTime || '--:--'}</time><i style={{ '--subject-color': meeting.subject.color } as React.CSSProperties} /><div><strong>{meeting.subject.name}</strong><small>{meeting.room || 'Room not set'} · {meeting.endTime || 'Time TBD'}</small></div></div>) : <div className="empty-state"><CalendarDays size={20} /><span>No classes scheduled for today.</span><button onClick={() => onNavigate('academic')}>Add a subject</button></div>}</div></section>
      <section className="workspace-section"><div className="section-title"><div><span>FOCUS NEXT</span><h2>Upcoming exams</h2></div><button className="text-action" onClick={() => onNavigate('exams')}>Exam center <ArrowRight size={14} /></button></div><div className="exam-preview-list">{upcomingExams.length ? upcomingExams.map((exam) => { const subject = state.subjects.find((item) => item.id === exam.subjectId); const days = Math.ceil((new Date(`${exam.date}T00:00:00`).getTime() - new Date(`${isoToday}T00:00:00`).getTime()) / 86400000); return <div className="exam-preview" key={exam.id}><div className="exam-date-block"><strong>{new Date(`${exam.date}T00:00:00`).getDate()}</strong><span>{new Date(`${exam.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</span></div><div><strong>{exam.title}</strong><small><SubjectChip subject={subject} /> · {days === 0 ? 'Today' : `${days} days`}</small></div><ArrowRight size={15} /></div>; }) : <div className="empty-state compact"><GraduationCap size={19} /><span>No upcoming exams. Add one to build a study plan.</span><button onClick={() => onNavigate('exams')}>Add exam</button></div>}</div></section>
      <section className="workspace-section"><div className="section-title"><div><span>DON’T LOSE THE THREAD</span><h2>Deadlines & focus</h2></div><button className="text-action" onClick={() => onNavigate('tasks')}>All tasks <ArrowRight size={14} /></button></div><div className="deadline-list">{[...pendingTasks.slice(0, 3).map((task) => ({ title: task.title, date: task.dueDate, kind: task.kind === 'assignment' ? 'ASSIGNMENT' : 'TASK', id: task.id })), ...deadlineEvents.slice(0, 2).map((event) => ({ title: event.title, date: event.date, kind: event.type.toUpperCase(), id: event.id }))].slice(0, 4).map((item) => <div className="deadline-row" key={item.id}><span className="deadline-tag">{item.kind}</span><strong>{item.title}</strong><time>{dayLabel(item.date)}</time></div>)}{pendingTasks.length === 0 && deadlineEvents.length === 0 && <div className="empty-state compact"><Check size={18} /><span>Your week is clear.</span></div>}</div></section>
    </div>
  </section>;
}

export function AcademicHub({ state, onSaveRecord, onUpdateRecord, onDeleteRecord, onSaveNote }: Pick<WorkspaceProps, 'state' | 'onSaveRecord' | 'onUpdateRecord' | 'onDeleteRecord' | 'onSaveNote'>) {
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [instructor, setInstructor] = useState('');
  const [credits, setCredits] = useState('3');
  const [weekday, setWeekday] = useState('1');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:30');
  const [room, setRoom] = useState('');
  const [examTitle, setExamTitle] = useState('');
  const [examDate, setExamDate] = useState(today());
  const [examSubject, setExamSubject] = useState('');
  const [grade, setGrade] = useState('');
  const [gradeOutOf, setGradeOutOf] = useState('100');
  const [noteDraft, setNoteDraft] = useState('');
  const [search, setSearch] = useState('');
  const subjects = state.subjects.filter((subject) => `${subject.name} ${subject.code} ${subject.instructor}`.toLowerCase().includes(search.toLowerCase()));
  const selected = state.subjects.find((subject) => subject.id === selectedSubjectId) ?? state.subjects[0];
  const subjectExams = state.exams.filter((exam) => exam.subjectId === selected?.id);
  const subjectGrades = state.grades.filter((item) => item.subjectId === selected?.id);
  const subjectNotes = state.notes.filter((note) => note.subjectId === selected?.id);
  const attendance = state.attendance.filter((record) => record.subjectId === selected?.id);

  const addSubject = async () => {
    const name = subjectName.trim();
    if (!name) return;
    const subject: Subject = { id: makeId('subject'), name, code: subjectCode.trim(), instructor: instructor.trim(), creditHours: Math.max(1, Number(credits) || 3), color: COLORS[state.subjects.length % COLORS.length], meetings: [{ weekday: Number(weekday), startTime, endTime, room: room.trim() }] };
    await onSaveRecord('subjects', subject);
    setSelectedSubjectId(subject.id);
    setSubjectName(''); setSubjectCode(''); setInstructor(''); setRoom('');
  };

  const addExam = async (subjectIdOverride = examSubject) => {
    if (!examTitle.trim() || !subjectIdOverride) return;
    const exam: AcademicExam = { id: makeId('exam'), subjectId: subjectIdOverride, title: examTitle.trim(), type: 'midterm', date: examDate, syllabus: '', createdAt: new Date().toISOString() };
    await onSaveRecord('exams', exam); setExamTitle('');
  };

  const addGrade = async () => {
    const score = Number(grade); const outOf = Number(gradeOutOf);
    if (!selected || !Number.isFinite(score) || !Number.isFinite(outOf) || outOf <= 0 || score < 0 || score > outOf) return;
    const item: AcademicGrade = { id: makeId('grade'), subjectId: selected.id, title: 'Course assessment', score, outOf, createdAt: new Date().toISOString() };
    await onSaveRecord('grades', item); setGrade('');
  };

  const markAttendance = async (status: AttendanceRecord['status']) => {
    if (!selected) return;
    const existing = state.attendance.find((record) => record.subjectId === selected.id && record.date === today());
    const record: AttendanceRecord = { id: existing?.id ?? makeId('attendance'), subjectId: selected.id, date: today(), status };
    if (existing) await onUpdateRecord('attendance', record); else await onSaveRecord('attendance', record);
  };

  const saveSubjectNote = async () => {
    if (!selected || !noteDraft.trim()) return;
    await onSaveNote({ id: makeId('note'), title: `${selected.code || selected.name} note`, body: noteDraft.trim(), createdAt: new Date().toISOString(), folder: selected.name, tags: [selected.code || selected.name], subjectId: selected.id });
    setNoteDraft('');
  };

  return <section className="panel workspace-panel"><WorkspaceHeading eyebrow="YOUR DEGREE, ORGANIZED" title="Academic Hub" detail="The moving parts of your semester, finally in one place." icon={BookOpen} />
    <div className="hub-layout"><aside className="subject-rail"><div className="subject-rail-heading"><span>MY SUBJECTS</span><span>{state.subjects.length.toString().padStart(2, '0')}</span></div><label className="inline-search"><Search size={14} /><input aria-label="Search subjects" placeholder="Find a subject" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="subject-rail-list">{subjects.map((subject) => <button key={subject.id} className={`subject-row ${selected?.id === subject.id ? 'selected' : ''}`} onClick={() => setSelectedSubjectId(subject.id)}><i style={{ background: subject.color }} /><span><strong>{subject.name}</strong><small>{subject.code || 'COURSE'} · {subject.creditHours} CREDITS</small></span><ChevronDown size={14} /></button>)}{subjects.length === 0 && <div className="empty-state compact"><BookOpen size={18} /><span>Add your first course to start the hub.</span></div>}</div>
      <form className="subject-add-form" onSubmit={(event) => { event.preventDefault(); void addSubject(); }}><span>ADD SUBJECT</span><input aria-label="Subject name" placeholder="e.g. Programming I" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} required /><div className="form-split"><input aria-label="Course code" placeholder="CS101" value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} /><input aria-label="Credit hours" type="number" min="1" max="12" value={credits} onChange={(event) => setCredits(event.target.value)} /></div><input aria-label="Instructor" placeholder="Instructor / الدكتور" value={instructor} onChange={(event) => setInstructor(event.target.value)} /><div className="form-split"><select aria-label="Class weekday" value={weekday} onChange={(event) => setWeekday(event.target.value)}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select><input aria-label="Classroom" placeholder="Room" value={room} onChange={(event) => setRoom(event.target.value)} /></div><div className="form-split"><input aria-label="Class starts" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /><input aria-label="Class ends" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></div><button type="submit"><Plus size={14} /> Add course</button></form></aside>
      <div className="subject-detail">{selected ? <><div className="subject-hero" style={{ '--subject-color': selected.color } as React.CSSProperties}><div><span>{selected.code || 'COURSE'} · {selected.creditHours} CREDIT HOURS</span><h2>{selected.name}</h2><p>{selected.instructor || 'Instructor not set'}</p></div><button className="icon-button" onClick={() => void onDeleteRecord('subjects', selected.id)} aria-label={`Remove ${selected.name}`} title="Remove subject"><Trash2 size={16} /></button><span className="subject-hero-mark">{selected.code.slice(0, 2) || 'A'}</span></div>
        <div className="subject-stat-row"><div><span>LECTURES</span><strong>{selected.meetings.length}</strong></div><div><span>ASSESSMENTS</span><strong>{subjectExams.length}</strong></div><div><span>GRADE RECORDS</span><strong>{subjectGrades.length}</strong></div><div><span>ATTENDANCE</span><strong>{attendance.length ? `${Math.round(attendance.filter((record) => record.status !== 'absent').length / attendance.length * 100)}%` : '--'}</strong></div></div>
        <div className="subject-content-grid"><section className="workspace-section"><div className="section-title"><div><span>LECTURES</span><h3>Weekly schedule</h3></div></div>{selected.meetings.map((meeting, index) => <div className="hub-list-row" key={`${selected.id}-${index}`}><CalendarDays size={16} /><div><strong>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][meeting.weekday]}</strong><small>{meeting.startTime}–{meeting.endTime} · {meeting.room || 'Room TBD'}</small></div></div>)}<div className="section-title compact-title"><div><span>ATTENDANCE</span><h3>Mark today</h3></div></div><div className="inline-actions"><button onClick={() => void markAttendance('present')}><Check size={13} /> Present</button><button className="subtle-button" onClick={() => void markAttendance('absent')}><X size={13} /> Absent</button></div></section>
          <section className="workspace-section"><div className="section-title"><div><span>EXAMS & QUIZZES</span><h3>Assessments</h3></div></div>{subjectExams.map((exam) => <div className="hub-list-row" key={exam.id}><GraduationCap size={16} /><div><strong>{exam.title}</strong><small>{dayLabel(exam.date)} · {exam.type}</small></div><button className="icon-button mini-icon" onClick={() => void onDeleteRecord('exams', exam.id)} aria-label={`Delete ${exam.title}`}><Trash2 size={13} /></button></div>)}{subjectExams.length === 0 && <p className="muted-copy">No assessments added yet.</p>}<div className="inline-form"><input aria-label="Assessment title" placeholder="Midterm / quiz title" value={examTitle} onChange={(event) => setExamTitle(event.target.value)} /><input aria-label="Assessment date" type="date" value={examDate} onChange={(event) => setExamDate(event.target.value)} /><button onClick={() => void addExam(selected.id)}><Plus size={13} /> Add exam</button></div></section>
          <section className="workspace-section"><div className="section-title"><div><span>GRADES</span><h3>Keep your progress</h3></div></div>{subjectGrades.map((item) => <div className="hub-list-row" key={item.id}><Trophy size={15} /><div><strong>{item.score} / {item.outOf}</strong><small>{dayLabel(item.createdAt.slice(0, 10))}</small></div><button className="icon-button mini-icon" onClick={() => void onDeleteRecord('grades', item.id)} aria-label="Delete grade"><Trash2 size={13} /></button></div>)}<div className="inline-form grade-form"><input aria-label="Grade score" type="number" min="0" placeholder="Score" value={grade} onChange={(event) => setGrade(event.target.value)} /><input aria-label="Grade maximum" type="number" min="1" value={gradeOutOf} onChange={(event) => setGradeOutOf(event.target.value)} /><button onClick={() => void addGrade()}><Plus size={13} /> Record</button></div></section>
          <section className="workspace-section"><div className="section-title"><div><span>KNOWLEDGE BASE</span><h3>Notes for this course</h3></div></div>{subjectNotes.map((note) => <div className="hub-list-row" key={note.id}><FileText size={15} /><div><strong>{note.title}</strong><small>{note.body.slice(0, 65)}</small></div></div>)}<textarea aria-label="Course note" className="compact-textarea" placeholder="Capture an idea for this subject..." value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /><button className="subtle-button" onClick={() => void saveSubjectNote()}><Plus size={13} /> Save to Knowledge Base</button></section></div>
      </> : <div className="hub-empty"><div><BookOpen size={28} /><h2>Your semester starts here.</h2><p>Add a subject to connect lectures, assessments, attendance, grades, and notes.</p></div></div>}</div>
    </div>
  </section>;
}

export function StudyCenter({ state, onSaveRecord, onSetStudyGoals }: Pick<WorkspaceProps, 'state' | 'onSaveRecord' | 'onSetStudyGoals'>) {
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [minutes, setMinutes] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const [customMinutes, setCustomMinutes] = useState('25');
  const [completed, setCompleted] = useState(false);
  const sessions = [...state.studySessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const todayMinutes = sessions.filter((session) => session.startedAt.slice(0, 10) === today()).reduce((sum, session) => sum + session.durationMinutes, 0);
  const weekMinutes = sessions.filter((session) => { const age = (Date.now() - new Date(session.startedAt).getTime()) / 86400000; return age < 7; }).reduce((sum, session) => sum + session.durationMinutes, 0);
  const dailyProgress = Math.min(100, Math.round(todayMinutes / Math.max(state.settings.dailyGoalMinutes, 1) * 100));
  const weeklyProgress = Math.min(100, Math.round(weekMinutes / Math.max(state.settings.weeklyGoalMinutes, 1) * 100));
  const studyDays = new Set(sessions.map((session) => session.startedAt.slice(0, 10)));
  let studyStreak = 0;
  const streakDate = new Date(`${today()}T12:00:00`);
  if (!studyDays.has(today())) streakDate.setDate(streakDate.getDate() - 1);
  while (studyDays.has(`${streakDate.getFullYear()}-${String(streakDate.getMonth() + 1).padStart(2, '0')}-${String(streakDate.getDate()).padStart(2, '0')}`)) {
    studyStreak += 1;
    streakDate.setDate(streakDate.getDate() - 1);
  }
  const timerLabel = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  const dailyBySubject = state.subjects.map((subject) => ({ ...subject, minutes: sessions.filter((session) => session.subjectId === subject.id && session.startedAt.slice(0, 10) === today()).reduce((sum, session) => sum + session.durationMinutes, 0) })).filter((subject) => subject.minutes > 0).sort((a, b) => b.minutes - a.minutes);

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => setRemaining((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [running, mode, minutes, onSaveRecord, subjectId]);

  useEffect(() => {
    if (!running || remaining !== 0) return;
    setRunning(false);
    setCompleted(true);
    if (mode === 'focus') {
      const record: StudySession = { id: makeId('study'), subjectId, durationMinutes: minutes, startedAt: new Date(Date.now() - minutes * 60000).toISOString() };
      void onSaveRecord('studySessions', record);
    }
  }, [running, remaining, mode, minutes, onSaveRecord, subjectId]);

  const chooseMode = (nextMode: 'focus' | 'break') => { setRunning(false); setMode(nextMode); const duration = nextMode === 'focus' ? minutes : 5; setRemaining(duration * 60); setCompleted(false); };
  const reset = () => { setRunning(false); setRemaining((mode === 'focus' ? minutes : 5) * 60); setCompleted(false); };
  const setFocusLength = () => { const value = Math.min(180, Math.max(1, Number(customMinutes) || 25)); setMinutes(value); setRemaining(value * 60); setRunning(false); };

  return <section className="panel workspace-panel"><WorkspaceHeading eyebrow="PROTECT YOUR ATTENTION" title="Study Center" detail="Focus in a way you can sustain. Your session history stays on this device." icon={AlarmClock} />
    <div className="study-layout"><div className="timer-column"><div className="timer-panel"><div className="timer-mode-switch"><button className={mode === 'focus' ? 'selected' : ''} onClick={() => chooseMode('focus')}>FOCUS</button><button className={mode === 'break' ? 'selected' : ''} onClick={() => chooseMode('break')}>SHORT BREAK</button></div><div className={`timer-face ${running ? 'is-running' : ''}`}><div className="timer-ring"><svg viewBox="0 0 260 260" aria-hidden="true"><circle className="timer-ring-track" cx="130" cy="130" r="118" /><circle className="timer-ring-progress" cx="130" cy="130" r="118" style={{ strokeDashoffset: 741 - 741 * (remaining / ((mode === 'focus' ? minutes : 5) * 60)) }} /></svg><div className="timer-readout"><strong>{timerLabel}</strong><span>{mode === 'focus' ? 'DEEP WORK' : 'RESET'}</span></div></div></div><label className="timer-subject">SESSION SUBJECT<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Independent study</option>{state.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><div className="timer-controls"><button className="timer-start" onClick={() => { if (mode === 'break') setRunning((value) => !value); else { if (completed || remaining === 0) setRemaining(minutes * 60); setCompleted(false); setRunning((value) => !value); } }}>{running ? 'Pause session' : mode === 'break' ? 'Start break' : completed ? 'Start again' : 'Start focus'}</button><button className="icon-button" onClick={reset} aria-label="Reset timer" title="Reset"><TimerReset size={18} /></button></div>{mode === 'focus' && <div className="timer-custom"><label>FOCUS LENGTH <input type="number" min="1" max="180" value={customMinutes} onChange={(event) => setCustomMinutes(event.target.value)} /></label><button onClick={setFocusLength}>Set</button></div>}{completed && <div className="success-inline"><Check size={14} /> Session logged. Take a short reset.</div>}</div>
      <div className="goal-settings"><div className="section-title"><div><span>YOUR BASELINE</span><h2>Set a study goal</h2></div></div><label>Daily goal <strong>{formatMinutes(state.settings.dailyGoalMinutes)}</strong><input type="range" min="30" max="600" step="15" value={state.settings.dailyGoalMinutes} onChange={(event) => onSetStudyGoals(Number(event.target.value), state.settings.weeklyGoalMinutes)} /></label><label>Weekly goal <strong>{formatMinutes(state.settings.weeklyGoalMinutes)}</strong><input type="range" min="120" max="3600" step="60" value={state.settings.weeklyGoalMinutes} onChange={(event) => onSetStudyGoals(state.settings.dailyGoalMinutes, Number(event.target.value))} /></label></div></div>
      <div className="study-aside"><div className="study-hero-stats"><div><span>TODAY</span><strong>{formatMinutes(todayMinutes)}</strong><small>{dailyProgress}% of daily goal</small><div className="progress-track"><i style={{ width: `${dailyProgress}%` }} /></div></div><div><span>THIS WEEK</span><strong>{formatMinutes(weekMinutes)}</strong><small>{weeklyProgress}% of weekly goal</small><div className="progress-track"><i style={{ width: `${weeklyProgress}%` }} /></div></div><div className="streak-stat"><span>STUDY STREAK</span><strong>{studyStreak} <small>days</small></strong><small>{studyStreak ? 'Keep the rhythm kind.' : 'Begin with one focus block.'}</small></div></div><section className="workspace-section"><div className="section-title"><div><span>TODAY BY SUBJECT</span><h2>Where your time went</h2></div></div>{dailyBySubject.length ? dailyBySubject.map((subject) => <div className="subject-time-row" key={subject.id}><i style={{ background: subject.color }} /><span>{subject.name}</span><strong>{formatMinutes(subject.minutes)}</strong></div>) : <div className="empty-state compact"><Activity size={18} /><span>Your first session will show up here.</span></div>}</section><section className="workspace-section"><div className="section-title"><div><span>RECENT SESSIONS</span><h2>Small wins add up</h2></div></div><div className="study-session-list">{sessions.slice(0, 6).map((session) => <div className="study-session-row" key={session.id}><span className="session-check"><Check size={12} /></span><span>{state.subjects.find((subject) => subject.id === session.subjectId)?.name || 'Independent study'}</span><strong>{formatMinutes(session.durationMinutes)}</strong><small>{new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div>)}{sessions.length === 0 && <p className="muted-copy">No sessions recorded yet.</p>}</div></section></div></div>
  </section>;
}

export function ExamCenter({ state, onSaveRecord, onUpdateRecord, onSaveEvent }: Pick<WorkspaceProps, 'state' | 'onSaveRecord' | 'onUpdateRecord' | 'onSaveEvent'>) {
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [date, setDate] = useState(today());
  const [type, setType] = useState<AcademicExam['type']>('midterm');
  const [syllabus, setSyllabus] = useState('');
  const [editingId, setEditingId] = useState('');
  const [grade, setGrade] = useState('');
  const exams = [...state.exams].sort((a, b) => a.date.localeCompare(b.date));
  const saveExam = async () => {
    if (!title.trim() || !subjectId) return;
    const previous = state.exams.find((exam) => exam.id === editingId);
    const exam: AcademicExam = { id: previous?.id ?? makeId('exam'), title: title.trim(), subjectId, date, type, syllabus: syllabus.trim(), grade: previous?.grade, createdAt: previous?.createdAt ?? new Date().toISOString() };
    if (previous) await onUpdateRecord('exams', exam); else await onSaveRecord('exams', exam);
    setTitle(''); setSyllabus(''); setEditingId('');
  };
  const makeStudyPlan = async (exam: AcademicExam) => {
    const subject = state.subjects.find((item) => item.id === exam.subjectId);
    const examDay = new Date(`${exam.date}T12:00:00`);
    for (let offset = 7; offset >= 1; offset -= 1) {
      const studyDay = new Date(examDay); studyDay.setDate(examDay.getDate() - offset);
      if (studyDay.getTime() < new Date(`${today()}T00:00:00`).getTime()) continue;
      const dateText = studyDay.toISOString().slice(0, 10);
      const exists = state.events.some((event) => event.type === 'study' && event.subjectId === exam.subjectId && event.date === dateText && event.notes?.includes(exam.id));
      if (!exists) await onSaveEvent({ id: makeId('event'), title: `Study for ${exam.title}`, date: dateText, type: 'study', subjectId: exam.subjectId, startTime: '18:00', durationMinutes: 60, notes: `Exam plan ${exam.id}`, createdAt: new Date().toISOString() });
    }
  };
  const recordGrade = async (exam: AcademicExam) => {
    const score = Number(grade);
    if (!Number.isFinite(score) || score < 0 || score > 100) return;
    await onUpdateRecord('exams', { ...exam, grade: score });
    await onSaveRecord('grades', { id: makeId('grade'), subjectId: exam.subjectId, title: exam.title, score, outOf: 100, createdAt: new Date().toISOString() });
    setGrade('');
  };

  return <section className="panel workspace-panel"><WorkspaceHeading eyebrow="PREP WITH INTENTION" title="Exam Center" detail="Dates, coverage, study plans, and results in one calm place." icon={GraduationCap} /><div className="exam-center-grid"><section className="workspace-section exam-editor"><div className="section-title"><div><span>{editingId ? 'EDIT ASSESSMENT' : 'ADD TO YOUR SEMESTER'}</span><h2>{editingId ? 'Update exam' : 'Schedule an exam'}</h2></div></div><label>Exam or quiz name<input placeholder="Midterm · chapters 1–5" value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="form-split"><label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Choose a subject</option>{state.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label><label>Assessment<select value={type} onChange={(event) => setType(event.target.value as AcademicExam['type'])}><option value="quiz">Quiz</option><option value="midterm">Midterm</option><option value="final">Final</option></select></label></div><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>Syllabus / coverage<textarea rows={4} placeholder="Topics, chapters, or learning outcomes" value={syllabus} onChange={(event) => setSyllabus(event.target.value)} /></label><div className="inline-actions"><button onClick={() => void saveExam()}><Plus size={14} /> {editingId ? 'Save changes' : 'Add exam'}</button>{editingId && <button className="subtle-button" onClick={() => setEditingId('')}>Cancel</button>}</div></section><section className="exam-list-column"><div className="section-title"><div><span>WHAT’S AHEAD</span><h2>Upcoming assessments</h2></div><span className="count-chip">{exams.length}</span></div>{exams.map((exam) => { const subject = state.subjects.find((item) => item.id === exam.subjectId); const days = Math.ceil((new Date(`${exam.date}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000); return <article className="exam-card" key={exam.id}><div className="exam-card-top"><div className="exam-date-block"><strong>{new Date(`${exam.date}T00:00:00`).getDate()}</strong><span>{new Date(`${exam.date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</span></div><div className="exam-card-title"><span>{exam.type.toUpperCase()} · {subject?.code || 'SUBJECT'}</span><h3>{exam.title}</h3><small>{subject?.name || 'Subject not set'} · {days < 0 ? 'Past exam' : days === 0 ? 'Today' : `${days} days left`}</small></div><button className="icon-button mini-icon" onClick={() => { setEditingId(exam.id); setTitle(exam.title); setSubjectId(exam.subjectId); setDate(exam.date); setType(exam.type); setSyllabus(exam.syllabus); }} aria-label="Edit exam"><FileText size={14} /></button></div><div className="exam-syllabus"><span>SYLLABUS</span><p>{exam.syllabus || 'No syllabus added yet.'}</p></div><div className="exam-actions"><button className="subtle-button" onClick={() => void makeStudyPlan(exam)}><CalendarDays size={13} /> Build 7-day plan</button>{exam.grade !== undefined ? <span className="grade-result">GRADE {exam.grade}%</span> : <div className="record-grade"><input aria-label={`Grade for ${exam.title}`} type="number" min="0" max="100" placeholder="Grade %" value={grade} onChange={(event) => setGrade(event.target.value)} /><button onClick={() => void recordGrade(exam)}>Record</button></div>}</div></article>; })}{exams.length === 0 && <div className="empty-state"><GraduationCap size={23} /><span>Your next exam can become a clear plan. Add one to begin.</span></div>}</section></div></section>;
}

export function PerformanceDashboard({ state }: Pick<WorkspaceProps, 'state'>) {
  const subjectData = state.subjects.map((subject) => {
    const grades = state.grades.filter((grade) => grade.subjectId === subject.id);
    const score = grades.reduce((sum, grade) => sum + grade.score, 0);
    const outOf = grades.reduce((sum, grade) => sum + grade.outOf, 0);
    const attendance = state.attendance.filter((record) => record.subjectId === subject.id);
    return { name: subject.code || subject.name.slice(0, 9), average: outOf ? Math.round(score / outOf * 100) : 0, attendance: attendance.length ? Math.round(attendance.filter((record) => record.status !== 'absent').length / attendance.length * 100) : 0, color: subject.color };
  });
  const totalStudy = state.studySessions.reduce((sum, session) => sum + session.durationMinutes, 0);
  const completeRate = state.tasks.length ? Math.round(state.tasks.filter((task) => task.done).length / state.tasks.length * 100) : 0;
  const average = subjectData.filter((subject) => subject.average).length ? Math.round(subjectData.filter((subject) => subject.average).reduce((sum, subject) => sum + subject.average, 0) / subjectData.filter((subject) => subject.average).length) : 0;
  const gpa = estimateGpa(state);
  const summary = `Academic performance: GPA ${gpa}; average recorded exam score ${average}%; task completion ${completeRate}%; total study time ${formatMinutes(totalStudy)}. ${subjectData.map((subject) => `${subject.name}: ${subject.average}% grade, ${subject.attendance}% attendance`).join('. ')}.`;

  return <section className="panel workspace-panel"><WorkspaceHeading eyebrow="PATTERNS, NOT PRESSURE" title="Performance" detail="Understand the semester through evidence you’ve recorded." icon={Activity} /><div className="performance-metrics"><div><span>ESTIMATED GPA</span><strong>{gpa}<small> / 4.00</small></strong><p>Credit-weighted from recorded grades</p></div><div><span>AVERAGE SCORE</span><strong>{average || '--'}{average ? '%' : ''}</strong><p>Across {state.grades.length} grade records</p></div><div><span>TASK COMPLETION</span><strong>{completeRate}%</strong><p>{state.tasks.filter((task) => task.done).length} of {state.tasks.length} tasks completed</p></div><div><span>STUDY TIME</span><strong>{formatMinutes(totalStudy)}</strong><p>{state.studySessions.length} focus sessions recorded</p></div></div><div className="performance-chart-grid"><section className="workspace-section"><div className="section-title"><div><span>SUBJECT COMPARISON</span><h2>Grades and attendance</h2></div></div>{subjectData.length ? <div className="chart-frame tall"><ResponsiveContainer width="100%" height="100%"><BarChart data={subjectData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}><CartesianGrid stroke="rgba(180,210,210,.08)" vertical={false} /><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#819195', fontSize: 10 }} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#687b7f', fontSize: 9 }} /><Tooltip contentStyle={{ border: '1px solid #27383d', borderRadius: 7, color: '#e7f0f0', background: '#121b20' }} /><Bar dataKey="average" name="Grade %" fill="#69e7df" radius={[4, 4, 0, 0]} /><Bar dataKey="attendance" name="Attendance %" fill="#95b7ff" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div> : <div className="empty-state"><BookOpen size={20} /><span>Add subjects and grades to see comparisons.</span></div>}</section><section className="workspace-section"><div className="section-title"><div><span>ATTENDANCE</span><h2>Class presence</h2></div></div>{subjectData.length ? <><div className="chart-frame attendance-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={subjectData} dataKey="attendance" nameKey="name" innerRadius="66%" outerRadius="88%" paddingAngle={3}>{subjectData.map((item, index) => <Cell key={item.name} fill={item.color || COLORS[index % COLORS.length]} />)}</Pie><Tooltip contentStyle={{ border: '1px solid #27383d', borderRadius: 7, color: '#e7f0f0', background: '#121b20' }} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{state.attendance.length ? Math.round(state.attendance.filter((record) => record.status !== 'absent').length / state.attendance.length * 100) : 0}%</strong><span>ATTENDANCE</span></div></div><div className="subject-performance-list">{subjectData.map((subject) => <div key={subject.name}><i style={{ background: subject.color }} /><span>{subject.name}</span><strong>{subject.attendance}%</strong></div>)}</div></> : <div className="empty-state"><Check size={20} /><span>Record class attendance in Academic Hub.</span></div>}</section></div><div className="nova-insight"><div><Sparkles size={17} /><span>NOVA · PERFORMANCE BRIEF</span></div><p>{subjectData.length ? summary : 'I can spot semester patterns once you add subjects, grades, attendance, and study sessions. Your academic data stays in your local workspace.'}</p></div></section>;
}

export function StudentTools({ state }: Pick<WorkspaceProps, 'state'>) {
  const [activeTool, setActiveTool] = useState('calculator');
  const [expression, setExpression] = useState('');
  const [gpaRows, setGpaRows] = useState([{ credits: '3', grade: '4.0' }, { credits: '3', grade: '3.5' }]);
  const [score, setScore] = useState(''); const [maximum, setMaximum] = useState('100');
  const [conversion, setConversion] = useState('101101'); const [conversionMode, setConversionMode] = useState('binary-decimal');
  const [bytes, setBytes] = useState('1024');
  const [startDate, setStartDate] = useState(today()); const [endDate, setEndDate] = useState(today());
  const [copied, setCopied] = useState(false);
  const gpa = useMemo(() => { const credits = gpaRows.reduce((sum, row) => sum + (Number(row.credits) || 0), 0); return credits ? (gpaRows.reduce((sum, row) => sum + (Number(row.grade) || 0) * (Number(row.credits) || 0), 0) / credits).toFixed(2) : '0.00'; }, [gpaRows]);
  let calculation = '';
  try { if (expression.trim()) calculation = String(evaluate(expression)); } catch { calculation = 'Check the expression'; }
  const percentage = Number(maximum) > 0 && score !== '' ? `${(Number(score) / Number(maximum) * 100).toFixed(2)}%` : '--';
  const binaryOutput = (() => { const number = conversion.trim(); try { if (conversionMode === 'binary-decimal') return /^[01]+$/.test(number) ? parseInt(number, 2).toString(10) : 'Enter binary digits'; if (conversionMode === 'decimal-binary') return Number.isFinite(Number(number)) ? Math.trunc(Number(number)).toString(2) : 'Enter a decimal number'; if (conversionMode === 'binary-hex') return /^[01]+$/.test(number) ? `0x${parseInt(number, 2).toString(16).toUpperCase()}` : 'Enter binary digits'; if (conversionMode === 'hex-binary') return /^[\da-f]+$/i.test(number.replace(/^0x/i, '')) ? parseInt(number.replace(/^0x/i, ''), 16).toString(2) : 'Enter hexadecimal'; return number; } catch { return 'Invalid input'; } })();
  const dayDifference = Math.ceil((new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86400000);
  const toolList = [{ id: 'calculator', label: 'Calculator', icon: Gauge }, { id: 'gpa', label: 'GPA', icon: GraduationCap }, { id: 'percentage', label: 'Percentage', icon: Activity }, { id: 'binary', label: 'Number systems', icon: Code2 }, { id: 'units', label: 'Data units', icon: Layers3 }, { id: 'dates', label: 'Date difference', icon: CalendarDays }];
  const copyResult = async (value: string) => { await navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };

  return <section className="panel workspace-panel"><WorkspaceHeading eyebrow="SMALL CALCULATIONS, LESS CONTEXT SWITCHING" title="Student Tools" detail="Everyday math and CS conversions, right where you study." icon={Gauge} /><div className="tools-workspace"><aside className="tools-rail">{toolList.map(({ id, label, icon: Icon }) => <button key={id} className={activeTool === id ? 'selected' : ''} onClick={() => setActiveTool(id)}><Icon size={16} />{label}<ArrowRight size={13} /></button>)}</aside><div className="tool-content">{activeTool === 'calculator' && <div className="tool-card"><span>SCIENTIFIC CALCULATOR</span><h2>Calculate without leaving your work.</h2><input className="tool-large-input" aria-label="Math expression" placeholder="e.g. sqrt(144) + sin(pi / 2)" value={expression} onChange={(event) => setExpression(event.target.value)} /><div className="tool-result"><small>RESULT</small><strong>{calculation || '0'}</strong><button className="icon-button" onClick={() => void copyResult(calculation)} aria-label="Copy result"><Copy size={15} /></button></div><p className="muted-copy">Supports expressions, exponents, trigonometry, logarithms, and constants via mathjs.</p></div>}{activeTool === 'gpa' && <div className="tool-card"><span>GPA CALCULATOR</span><h2>Credit-weight your grades.</h2><div className="gpa-rows">{gpaRows.map((row, index) => <div className="gpa-row" key={index}><label>Course {index + 1}<input type="number" min="1" max="12" aria-label={`Course ${index + 1} credit hours`} value={row.credits} onChange={(event) => setGpaRows((prev) => prev.map((item, rowIndex) => rowIndex === index ? { ...item, credits: event.target.value } : item))} /></label><label>Grade points<input type="number" min="0" max="4" step="0.1" aria-label={`Course ${index + 1} grade points`} value={row.grade} onChange={(event) => setGpaRows((prev) => prev.map((item, rowIndex) => rowIndex === index ? { ...item, grade: event.target.value } : item))} /></label><button className="icon-button" onClick={() => setGpaRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))} aria-label="Remove course"><X size={14} /></button></div>)}</div><button className="subtle-button" onClick={() => setGpaRows((prev) => [...prev, { credits: '3', grade: '4.0' }])}><Plus size={14} /> Add course</button><div className="tool-result"><small>ESTIMATED GPA · 4.0 SCALE</small><strong>{gpa}</strong></div></div>}{activeTool === 'percentage' && <div className="tool-card"><span>PERCENTAGE</span><h2>How much of the mark?</h2><div className="form-split"><label>Score<input type="number" value={score} onChange={(event) => setScore(event.target.value)} /></label><label>Out of<input type="number" min="1" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label></div><div className="tool-result"><small>RESULT</small><strong>{percentage}</strong></div></div>}{activeTool === 'binary' && <div className="tool-card"><span>NUMBER SYSTEMS</span><h2>Translate a value.</h2><select value={conversionMode} onChange={(event) => setConversionMode(event.target.value)}><option value="binary-decimal">Binary → Decimal</option><option value="decimal-binary">Decimal → Binary</option><option value="binary-hex">Binary → Hex</option><option value="hex-binary">Hex → Binary</option></select><input className="tool-large-input" value={conversion} onChange={(event) => setConversion(event.target.value)} aria-label="Value to convert" /><div className="tool-result"><small>CONVERTED VALUE</small><strong>{binaryOutput}</strong><button className="icon-button" onClick={() => void copyResult(binaryOutput)} aria-label="Copy converted value"><Copy size={15} /></button></div></div>}{activeTool === 'units' && <div className="tool-card"><span>DATA UNITS</span><h2>Bits, bytes, and storage.</h2><label>Bytes<input type="number" min="0" value={bytes} onChange={(event) => setBytes(event.target.value)} /></label><div className="conversion-list">{[{ unit: 'Bits', value: Number(bytes) * 8 }, { unit: 'Kilobytes (1024)', value: Number(bytes) / 1024 }, { unit: 'Megabytes (1024²)', value: Number(bytes) / 1048576 }, { unit: 'Gigabytes (1024³)', value: Number(bytes) / 1073741824 }].map((item) => <div key={item.unit}><span>{item.unit}</span><strong>{Number.isFinite(item.value) ? Number(item.value.toFixed(6)).toLocaleString() : '--'}</strong></div>)}</div></div>}{activeTool === 'dates' && <div className="tool-card"><span>DATE CALCULATOR</span><h2>Measure the time between.</h2><div className="form-split"><label>Start<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>End<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div><div className="tool-result"><small>{dayDifference >= 0 ? 'DAYS BETWEEN' : 'END DATE IS EARLIER'}</small><strong>{Math.abs(dayDifference)} days</strong></div></div>}<button className="copy-confirm" onClick={() => void copyResult(copied ? '' : `${gpa}`)}>{copied ? <Check size={14} /> : <Clipboard size={14} />}{copied ? 'Copied' : 'Copy result'}</button><div className="tools-note"><ShieldAlert size={14} /><span>GPA and grade conversions are estimates. Check your university’s official grading scale.</span></div></div></div></section>;
}

const languageExtensions: Record<string, () => ReturnType<typeof python>> = {
  Python: python, 'C / C++': cpp, 'C#': csharp, Java: java, JavaScript: javascript, SQL: sql, JSON: json,
};
const starterCode: Record<string, string> = {
  Python: 'def binary_search(values, target):\n    low, high = 0, len(values) - 1\n    while low <= high:\n        middle = (low + high) // 2\n        if values[middle] == target:\n            return middle\n        if values[middle] < target:\n            low = middle + 1\n        else:\n            high = middle - 1\n    return -1\n',
  'C / C++': '#include <vector>\n#include <iostream>\n\nint main() {\n    std::vector<int> values{2, 4, 8, 16};\n    for (const int value : values) {\n        std::cout << value << \'\\n\';\n    }\n}\n',
  'C#': 'using System;\n\npublic class Program\n{\n    public static void Main()\n    {\n        Console.WriteLine("Hello, campus!");\n    }\n}\n',
  Java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, campus!");\n    }\n}\n',
  JavaScript: 'const average = (values) =>\n  values.reduce((sum, value) => sum + value, 0) / values.length;\n\nconsole.log(average([82, 91, 76]));\n',
  SQL: 'SELECT subject, AVG(score * 100.0 / out_of) AS average_percent\nFROM grade_records\nGROUP BY subject\nORDER BY average_percent DESC;\n',
  JSON: '{\n  "student": "Ali",\n  "major": "Computer Science",\n  "focus": ["practice", "review", "reflect"]\n}\n',
};

export function DeveloperWorkspace({ state, onSaveRecord, onDeleteRecord }: Pick<WorkspaceProps, 'state' | 'onSaveRecord' | 'onDeleteRecord'>) {
  const [language, setLanguage] = useState('Python');
  const [code, setCode] = useState(starterCode.Python);
  const [snippetTitle, setSnippetTitle] = useState('Binary search');
  const [activeMode, setActiveMode] = useState<'editor' | 'utilities'>('editor');
  const [utility, setUtility] = useState('json');
  const [jsonInput, setJsonInput] = useState('{"student":"Ali","courses":["CS","Math"]}');
  const [jsonResult, setJsonResult] = useState('');
  const [regexPattern, setRegexPattern] = useState('\\b[A-Z]{2,}\\b');
  const [regexText, setRegexText] = useState('CS101 is part of the COMPUTER SCIENCE department.');
  const [base64Text, setBase64Text] = useState('Study smarter, not longer.');
  const [color, setColor] = useState('#69e7df');
  const [qrText, setQrText] = useState('https://example.edu');
  const [qrSource, setQrSource] = useState('');
  const [apiUrl, setApiUrl] = useState('https://jsonplaceholder.typicode.com/todos/1');
  const [apiMethod, setApiMethod] = useState('GET');
  const [apiBody, setApiBody] = useState('{\n  "title": "test"\n}');
  const [apiResult, setApiResult] = useState('');
  const [apiBusy, setApiBusy] = useState(false);
  const [apiStatus, setApiStatus] = useState('');
  const [uuid, setUuid] = useState(() => crypto.randomUUID());
  const [copied, setCopied] = useState(false);
  const snippets = [...state.snippets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const snippetRef = useRef<HTMLInputElement>(null);
  const extensions = languageExtensions[language]();
  const regexMatches = (() => { try { const matches = [...regexText.matchAll(new RegExp(regexPattern, 'g'))]; return { matches: matches.map((match) => match[0]), error: '' }; } catch (error) { return { matches: [], error: error instanceof Error ? error.message : 'Invalid expression' }; } })();
  const base64Encoded = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(base64Text))) : '';

  useEffect(() => { let active = true; void QRCode.toDataURL(qrText || ' ', { width: 180, margin: 2, color: { dark: '#eaf3f4', light: '#0e1419' } }).then((source) => { if (active) setQrSource(source); }).catch(() => setQrSource('')); return () => { active = false; }; }, [qrText]);
  const saveSnippet = async () => { if (!snippetTitle.trim()) { snippetRef.current?.focus(); return; } const item: CodeSnippet = { id: makeId('snippet'), title: snippetTitle.trim(), language, code, updatedAt: new Date().toISOString() }; await onSaveRecord('snippets', item); };
  const loadSnippet = (snippet: CodeSnippet) => { setSnippetTitle(snippet.title); setLanguage(snippet.language in languageExtensions ? snippet.language : 'Python'); setCode(snippet.code); setActiveMode('editor'); };
  const runApiRequest = async () => { setApiBusy(true); setApiResult(''); setApiStatus(''); try { const response = await fetch(apiUrl, { method: apiMethod, headers: apiMethod === 'GET' ? undefined : { 'Content-Type': 'application/json' }, body: ['GET', 'HEAD'].includes(apiMethod) ? undefined : apiBody }); const text = await response.text(); setApiStatus(`${response.status} ${response.statusText} · ${response.headers.get('content-type') || 'unknown content type'}`); try { setApiResult(JSON.stringify(JSON.parse(text), null, 2)); } catch { setApiResult(text); } } catch (error) { setApiStatus('Request blocked or unreachable'); setApiResult(error instanceof Error ? error.message : 'Network error'); } finally { setApiBusy(false); } };
  const copy = async (value: string) => { await navigator.clipboard?.writeText(value); setCopied(true); window.setTimeout(() => setCopied(false), 1200); };
  const encodeBase64 = () => { try { setBase64Text(`ENC:${btoa(unescape(encodeURIComponent(base64Text)))}`); } catch { setBase64Text('ENC:Input could not be encoded'); } };
  const decodeBase64 = () => { try { const raw = base64Text.replace(/^ENC:/, ''); setBase64Text(`DEC:${decodeURIComponent(escape(atob(raw)))}`); } catch { setBase64Text('DEC:Invalid Base64 input'); } };

  return <section className="panel workspace-panel developer-workspace"><WorkspaceHeading eyebrow="BUILD SOMETHING USEFUL" title="Developer Workspace" detail="A quiet place to sketch code, shape data, and test ideas." icon={Code2} /><div className="developer-tabs"><button className={activeMode === 'editor' ? 'active' : ''} onClick={() => setActiveMode('editor')}><FileCode2 size={15} /> Code Studio</button><button className={activeMode === 'utilities' ? 'active' : ''} onClick={() => setActiveMode('utilities')}><Layers3 size={15} /> Quick Utilities</button></div>{activeMode === 'editor' ? <div className="dev-editor-layout"><aside className="snippet-sidebar"><div><span>LANGUAGE</span><select value={language} onChange={(event) => { setLanguage(event.target.value); setCode(starterCode[event.target.value]); setSnippetTitle('Untitled snippet'); }}><option>Python</option><option>C / C++</option><option>C#</option><option>Java</option><option>JavaScript</option><option>SQL</option><option>JSON</option></select></div><div className="snippet-list-header"><span>SNIPPETS</span><button className="icon-button mini-icon" onClick={() => { setCode(starterCode[language]); setSnippetTitle('Untitled snippet'); }} aria-label="New snippet"><Plus size={14} /></button></div>{snippets.map((snippet) => <div className="snippet-row" key={snippet.id}><button onClick={() => loadSnippet(snippet)}><strong>{snippet.title}</strong><small>{snippet.language}</small></button><button className="icon-button mini-icon" onClick={() => void onDeleteRecord('snippets', snippet.id)} aria-label={`Delete ${snippet.title}`}><Trash2 size={13} /></button></div>)}{snippets.length === 0 && <p className="muted-copy">Saved snippets appear here.</p>}</aside><div className="editor-main"><div className="editor-toolbar"><label><span>FILE</span><input ref={snippetRef} value={snippetTitle} onChange={(event) => setSnippetTitle(event.target.value)} aria-label="Snippet title" /></label><span className="editor-language"><i /> {language}</span><button className="subtle-button" onClick={() => void copy(code)}><Copy size={13} /> {copied ? 'Copied' : 'Copy'}</button><button onClick={() => void saveSnippet()}><Download size={13} /> Save</button></div><div className="codemirror-shell"><CodeMirror value={code} height="420px" theme={oneDark} extensions={[extensions]} onChange={setCode} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, bracketMatching: true, autocompletion: true }} /></div><div className="editor-footnote"><ShieldAlert size={13} /> Code runs nowhere in this workspace; this is an editor and scratchpad.</div></div></div> : <div className="utility-workspace"><aside className="utility-rail">{[{ id: 'json', name: 'JSON formatter', icon: Code2 }, { id: 'regex', name: 'Regex tester', icon: Search }, { id: 'base64', name: 'Base64', icon: ArrowDownToLine }, { id: 'uuid', name: 'UUID generator', icon: Activity }, { id: 'color', name: 'Color picker', icon: Gauge }, { id: 'qr', name: 'QR generator', icon: Layers3 }, { id: 'api', name: 'API tester', icon: Activity }].map(({ id, name, icon: Icon }) => <button className={utility === id ? 'selected' : ''} key={id} onClick={() => setUtility(id)}><Icon size={14} />{name}</button>)}</aside><div className="utility-main">{utility === 'json' && <div className="utility-card"><span>JSON FORMATTER</span><h2>Make structured data readable.</h2><textarea className="utility-code" value={jsonInput} onChange={(event) => setJsonInput(event.target.value)} aria-label="JSON input" /><div className="inline-actions"><button onClick={() => { try { setJsonResult(JSON.stringify(JSON.parse(jsonInput), null, 2)); } catch { setJsonResult('Invalid JSON. Check commas, quotes, and brackets.'); } }}><Sparkles size={14} /> Format JSON</button><button className="subtle-button" onClick={() => void copy(jsonResult)}><Copy size={13} /> Copy</button></div>{jsonResult && <pre className="utility-output">{jsonResult}</pre>}</div>}{utility === 'regex' && <div className="utility-card"><span>REGEX TESTER</span><h2>See what your pattern catches.</h2><label>Pattern<input value={regexPattern} onChange={(event) => setRegexPattern(event.target.value)} /></label><label>Test text<textarea value={regexText} onChange={(event) => setRegexText(event.target.value)} /></label>{regexMatches.error ? <div className="inline-error"><TriangleAlert size={14} />{regexMatches.error}</div> : <div className="regex-results"><span>{regexMatches.matches.length} MATCHES</span>{regexMatches.matches.map((match, index) => <code key={`${match}-${index}`}>{match}</code>)}</div>}</div>}{utility === 'base64' && <div className="utility-card"><span>BASE64 ENCODER</span><h2>Encode or decode a string.</h2><textarea value={base64Text} onChange={(event) => setBase64Text(event.target.value.replace(/^(ENC:|DEC:)/, ''))} aria-label="Base64 text" /><div className="inline-actions"><button onClick={encodeBase64}>Encode</button><button className="subtle-button" onClick={decodeBase64}>Decode</button><button className="subtle-button" onClick={() => void copy(base64Text.replace(/^(ENC:|DEC:)/, ''))}><Copy size={13} /> Copy</button></div></div>}{utility === 'uuid' && <div className="utility-card"><span>UUID GENERATOR</span><h2>Fresh identifier, on demand.</h2><div className="uuid-value">{uuid}</div><div className="inline-actions"><button onClick={() => setUuid(crypto.randomUUID())}><Activity size={14} /> Generate</button><button className="subtle-button" onClick={() => void copy(uuid)}><Copy size={13} /> Copy</button></div></div>}{utility === 'color' && <div className="utility-card"><span>COLOR PICKER</span><h2>Choose a color, read its values.</h2><input type="color" className="color-control" value={color} onChange={(event) => setColor(event.target.value)} /><div className="color-swatches"><span style={{ background: color }} /><strong>{color.toUpperCase()}</strong><span>RGB {parseInt(color.slice(1, 3), 16)}, {parseInt(color.slice(3, 5), 16)}, {parseInt(color.slice(5, 7), 16)}</span></div><button onClick={() => void copy(color)}><Copy size={13} /> Copy hex</button></div>}{utility === 'qr' && <div className="utility-card"><span>QR GENERATOR</span><h2>Turn a link into a scannable code.</h2><input aria-label="QR code content" value={qrText} onChange={(event) => setQrText(event.target.value)} /><div className="qr-result">{qrSource && <img src={qrSource} alt="Generated QR code" />}</div>{qrSource && <a className="download-link" href={qrSource} download="student-desk-qr.png"><Download size={14} /> Download QR</a>}</div>}{utility === 'api' && <div className="utility-card"><span>HTTP API TESTER</span><h2>Send a simple request.</h2><label>Endpoint<input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} /></label><div className="api-request-row"><select value={apiMethod} onChange={(event) => setApiMethod(event.target.value)}><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select><button disabled={apiBusy} onClick={() => void runApiRequest()}>{apiBusy ? 'Sending…' : 'Send request'}</button></div>{!['GET', 'HEAD'].includes(apiMethod) && <label>JSON body<textarea className="utility-code short" value={apiBody} onChange={(event) => setApiBody(event.target.value)} /></label>}{apiStatus && <div className="api-result-status">{apiStatus}</div>}{apiResult && <pre className="utility-output">{apiResult}</pre>}<p className="muted-copy">Requests use your network and the destination’s CORS policy. Avoid entering secrets in public endpoints.</p></div>}</div></div>}</section>;
}

export function FileVault({ state, onSaveRecord, onUpdateRecord, onDeleteRecord }: Pick<WorkspaceProps, 'state' | 'onSaveRecord' | 'onUpdateRecord' | 'onDeleteRecord'>) {
  const [search, setSearch] = useState('');
  const [folderName, setFolderName] = useState('');
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'recent' | 'favorites'>('all');
  const importRef = useRef<HTMLInputElement>(null);
  const filtered = [...state.vaultItems].filter((item) => `${item.name} ${item.location} ${(item.tags ?? []).join(' ')}`.toLowerCase().includes(search.toLowerCase())).filter((item) => filter === 'favorites' ? item.favorite : filter === 'recent' ? Date.now() - new Date(item.addedAt).getTime() < 30 * 86400000 : true).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const addReference = async (kind: 'file' | 'folder') => {
    let picked: { path: string; name: string } | null = null;
    if (window.electronAPI?.selectVaultPath) picked = await window.electronAPI.selectVaultPath(kind);
    else if (kind === 'file') importRef.current?.click();
    if (picked) await onSaveRecord('vaultItems', { id: makeId('vault'), name: picked.name, kind, location: picked.path, addedAt: new Date().toISOString(), favorite: false, tags: [] } satisfies VaultItem);
  };
  const addFolder = async () => { if (!folderName.trim()) return; await onSaveRecord('vaultItems', { id: makeId('vault'), name: folderName.trim(), kind: 'folder', location: '', addedAt: new Date().toISOString(), favorite: false, tags: [] } satisfies VaultItem); setFolderName(''); };
  const fallbackFilePicked = async (file?: File) => { if (!file) return; await onSaveRecord('vaultItems', { id: makeId('vault'), name: file.name, kind: 'file', location: file.name, addedAt: new Date().toISOString(), favorite: false, tags: [] } satisfies VaultItem); };
  const toggleFavorite = async (item: VaultItem) => onUpdateRecord('vaultItems', { ...item, favorite: !item.favorite });

  return (
    <section className="panel workspace-panel">
      <WorkspaceHeading eyebrow="YOUR PATHS, YOUR CHOICE" title="File Vault" detail="Keep references to your study folders and files. Student Desk never moves or copies them." icon={Folder} />
      <input ref={importRef} type="file" hidden onChange={(event) => { void fallbackFilePicked(event.target.files?.[0]); event.target.value = ''; }} />
      <div className="vault-toolbar">
        <label className="inline-search"><Search size={14} /><input aria-label="Search file vault" placeholder="Search your vault" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="segmented-control">{([{ id: 'all', label: 'All files' }, { id: 'recent', label: 'Recent' }, { id: 'favorites', label: 'Favorites' }] as const).map((item) => <button className={filter === item.id ? 'selected' : ''} key={item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
      </div>
      <div className="vault-add-row">
        <button onClick={() => void addReference('folder')}><FolderPlus size={15} /> Choose folder</button>
        <button className="subtle-button" onClick={() => void addReference('file')}><Plus size={15} /> Add file reference</button>
        <form onSubmit={(event) => { event.preventDefault(); void addFolder(); }}><input aria-label="New folder name" placeholder="Create a virtual folder" value={folderName} onChange={(event) => setFolderName(event.target.value)} /><button className="icon-button" aria-label="Create virtual folder"><Plus size={15} /></button></form>
      </div>
      {!window.electronAPI?.selectVaultPath && <div className="vault-notice"><ShieldAlert size={14} /> Browser preview can store file names. Native folder selection and opening are available in the desktop app.</div>}
      <div className="vault-list">
        {filtered.map((item) => (
          <article className="vault-row" key={item.id}>
            <div className={`vault-file-icon ${item.kind}`}><IconForVault kind={item.kind} /></div>
            <div className="vault-file-name">
              <strong>{item.name}</strong>
              <small>{item.location || 'Virtual folder'} · Added {dayLabel(item.addedAt.slice(0, 10))}</small>
              <div className="vault-tags">
                {(item.tags ?? []).map((tag) => <span key={tag}>#{tag}</span>)}
                <form onSubmit={(event) => { event.preventDefault(); const tag = (tagDrafts[item.id] ?? '').trim(); if (!tag || (item.tags ?? []).includes(tag)) return; void onUpdateRecord('vaultItems', { ...item, tags: [...(item.tags ?? []), tag] }); setTagDrafts((previous) => ({ ...previous, [item.id]: '' })); }}>
                  <input aria-label={`Add tag to ${item.name}`} placeholder="Add tag" value={tagDrafts[item.id] ?? ''} onChange={(event) => setTagDrafts((previous) => ({ ...previous, [item.id]: event.target.value }))} />
                  <button aria-label="Save file tag">+</button>
                </form>
              </div>
            </div>
            <button className={`icon-button ${item.favorite ? 'favorite-active' : ''}`} onClick={() => void toggleFavorite(item)} aria-label={item.favorite ? 'Remove favorite' : 'Add favorite'} title={item.favorite ? 'Remove favorite' : 'Add favorite'}>★</button>
            {item.location && window.electronAPI?.openVaultPath && <button className="icon-button" onClick={() => void window.electronAPI?.openVaultPath(item.location)} aria-label={`Open ${item.name}`} title="Open item"><ArrowRight size={15} /></button>}
            <button className="icon-button" onClick={() => void onDeleteRecord('vaultItems', item.id)} aria-label={`Remove ${item.name}`} title="Remove reference"><Trash2 size={14} /></button>
          </article>
        ))}
        {filtered.length === 0 && <div className="empty-state vault-empty"><Folder size={24} /><strong>Your vault is yours to shape.</strong><span>Add a real folder reference or create an in-app virtual folder.</span></div>}
      </div>
    </section>
  );
}

function IconForVault({ kind }: { kind: VaultItem['kind'] }) { return kind === 'folder' ? <Folder size={18} /> : <File size={18} />; }