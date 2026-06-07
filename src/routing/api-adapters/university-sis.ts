import { BaseAdapter, type AdapterConfig } from "./base-adapter.js";
import type { RouteResult } from "../../types/index.js";

interface TuitionData {
  amount: number;
  amount_paid: number;
  deadline: string;
  semester_name: string;
  paid: boolean;
  discount: number;
  discount_reason: string;
}

interface ScheduleEntry {
  day: string;
  courses: string[];
}

interface TranscriptCourse {
  code: string;
  name: string;
  credits: number;
  grade: string;
  score: number;
}

interface GraduationData {
  total_required: number;
  completed: number;
  remaining: number;
  gpa: number;
  missing_courses: string[];
}

export class UniversitySISAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  async getTuition(studentId: string, semester: string): Promise<RouteResult> {
    try {
      const data = await this.get<TuitionData>("/api/tuition", {
        studentCode: studentId,
        termId: semesterToTermId(semester),
      });
      return { type: "SUCCESS", data };
    } catch (err) {
      console.error(`[sis] getTuition failed for ${studentId}/${semester}: ${(err as Error).message}`);
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu học phí lúc này. Vui lòng thử lại sau hoặc liên hệ phòng đào tạo 028.xxxx.xxxx.",
        fallback: { phone: "028.xxxx.xxxx", hours: "8:00-17:00 Thứ 2 - Thứ 6" },
      };
    }
  }

  async getTuitionDeadline(semester: string): Promise<RouteResult> {
    try {
      const data = await this.get<{ deadline: string; grace_period: string; semester_name: string }>(
        "/api/tuition/deadline",
        { termId: semesterToTermId(semester) },
      );
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu hạn nộp học phí lúc này.",
        fallback: { phone: "028.xxxx.xxxx" },
      };
    }
  }

  async getScholarshipInfo(studentId: string): Promise<RouteResult> {
    try {
      const data = await this.get<{
        eligible: boolean;
        scholarship_type?: string;
        discount_percent?: number;
        discount_amount?: number;
        reason?: string;
      }>("/api/scholarship", { studentCode: studentId });
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu thông tin học bổng lúc này.",
      };
    }
  }

  async registerCourse(studentId: string, courseCode: string, semester: string): Promise<RouteResult> {
    try {
      const data = await this.post<{
        success: boolean;
        course_code: string;
        course_name: string;
        schedule: string;
        error_code?: string;
      }>("/api/course/register", {
        studentCode: studentId,
        courseCode,
        termId: semesterToTermId(semester),
      });
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể đăng ký môn học lúc này. Vui lòng thử lại sau.",
      };
    }
  }

  async cancelCourse(studentId: string, courseCode: string, semester: string): Promise<RouteResult> {
    try {
      const data = await this.post<{ success: boolean; course_code: string }>("/api/course/cancel", {
        studentCode: studentId,
        courseCode,
        termId: semesterToTermId(semester),
      });
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể hủy môn học lúc này.",
      };
    }
  }

  async getSchedule(studentId: string, week?: string): Promise<RouteResult> {
    try {
      const params: Record<string, string> = { studentCode: studentId };
      if (week) params.week = week;
      const data = await this.get<{ schedule: ScheduleEntry[] }>("/api/schedule", params);
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu lịch học lúc này.",
      };
    }
  }

  async getGraduationRequirements(studentId: string): Promise<RouteResult> {
    try {
      const data = await this.get<GraduationData>("/api/graduation/requirements", { studentCode: studentId });
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu điều kiện tốt nghiệp lúc này.",
      };
    }
  }

  async getTranscript(studentId: string, semester?: string): Promise<RouteResult> {
    try {
      const params: Record<string, string> = { studentCode: studentId };
      if (semester) params.termId = semesterToTermId(semester);
      const data = await this.get<{ gpa: number; total_credits: number; courses: TranscriptCourse[] }>(
        "/api/transcript",
        params,
      );
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu bảng điểm lúc này.",
      };
    }
  }

  async requestDocument(studentId: string, purpose: string): Promise<RouteResult> {
    try {
      const data = await this.post<{ request_id: string; status: string; estimated_ready: string }>(
        "/api/document/request",
        { studentCode: studentId, purpose },
      );
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể gửi yêu cầu giấy tờ lúc này.",
      };
    }
  }

  async getDocumentStatus(studentId: string): Promise<RouteResult> {
    try {
      const data = await this.get<{
        status: string;
        status_text: string;
        submitted_at: string;
        estimated_completion: string;
      }>("/api/document/status", { studentCode: studentId });
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu trạng thái hồ sơ lúc này.",
      };
    }
  }
}

function semesterToTermId(semester: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const academicYearStart = month >= 8 ? year : year - 1;

  switch (semester) {
    case "HK1":
      return `${academicYearStart}1`;
    case "HK2":
      return `${academicYearStart + 1}2`;
    case "HK3":
      return `${academicYearStart + 1}3`;
    default:
      return `${academicYearStart}1`;
  }
}

let sisAdapter: UniversitySISAdapter | null = null;

export function getSISAdapter(): UniversitySISAdapter {
  if (!sisAdapter) {
    sisAdapter = new UniversitySISAdapter({
      baseUrl: process.env.UNIVERSITY_SIS_API_URL || "http://localhost:8080/api",
      apiKey: process.env.UNIVERSITY_SIS_API_KEY,
      timeoutMs: 10000,
    });
  }
  return sisAdapter;
}
