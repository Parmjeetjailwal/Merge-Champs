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

export interface QAScore {
  id: string;
  employeeId: string;
  jiraTicketKey: string;
  timelinessScore: number;
  documentationScore: number;
  totalScore: number;
  evaluationDate: string;
  period: string;
  comments: string | null;
  agent: Employee;
}

export interface QAReportMember {
  employeeId: string;
  name: string;
  ticketsEvaluated: number;
  avgTimeliness: number;
  avgDocumentation: number;
  avgTotalScore: number;
  tickets: {
    jiraTicketKey: string;
    timelinessScore: number;
    documentationScore: number;
    totalScore: number;
    evaluationDate: string;
  }[];
}

export interface QAReport {
  reportId: string;
  exportedToPMI: boolean;
  weighting: { timeliness: number; documentation: number; scaleMax: number };
  payload: { reportId: string; period: string; generatedAt: string; teamMembers: QAReportMember[] };
}

export interface QAReportSummary {
  id: string;
  period: string;
  generatedAt: string;
  exportedToPMI: boolean;
  pmiReference: string | null;
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
  srNo: number | null;
  product: string | null;
  caseNo: string;
  callDateTime: string | null;
  ticketCreatedDateTime: string | null;
  userName: string | null;
  callHandledById: string;
  callHandledBy: Employee;
  caseOwnerId: string;
  caseOwner: Employee;
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
  deltas: { utilization: number; qa: number; callQa: number; maintenanceOnTime: number };
  timeUtilization: { top: TimeRecord[]; bottom: TimeRecord[]; count: number; averageUtilization: number; target: number };
  qa: { averageScore: number; members: { employeeId: string; name: string; avgTotalScore: number; ticketsEvaluated: number }[] };
  kt: { joinees: { id: string; name: string; completed: number; total: number; percent: number }[] };
  maintenance: {
    topMaintainer: { employeeId: string; name: string; count: number } | null;
    missedTimeline: { employeeId: string; name: string; exceededCount: number }[];
    onTimePercent: number;
  };
  callQa: {
    averageScore: number;
    topImprovementArea: { key: string; label: string; avg: number } | null;
    perAgent: { employeeId: string; name: string; evaluations: number; avgScore: number }[];
  };
  alerts: {
    belowTarget: { target: number; employees: { name: string; utilizationPercent: number }[] };
    overdueKT: { joinee: string; topic: string }[];
    repeatMissers: { employeeId: string; name: string; exceededCount: number }[];
    callBreaches: number;
  };
}

export interface AppConfig {
  qa: { scaleMax: number; timeliness: number; documentation: number };
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
