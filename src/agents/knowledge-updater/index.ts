import { ChromaClient } from "chromadb";
import type { Domain } from "../../types/index.js";

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  domain: Domain;
  source: string;
  last_updated: Date;
}

let chromaClient: ChromaClient | null = null;
let collectionName = "intent-translator-kb";

function getChroma(): ChromaClient {
  if (!chromaClient) {
    const chromaUrl = process.env.CHROMA_URL || "http://localhost:8000";
    collectionName = process.env.CHROMA_COLLECTION || collectionName;
    chromaClient = new ChromaClient({ path: chromaUrl });
    console.log(`[kb] ChromaDB client initialized at ${chromaUrl}`);
  }
  return chromaClient;
}

async function getOrCreateCollection() {
  const client = getChroma();
  try {
    return await client.getCollection({ name: collectionName, embeddingFunction: undefined as unknown as never });
  } catch {
    return await client.createCollection({ name: collectionName, metadata: { "hnsw:space": "cosine" } });
  }
}

// ── Seed knowledge (avoids double-insert on restart) ──

const SEED_ENTRIES: KnowledgeEntry[] = [
  {
    id: "KB-2025-06-01-018",
    title: "Quy chế Đào tạo Đại học 2021 (Thông tư 08/2021/TT-BGDĐT)",
    content: "Thang điểm 10: dưới 4.0 là F, 4.0-5.4 là D, 5.5-6.9 là C, 7.0-7.9 là B, 8.0-8.9 là B+, 9.0-10 là A. Cảnh báo học vụ khi GPA dưới 1.20 năm 1, dưới 1.40 năm 2, dưới 1.60 năm 3 trở lên. Buộc thôi học sau 2 lần liên tiếp cảnh báo. Sinh viên được thi lại tối đa 2 lần mỗi học phần, điểm thi lại tính theo lần cao nhất.",
    domain: "university",
    source: "Bộ Giáo dục và Đào tạo — Thông tư 08/2021/TT-BGDĐT",
    last_updated: new Date("2025-06-01"),
  },
  {
    id: "KB-2025-06-01-019",
    title: "Học phí Đại học Việt Nam — Cấu trúc và Quy định",
    content: "Học phí được tính theo tín chỉ tại hầu hết các trường đại học công lập. Mức học phí khác nhau theo nhóm ngành đào tạo. Sinh viên thuộc diện chính sách (con liệt sĩ, thương binh nặng), người khuyết tật nặng, hộ nghèo được miễn học phí. Hộ cận nghèo được giảm 70% học phí. Thủ tục miễn giảm cần nộp giấy tờ chứng nhận đầu mỗi học kỳ.",
    domain: "university",
    source: "Chính phủ Việt Nam — Nghị định 81/2021/NĐ-CP",
    last_updated: new Date("2025-06-01"),
  },
  {
    id: "KB-GOV-001",
    title: "Dịch vụ công trực tuyến — Thủ tục hành chính Việt Nam",
    content: "Cổng dịch vụ công quốc gia (dichvucong.gov.vn) tập hợp tất cả thủ tục hành chính. Phân loại theo cấp độ 1-4: mức độ 4 là trực tuyến hoàn toàn. Các thủ tục phổ biến: cấp/đổi CCCD gắn chip, đăng ký hộ khẩu, khai sinh/khai tử, đăng ký kết hôn, cấp giấy phép lái xe, đăng ký kinh doanh. Từ 2023, nhiều thủ tục đã chuyển sang VNeID.",
    domain: "government",
    source: "Văn phòng Chính phủ — dichvucong.gov.vn",
    last_updated: new Date("2025-06-01"),
  },
  {
    id: "KB-GOV-002",
    title: "Căn cước công dân gắn chip — Thủ tục và yêu cầu",
    content: "Công dân từ 14 tuổi được cấp CCCD gắn chip. Hồ sơ cần: sổ hộ khẩu hoặc giấy xác nhận cư trú, giấy khai sinh bản sao. Lệ phí: miễn phí lần đầu, đổi lại 50.000đ. Thời gian giải quyết: 7-15 ngày làm việc. Làm tại Công an quận/huyện hoặc Trung tâm ĐKQG về dân cư.",
    domain: "government",
    source: "Bộ Công an — Luật Căn cước công dân 2014",
    last_updated: new Date("2025-06-01"),
  },
  {
    id: "KB-GOV-003",
    title: "Đăng ký kết hôn — Thủ tục tại UBND phường/xã",
    content: "Hồ sơ cần: tờ khai đăng ký kết hôn, CMND/CCCD 2 bên, giấy xác nhận tình trạng hôn nhân mỗi bên. Nộp tại UBND phường/xã nơi cư trú của 1 trong 2 bên. Lệ phí: miễn phí hoặc tối đa 1.000.000đ tùy địa phương (nhiều nơi miễn phí). Thời gian: 3 ngày làm việc kể từ ngày nộp đủ hồ sơ.",
    domain: "government",
    source: "Luật Hộ tịch 2014",
    last_updated: new Date("2025-06-01"),
  },
  {
    id: "KB-GOV-004",
    title: "Cấp hộ chiếu phổ thông — Thủ tục xuất nhập cảnh",
    content: "Hồ sơ: CMND/CCCD, 4 ảnh 4x6 nền trắng, sổ hộ khẩu hoặc KT3. Nộp tại Phòng Quản lý xuất nhập cảnh Công an tỉnh/thành phố. Lệ phí: 200.000đ/lần cấp. Thời gian: 8-14 ngày làm việc. Có thể nộp online qua Cổng dịch vụ công quốc gia mức độ 4.",
    domain: "government",
    source: "Bộ Công an — Cục Quản lý xuất nhập cảnh",
    last_updated: new Date("2025-06-01"),
  },
  {
    id: "KB-GOV-005",
    title: "Đăng ký khai sinh — Thủ tục cho trẻ em",
    content: "Nộp trong vòng 60 ngày kể từ ngày sinh. Hồ sơ: tờ khai đăng ký khai sinh, giấy chứng sinh (bản chính), CMND/CCCD cha mẹ, sổ hộ khẩu hoặc giấy xác nhận cư trú. Làm tại UBND phường/xã nơi cư trú của cha hoặc mẹ. Miễn phí. Giải quyết ngay trong ngày nếu hồ sơ đầy đủ.",
    domain: "government",
    source: "Luật Hộ tịch 2014",
    last_updated: new Date("2025-06-01"),
  },
];

