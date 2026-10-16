declare module "*.svg" {
  import * as React from "react";
  export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}

interface Base {
  id?: number;
  status?: number;
  created_at?: string;
  updated_at?: string;
}

type UserRole = "SUPER_ADMIN" | "ADMIN" | "TEACHER" | "STUDENT" | "PARENT";

interface IUser extends Base {
  email: string;
  name?: string;
  role?: UserRole;
  password?: string;
  isActive?: boolean;
}

// --- School ERP domain types ---

interface IAcademicSession {
  id: number;
  name: string;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
}

interface IClassSection {
  id: number;
  sessionId: number;
  className: string;
  section: string;
  classTeacherId?: number | null;
  classTeacher?: IStaff | null;
  _count?: { students: number };
}

interface IStaff {
  id: number;
  userId: number;
  staffCategory?: string | null;
  qualifications?: string | null;
  contact?: string | null;
  user: IUser;
}

type Gender = "MALE" | "FEMALE" | "OTHER";
type StudentCategory = "GENERAL" | "OBC" | "SC" | "ST" | "EWS";

interface IStudent {
  id: number;
  userId?: number | null;
  admissionNo: string;
  admissionDate?: string | null;
  name: string;
  rollNo: string;
  classSectionId: number;
  classSection?: IClassSection;
  dob?: string | null;
  gender?: Gender | null;
  bloodGroup?: string | null;
  photoUrl?: string | null;
  fatherName?: string | null;
  fatherContact?: string | null;
  motherName?: string | null;
  motherContact?: string | null;
  aadharNumber?: string | null;
  apaarId?: string | null;
  category?: StudentCategory | null;
  address?: string | null;
  contactNumber?: string | null;
  nationality?: string | null;
  previousSchool?: string | null;
  transportRouteId?: number | null;
  transportRoute?: ITransportRoute | null;
  isActive: boolean;
  createdAt: string;
}

interface IParentStudentLink {
  id: number;
  parentId: number;
  studentId: number;
  student: IStudent;
  relationshipType?: string | null;
  isPrimary?: boolean;
}

interface IParentGuardian {
  id: number;
  userId?: number | null;
  name: string;
  email?: string | null;
  contact?: string | null;
  address?: string | null;
  user?: IUser | null;
  children: IParentStudentLink[];
  familyTotalDue?: number;
}

interface IAdminDashboardCounts {
  studentCount: number;
  staffCount: number;
  classSectionCount: number;
  parentCount: number;
  transportVillagesCount?: number;
  transportStudentsCount?: number;
  financialSummary?: {
    totalMonthlyBilled: number;
    totalMonthlyCollected: number;
    totalPendingDues: number;
    collectionRate: number;
  };
  recentNotices?: Array<{
    id: number;
    title: string;
    content: string;
    targetAudience: string;
    createdAt: string;
    authorName: string;
  }>;
}

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

interface IAttendanceRecord {
  id: number;
  studentId: number;
  classSectionId: number;
  date: string;
  status: AttendanceStatus;
  markedByUserId: number;
  student?: IStudent;
}

interface IAttendanceSummary {
  records: IAttendanceRecord[];
  total: number;
  present: number;
  percentage: number;
}

interface IBulkImportRowResult {
  row: number;
  success: boolean;
  message: string;
}

interface ILoginFormInputs {
  email: string;
  password: string;
}

interface IResponse {
  total?: number;
  data?: {
    accessToken: string;
    refreshToken: string;
    user?: IUser;
  };
  message: string;
  success: boolean;
}

