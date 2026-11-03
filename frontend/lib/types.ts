export type Role = "admin" | "teacher" | "student";

export interface User {
  id: string | number;
  username: string;
  first_name: string;
  last_name: string;
  fullName: string;
  role: Role;
  phone?: string;
  avatarUrl?: string | null;
  nationalIdMasked?: string;
  must_change_password?: boolean;
  is_active?: boolean;
  date_joined?: string;
  last_login?: string | null;
}

export interface Subject {
  id: number;
  title: string;
  color: string;
  icon: string;
  offeringCount?: number;
}

export interface ClassRoom {
  id: number;
  name: string;
  grade: number;
  year: string;
  studentCount?: number;
  offeringCount?: number;
}

export interface ScheduleSlot {
  id: number;
  weekday: number;
  weekdayLabel: string;
  start_time: string;
  end_time: string;
}

export interface Offering {
  id: number;
  subject: Subject;
  teacher: Pick<User, "id" | "username" | "first_name" | "last_name" | "fullName" | "role" | "avatarUrl">;
  classRoom: ClassRoom;
  year: string;
  is_active: boolean;
  schedule: ScheduleSlot[];
  filesPath: string;
  meetingsUrl: string;
  studentCount: number;
  recordingCount: number;
  isRunning?: boolean;
  sessions?: Session[];
  nextSessionNumber?: number;
  students?: User[];
  recordings?: Recording[];
  /** The lesson's permanent guest link; the same for every session. */
  guestUrl: string;
}

export interface Recording {
  id: number;
  record_id: string;
  sessionId?: number | null;
  name: string;
  playback_url: string;
  duration_seconds: number;
  duration: string;
  published_at: string | null;
}

export interface Session {
  id: number;
  offering: number;
  number: number;
  numberLabel: string;
  title: string;
  label: string;
  status: "planned" | "running" | "ended";
  statusLabel: string;
  date: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  isRunning: boolean;
  isRecorded: boolean;
  recordings: Recording[];
  recordingCount: number;
  guestCount: number;
}

/** Public information a pupil sees on the lesson's permanent guest link. */
export interface GuestSessionInfo {
  school: string;
  offeringTitle: string;
  subjectColor: string;
  className: string;
  teacherName: string;
  running: boolean;
  sessionNumber: number | null;
  sessionNumberLabel: string;
  title: string;
  statusLabel: string;
}

export interface GuestVisit {
  fullName: string;
  joinedAt: string;
  sessionNumber: number;
  sessionNumberLabel: string;
  visits: number;
}

export interface SessionInfo {
  user: User;
  mustChangePassword: boolean;
  role: Role;
}

export interface Profile extends User {
  classRoom?: { id: number; name: string; grade: number } | null;
  offerings: Offering[];
  editableFields: string[];
  ftpUsername?: string | null;
}

export interface AdminStats {
  users: { total: number; students: number; teachers: number; admins: number; inactive: number };
  classes: number;
  subjects: number;
  offerings: number;
  sessions: { active: number; today: number; total: number };
  recordings: { total: number; sizeBytes: number };
  classesPerGrade: { grade: number; count: number }[];
}

export interface ImportRow {
  row: number;
  first_name: string;
  last_name: string;
  username: string;
  national_id_masked: string;
  class_name: string;
  action: "create" | "update" | "error";
  errors: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  summary: { total: number; create: number; update: number; error: number };
  year: string;
}