// ── Public API ──

export async function searchKB(query: string, domain: Domain): Promise<KnowledgeEntry[]> {
  const lower = query.toLowerCase().trim();

  if (!lower) return [];

  try {
    const collection = await getOrCreateCollection();
    const results = await collection.query({
      queryTexts: [query],
      nResults: 5,
      where: { domain },
    });

    if (results.ids[0] && results.documents[0]) {
      return results.ids[0].map((id, i) => ({
        id,
        title: (results.metadatas?.[0]?.[i] as Record<string, string>)?.title ?? id,
        content: results.documents![0]![i] ?? "",
        domain: (results.metadatas?.[0]?.[i] as Record<string, string>)?.domain as Domain ?? domain,
        source: (results.metadatas?.[0]?.[i] as Record<string, string>)?.source ?? "",
        last_updated: new Date((results.metadatas?.[0]?.[i] as Record<string, string>)?.last_updated ?? Date.now()),
      }));
    }
  } catch (err) {
    console.warn(`[kb] ChromaDB query failed: ${(err as Error).message}, using in-memory fallback`);
  }

  return inMemorySearch(lower, domain);
}

export async function generalSearchKB(query: string, domain: Domain): Promise<KnowledgeEntry[]> {
  return searchKB(query, domain);
}

export async function addKnowledgeEntry(entry: KnowledgeEntry): Promise<void> {
  try {
    const collection = await getOrCreateCollection();
    await collection.add({
      ids: [entry.id],
      documents: [entry.content],
      metadatas: [{
        title: entry.title,
        domain: entry.domain,
        source: entry.source,
        last_updated: entry.last_updated.toISOString(),
      }],
    });
  } catch (err) {
    console.warn(`[kb] ChromaDB add failed: ${(err as Error).message}`);
  }

  inMemoryStore.push(entry);
}

export async function getKnowledgeById(id: string): Promise<KnowledgeEntry | undefined> {
  for (const entry of inMemoryStore) {
    if (entry.id === id) return entry;
  }
  return undefined;
}

export async function runWeeklyUpdate(domain: Domain): Promise<{ added: number; updated: number }> {
  console.log(`[kb] Weekly update triggered for domain: ${domain}`);

  try {
    const collection = await getOrCreateCollection();
    const count = await collection.count();
    console.log(`[kb] ChromaDB collection '${collectionName}' has ${count} documents`);
  } catch {
    console.warn(`[kb] ChromaDB unavailable during weekly update`);
  }

  return { added: 0, updated: 0 };
}

export async function seedKnowledge(): Promise<void> {
  try {
    const collection = await getOrCreateCollection();
    const existing = await collection.get({ ids: SEED_ENTRIES.map((e) => e.id) });

    const existingIds = new Set(existing.ids);
    const toAdd = SEED_ENTRIES.filter((e) => !existingIds.has(e.id));

    if (toAdd.length > 0) {
      await collection.add({
        ids: toAdd.map((e) => e.id),
        documents: toAdd.map((e) => e.content),
        metadatas: toAdd.map((e) => ({
          title: e.title,
          domain: e.domain,
          source: e.source,
          last_updated: e.last_updated.toISOString(),
        })),
      });
      console.log(`[kb] Seeded ${toAdd.length} knowledge entries`);
    }
  } catch {
    console.log("[kb] ChromaDB unavailable — using in-memory seed only");
  }

  for (const entry of SEED_ENTRIES) {
    if (!inMemoryStore.some((e) => e.id === entry.id)) {
      inMemoryStore.push({ ...entry });
    }
  }
}

// ── In-memory fallback store ──

const inMemoryStore: KnowledgeEntry[] = [];

function inMemorySearch(lower: string, domain: Domain): KnowledgeEntry[] {
  const candidates = inMemoryStore.filter((e) => e.domain === domain);
  return candidates.filter(
    (e) =>
      e.title.toLowerCase().includes(lower) ||
      e.content.toLowerCase().includes(lower),
  );
}