interface IGalleryItem {
  id: number;
  ref_id: string;
  image: string;
  title?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

interface IGalleryResponse {
  data: IGalleryItem[];
  success: boolean;
  message?: string;
}

interface ISliders extends Base {
  title: string;
  description: string;
  image: File | string;
}

interface IMainMenu extends Base {
  name: string;
  url?: string;
  other_url?: string;
  target?: string;
  sorting_order?: number;
  lang?: string;
}
interface IFooterMenu extends Base {
  name: string;
  url?: string;
  other_url?: string;
  target?: string;
  sorting_order?: number;
  lang?: string;
}

interface ISubMenu extends Base {
  name: string;
  url?: string;
  parent_id?: number;
  other_url?: string;
  target?: string;
  sorting_order?: number;
  lang?: string;
}

interface ITeacherSubjectLink {
  id: number;
  staffId: number;
  staff: IStaff;
}

interface ISubject {
  id: number;
  name: string;
  classSectionId: number;
  teacherSubjects?: ITeacherSubjectLink[];
}

interface ITransportRoute {
  id: number;
  routeName: string;
  stops?: string | null;
  vehicles?: IVehicle[];
  _count?: { students: number };
}

interface IVehicle {
  id: number;
  vehicleNo: string;
  driverName?: string | null;
  driverContact?: string | null;
  ownerName?: string | null;
  ownerContact?: string | null;
  capacity?: number | null;
  routeId?: number | null;
  route?: ITransportRoute | null;
}

interface ITimetableSlot {
  id: number;
  classSectionId: number;
  dayOfWeek: number;
  periodNumber: number;
  subjectId?: number | null;
  subject?: ISubject | null;
  staffId?: number | null;
  staff?: IStaff | null;
  room?: string | null;
  classSection?: IClassSection;
}

interface IExam {
  id: number;
  sessionId: number;
  session?: IAcademicSession;
  name: string;
  classSectionId: number;
  classSection?: IClassSection;
}

interface IExamResult {
  id: number;
  examId: number;
  studentId: number;
  student?: IStudent;
  subjectId: number;
  subject?: ISubject;
  marksObtained: number;
  maxMarks: number;
  enteredByUserId: number;
}

interface IExamResultOutcome {
  studentId: number;
  subjectId: number;
  success: boolean;
  message: string;
}

interface IReportCardSubject {
  subjectId: number;
  subjectName: string;
  marksObtained: number;
  maxMarks: number;
}

interface IReportCard {
  examId: number;
  examName: string;
  studentId: number;
  subjects: IReportCardSubject[];
  total: number;
  maxTotal: number;
  percentage: number;
}

interface INotice {
  id: number;
  title: string;
  body: string;
  targetRole?: UserRole | null;
  targetClassSectionId?: number | null;
  // Backend-attached lookup — Notice has no Prisma relation to ClassSection, so this is
  // resolved server-side and sent alongside the raw id so every role can render a
  // "For Grade 5 - A" label without needing access to the admin-only class-sections list.
  targetClassSection?: { id: number; className: string; section: string } | null;
  postedByUserId: number;
  postedAt: string;
}

type FeeMode = "CASH" | "BANK_TRANSFER" | "UPI_MANUAL" | "GATEWAY";
type FeePaymentStatus = "PENDING_REVIEW" | "APPROVED";
type FeeFrequency = "MONTHLY" | "ANNUAL" | "ONE_TIME";
type ChargeStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "CANCELLED" | "VOID";
type InvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED" | "VOID";
type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "CANCELLED";

interface IFeeHead {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  isRecurring: boolean;
  allowPartialPayment: boolean;
  createdAt: string;
}

interface IFeeStructureItem {
  id: number;
  feeStructureId: number;
  feeHeadId: number;
  feeHead?: IFeeHead;
  amount: number;
  frequency: FeeFrequency;
  applicableMonths: number[];
  dueDateDay: number;
  allowPartialPayment: boolean;
}

interface IFeeStructure {
  id: number;
  classSectionId?: number | null;
  classSection?: { id: number; className: string; section: string } | null;
  sessionId: number;
  session?: { id: number; name: string } | null;
  name?: string;
  description?: string | null;
  head?: string; // legacy compatibility
  amount?: number; // legacy compatibility
  items?: IFeeStructureItem[];
}

interface IFeeCharge {
  id: number;
  studentId: number;
  student?: IStudent;
  feeHeadId: number;
  feeHead: IFeeHead;
  sessionId: number;
  billingMonth: number;
  billingYear: number;
  dueDate: string;
  baseAmount: number;
  discountAmount: number;
  lateFeeAmount: number;
  calculatedLateFee?: number;
  netAmount: number;
  paidAmount: number;
  outstandingAmount?: number;
  status: ChargeStatus;
  createdAt: string;
}

interface IInvoiceItem {
  id: number;
  invoiceId: number;
  feeChargeId: number;
  feeCharge?: IFeeCharge;
  amount: number;
  description: string;
}

interface IInvoice {
  id: number;
  invoiceNumber: string;
  studentId: number;
  student?: IStudent;
  sessionId: number;
  issueDate: string;
  dueDate: string;
  totalBaseAmount: number;
  totalDiscountAmount: number;
  totalLateFeeAmount: number;
  totalAmount: number;
  paidAmount: number;
  status: InvoiceStatus;
  notes?: string | null;
  items: IInvoiceItem[];
  createdAt: string;
}

interface IPaymentAllocation {
  id: number;
  paymentId: number;
  feeChargeId: number;
  feeCharge?: IFeeCharge;
  allocatedAmount: number;
}

interface IPayment {
  id: number;
  paymentNumber: string;
  studentId: number;
  student?: IStudent;
  amount: number;
  mode: FeeMode;
  status: PaymentStatus;
  transactionRef?: string | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  receiptNumber?: string | null;
  paidAt?: string | null;
  createdAt: string;
  allocations?: IPaymentAllocation[];
}

interface IDueSummary {
  student: {
    id: number;
    name: string;
    admissionNo: string;
    rollNo: string;
    classSection: string;
  };
  charges: IFeeCharge[];
  totalOutstanding: number;
  totalAdvanceAvailable: number;
  netPayable: number;
}

interface IFeePayment {
  id: number;
  studentId: number;
  student?: IStudent;
  feeStructureId: number;
  feeStructure?: IFeeStructure;
  amount: number;
  mode: FeeMode;
  status: FeePaymentStatus;
  transactionRef?: string | null;
  approvedByUserId?: number | null;
  receiptNumber?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

