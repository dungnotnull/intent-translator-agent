// ── Domain Types ──
export type Domain = "university" | "government" | "healthcare";
export type UserType = "student" | "staff" | "citizen" | "elderly" | "visitor";
export type Language = "vi" | "en" | "mixed";
export type Formality = "formal" | "casual" | "informal";
export type DeploymentMode = "local" | "hybrid" | "cloud";

// ── Intent Types ──
export interface IntentClass {
  id: string;
  name: string;
  description?: string;
  examples: string[];
  required_slots: string[];
  optional_slots?: string[];
  route: string;
  confirmation_required: boolean;
  confirmation_message?: string;
}

export interface IntentRegistry {
  domain: Domain;
  version: string;
  intents: IntentClass[];
}

// ── Classification Types ──
export interface ClassificationResult {
  intent: string;
  confidence: number;
  alternatives: { intent: string; confidence: number }[];
  source: "local_slm" | "llm_fallback" | "rule";
  model_version: string;
}

export type RoutingAction = "EXECUTE" | "CONFIRM_INTENT" | "CLARIFY";

export interface RoutingDecision {
  action: RoutingAction;
  message?: string;
  intent?: string;
}

// ── Slot Types ──
export type SlotType = "string" | "enum" | "date" | "number" | "free_text";

export interface SlotSchema {
  type: SlotType;
  pattern?: string;
  values?: string[];
  aliases?: Record<string, string>;
  prompt_vi: string;
  prompt_en: string;
  example?: string;
  privacy?: boolean;
  default?: string;
  validate_against?: string;
  max_length?: number;
}

export interface SlotSchemas {
  [slotName: string]: SlotSchema;
}

export interface SlotValue {
  value: string | number | Date;
  confidence: number;
  source: "ner" | "context" | "default" | "user_prompt";
}

export interface SlotExtractionResult {
  filled: Record<string, SlotValue>;
  missing: string[];
  uncertain: string[];
  validation_errors: string[];
}

// ── Session / Context Types ──
export interface ConversationTurn {
  role: "user" | "agent";
  text: string;
  timestamp: Date;
  intent?: string;
  slots_filled?: Record<string, SlotValue>;
}

export interface PendingIntent {
  intent: string;
  filledSlots: Record<string, SlotValue>;
  missingSlots: string[];
  awaitingConfirmation: boolean;
}

export interface SessionContext {
  sessionId: string;
  userId?: string;
  userType: UserType;
  domain: Domain;
  language: Language;
  history: ConversationTurn[];
  resolvedEntities: Record<string, string>;
  pendingIntent?: PendingIntent;
  createdAt: Date;
  expiresAt: Date;
}

// ── Normalizer Types ──
export interface NormalizedText {
  text: string;
  original: string;
  language: Language;
  corrections: { original: string; corrected: string }[];
  filler_removed: string[];
  numbers_normalized: { original: string; normalized: number }[];
}

// ── Route / API Types ──
export interface RouteResult {
  type: "SUCCESS" | "CONFIRMATION_REQUIRED" | "AUTH_REQUIRED" | "USER_ERROR" | "SYSTEM_ERROR";
  message?: string;
  data?: unknown;
  fallback?: {
    phone?: string;
    email?: string;
    location?: string;
    hours?: string;
  };
}

export interface ApiAdapter {
  execute(method: string, slots: Record<string, SlotValue>): Promise<RouteResult>;
}

// ── Chat API Types ──
export interface ChatRequest {
  session_id?: string;
  message: string;
  domain: Domain;
  user_type?: UserType;
  language?: Language;
}

export interface ChatResponse {
  session_id: string;
  response: string;
  intent?: string;
  confidence?: number;
  slots_filled?: Record<string, string>;
  action_taken?: string;
  follow_up_suggestions?: string[];
}

// ── ML Server Types ──
export interface MLClassifyRequest {
  text: string;
  domain: Domain;
  top_k?: number;
}

export interface MLClassifyResponse {
  intent: string;
  confidence: number;
  alternatives: { intent: string; confidence: number }[];
  model_version: string;
}

export interface MLExtractRequest {
  text: string;
  domain: Domain;
  intent: string;
}

export interface MLExtractResponse {
  entities: {
    text: string;
    label: string;
    confidence: number;
  }[];
}

// ── Config Types ──
export interface AppConfig {
  deploymentMode: DeploymentMode;
  port: number;
  host: string;
  mlInferenceUrl: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  redisUrl: string;
  chromaUrl: string;
  chromaCollection: string;
  offlineMode: boolean;
  rateLimitMax: number;
  rateLimitWindowMs: number;
}
