import { BaseAdapter, type AdapterConfig } from "./base-adapter.js";
import type { RouteResult } from "../../types/index.js";

interface ProcedureInfo {
  id: string;
  name: string;
  agency: string;
  level: number;
  required_docs: string[];
  processing_time: string;
  fee: string;
  steps: string[];
  online_url?: string;
}

export class GovernmentPortalAdapter extends BaseAdapter {
  constructor(config: AdapterConfig) {
    super(config);
  }

  async searchProcedure(query: string): Promise<RouteResult> {
    try {
      const data = await this.get<{ results: ProcedureInfo[] }>("/api/procedures/search", {
        q: query,
        limit: "5",
      });
      return { type: "SUCCESS", data };
    } catch (err) {
      console.error(`[gov-portal] searchProcedure failed: ${(err as Error).message}`);
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu thủ tục hành chính lúc này. Vui lòng truy cập dichvucong.gov.vn hoặc liên hệ bộ phận một cửa.",
        fallback: {
          phone: "1800.xxxx",
          location: "Bộ phận tiếp nhận và trả kết quả — Ủy ban nhân dân",
        },
      };
    }
  }

  async getProcedureById(procedureId: string): Promise<RouteResult> {
    try {
      const data = await this.get<{ procedure: ProcedureInfo }>(`/api/procedures/${procedureId}`);
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không tìm thấy thông tin thủ tục này.",
      };
    }
  }

  async checkDocumentStatus(citizenId: string, documentId: string): Promise<RouteResult> {
    try {
      const data = await this.get<{ status: string; status_text: string; completed_at?: string }>(
        "/api/documents/status",
        { citizenId, documentId },
      );
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể tra cứu trạng thái hồ sơ lúc này.",
      };
    }
  }

  async scheduleAppointment(
    citizenId: string,
    procedureId: string,
    preferredDate: string,
    officeCode?: string,
  ): Promise<RouteResult> {
    try {
      const data = await this.post<{ appointment_id: string; datetime: string; office: string }>(
        "/api/appointments/schedule",
        {
          citizenId,
          procedureCode: procedureId,
          preferredDate,
          officeCode,
        },
      );
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không thể đặt lịch hẹn lúc này. Vui lòng thử lại sau.",
      };
    }
  }

  async getOfficeInfo(officeCode: string): Promise<RouteResult> {
    try {
      const data = await this.get<{
        name: string;
        address: string;
        phone: string;
        hours: string;
        coordinates?: { lat: number; lng: number };
      }>(`/api/offices/${officeCode}`);
      return { type: "SUCCESS", data };
    } catch {
      return {
        type: "SYSTEM_ERROR",
        message: "Không tìm thấy thông tin cơ quan này.",
      };
    }
  }
}

let govAdapter: GovernmentPortalAdapter | null = null;

export function getGovernmentPortalAdapter(): GovernmentPortalAdapter {
  if (!govAdapter) {
    govAdapter = new GovernmentPortalAdapter({
      baseUrl: process.env.GOVERNMENT_PORTAL_API_URL || "https://dichvucong.gov.vn/api",
      apiKey: process.env.GOVERNMENT_PORTAL_API_KEY,
      timeoutMs: 15000,
    });
  }
  return govAdapter;
}
