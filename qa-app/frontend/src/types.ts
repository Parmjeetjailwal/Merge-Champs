export interface Employee {
  id: string;
  name: string;
  email: string;
  team: string | null;
  role: string;
}

export interface TimeRecord {
  id: string;
  employeeId: string;
  period: string;
  plannedHours: number;
  actualHours: number;
  utilizationPercent: number;
  employee: Employee;
}

export interface TimeView {
  period: string | null;
  records: TimeRecord[];
  top: TimeRecord[];
  bottom: TimeRecord[];
}

export interface KTTopic {
  id: string;
  topicName: string;
  status: 'Completed' | 'Pending';
  completedDate: string | null;
  targetDate: string | null;
  notes: string | null;
  signedOffBy: string | null;
}

export interface Joinee {
  id: string;
  name: string;
  joinDate: string;
  team: string | null;
  mentor: string | null;
  topics: KTTopic[];
  progress: { completed: number; total: number; percent: number; overdue: number };
  accesses?: JoineeAccess[];
  accessProgress: { granted: number; pending: number; total: number; percent: number };
}

export type AccessStatus = 'Pending' | 'Granted' | 'NA';

export interface AccessItem {
  id: string;
  projectId: string;
  name: string;
  order: number;
  active: boolean;
}

export interface Project {
  id: string;
  key: string;
  name: string;
  active: boolean;
  order: number;
  accessItems: AccessItem[];
}

export interface JoineeAccess {
  id: string;
  joineeId: string;
  accessItemId: string;
  status: AccessStatus;
  grantedDate: string | null;
  notes: string | null;
  requestedBy: string | null;
  accessItem: AccessItem & { project: Project };
}

export interface MaintenanceActivity {
  id: string;
  title: string;
  employeeId: string;
  scheduledStart: string;
  scheduledEnd: string;
  actualStart: string;
  actualEnd: string;
  status: 'WithinTime' | 'Exceeded';
  exceededByMinutes: number;
  month: string;
  employee: Employee;
}

export interface MaintenanceView {
  month: string | null;
  activities: MaintenanceActivity[];
  topMaintainer: { employeeId: string; name: string; count: number; withinTime: number; exceeded: number } | null;
  missedTimeline: {
    employeeId: string;
    name: string;
    exceededCount: number;
    activities: { title: string; exceededByMinutes: number }[];
  }[];
}

export type QcAnswer = 'YES' | 'NO' | 'NA';

export interface QcParameter {
  id: string;
  code: string;
  section: 'CALL' | 'CASE';
  text: string;
  order: number;
  active: boolean;
  critical: boolean;
  serial?: number;
}

export interface QcParameters {
  call: QcParameter[];
  case: QcParameter[];
}

export interface CallQcAnswer {
  parameterId: string;
  code: string;
  section: 'CALL' | 'CASE';
  text: string;
  order: number;
  critical: boolean;
  answer: QcAnswer;
  comment: string | null;
}

export interface CallEvaluation {
  id: string;
  kind: 'CALL' | 'CASE';
  srNo: number | null;
  product: string | null;
  caseNo: string;
  callDateTime: string | null;
  ticketCreatedDateTime: string | null;
  userName: string | null;
  callHandledById: string | null;
  callHandledBy: Employee | null;
  caseOwnerId: string | null;
  caseOwner: Employee | null;
  analystId: string | null;
  analyst: Employee | null;
  customerEscalation: boolean;
  callScore: number;
  callMax: number;
  callAdherence: number | null;
  caseScore: number;
  caseMax: number;
  caseAdherence: number | null;
  overallScore: number;
  overallMax: number;
  overallAdherence: number | null;
  target: number;
  passed: boolean;
  criticalFailed: boolean;
  findings: string | null;
  actionPlan: string | null;
  period: string;
  answers: CallQcAnswer[];
}

export interface CallQaView {
  period: string | null;
  target: number;
  evaluations: CallEvaluation[];
  averageScore: number;
  passRate: number;
  perAgent: { employeeId: string; name: string; evaluations: number; avgScore: number }[];
  perParameter: { key: string; label: string; section: string; avg: number; applicable: number; critical: boolean }[];
  topImprovementArea: { key: string; label: string; avg: number } | null;
}

export interface DashboardData {
  period: string;
  previousPeriod: string;
  visible: {
    timeUtilization: boolean;
    kt: boolean;
    maintenance: boolean;
    callQa: boolean;
    caseQa: boolean;
    failedSla: boolean;
  };
  deltas: { utilization: number; callQa: number; caseQa: number; maintenanceOnTime: number };
  timeUtilization: { top: TimeRecord[]; bottom: TimeRecord[]; count: number; averageUtilization: number; target: number } | null;
  kt: { joinees: { id: string; name: string; completed: number; total: number; percent: number }[] } | null;
  maintenance: {
    topMaintainer: { employeeId: string; name: string; count: number } | null;
    missedTimeline: { employeeId: string; name: string; exceededCount: number }[];
    onTimePercent: number;
  } | null;
  callQa: {
    averageScore: number;
    topImprovementArea: { key: string; label: string; avg: number } | null;
    perAgent: { employeeId: string; name: string; evaluations: number; avgScore: number }[];
  } | null;
  caseQa: {
    averageScore: number;
    topImprovementArea: { key: string; label: string; avg: number } | null;
    perAgent: { employeeId: string; name: string; evaluations: number; avgScore: number }[];
  } | null;
  failedSla: {
    count: number;
    cases: {
      caseNo: string;
      kind: 'CALL' | 'CASE';
      section: string;
      owner: string;
      product: string | null;
      adherence: number | null;
      target: number;
      criticalFailed: boolean;
    }[];
  } | null;
}

export interface NavSection {
  id: string;
  key: string;
  label: string;
  path: string;
  icon: string;
  order: number;
  enabled: boolean;
  adminOnly: boolean;
  allowedRoles?: string;
}

export interface AppConfig {
  callQa: {
    scaleMax: number;
    opening: number;
    info: number;
    deadAir: number;
    closing: number;
    caseCreationThresholdSecs: number;
    callCloseThresholdSecs: number;
  };
  callQc: { target: number; pointsPerYes: number };
  caseQc: { target: number; pointsPerYes: number };
  timeUtilization: { targetPercent: number };
  pmi: { includeCallScores: boolean };
}

export interface UserRow {
  id: string;
  email: string;
  role: string;
  employeeId: string | null;
  createdAt: string;
}

export interface TrendPoint {
  period: string;
  value: number;
}

export interface KTTemplate {
  id: string;
  name: string;
  team: string | null;
  topics: { id: string; topicName: string }[];
}
