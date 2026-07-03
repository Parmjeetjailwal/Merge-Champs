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

export interface KTTopic {
  id: string;
  topicName: string;
  status: 'Completed' | 'Pending';
  completedDate: string | null;
}

export interface Joinee {
  id: string;
  name: string;
  joinDate: string;
  team: string | null;
  mentor: string | null;
  topics: KTTopic[];
  progress: { completed: number; total: number; percent: number };
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

export interface CallEvaluation {
  id: string;
  employeeId: string;
  callReference: string;
  callDate: string;
  callOpeningScore: number;
  infoCapturedScore: number;
  deadAirScore: number;
  deadAirIncidents: number;
  callClosingScore: number;
  caseCreationTimeSecs: number;
  caseCreationBreached: boolean;
  callCloseTimeSecs: number;
  callCloseBreached: boolean;
  totalScore: number;
  comments: string | null;
  agent: Employee;
  analyst: Employee | null;
}

export interface CallQaView {
  period: string | null;
  evaluations: CallEvaluation[];
  perAgent: { employeeId: string; name: string; evaluations: number; avgScore: number }[];
  perParameter: { key: string; label: string; avg: number }[];
  topImprovementArea: { key: string; label: string; avg: number } | null;
  thresholds: { caseCreationSecs: number; callCloseSecs: number };
}

export interface DashboardData {
  period: string;
  timeUtilization: { top: TimeRecord[]; bottom: TimeRecord[]; count: number };
  qa: { averageScore: number; members: { employeeId: string; name: string; avgTotalScore: number; ticketsEvaluated: number }[] };
  kt: { joinees: { id: string; name: string; completed: number; total: number; percent: number }[] };
  maintenance: {
    topMaintainer: { employeeId: string; name: string; count: number } | null;
    missedTimeline: { employeeId: string; name: string; exceededCount: number }[];
  };
  callQa: {
    averageScore: number;
    topImprovementArea: { key: string; label: string; avg: number } | null;
    perAgent: { employeeId: string; name: string; evaluations: number; avgScore: number }[];
  };
}
