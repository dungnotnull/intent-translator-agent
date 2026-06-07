import type { Domain, RouteResult } from "../../types/index.js";

interface QueryLogEntry {
  id: string;
  sessionId: string;
  domain: Domain;
  utterance: string;
  intent: string;
  confidence: number;
  source: string;
  outcome: string;
  timestamp: Date;
  resolved: boolean;
}

interface ReviewQueueItem {
  id: string;
  utterance: string;
  predictedIntent: string;
  predictedConfidence: number;
  suggestedIntent?: string;
  timestamp: Date;
  status: "pending" | "reviewed" | "ignored";
  reviewedLabel?: string;
}

interface TrainingExample {
  id: string;
  text: string;
  label: string;
  domain: Domain;
  approved: boolean;
  addedAt: Date;
}

let queryLog: QueryLogEntry[] = [];
let reviewQueue: ReviewQueueItem[] = [];
let trainingExamples: TrainingExample[] = [];
let modelMetrics: { date: string; accuracy: number; f1: number; queriesProcessed: number }[] = [];

export function logQuery(entry: Omit<QueryLogEntry, "id" | "timestamp">): void {
  const id = crypto.randomUUID();
  const timestamp = new Date();

  queryLog.push({ ...entry, id, timestamp });
  if (queryLog.length > 10000) {
    queryLog = queryLog.slice(-10000);
  }

  if (entry.confidence < 0.75 && !entry.resolved) {
    addToReviewQueue(entry.utterance, entry.intent, entry.confidence);
  }
}

export function getQueryLog(limit = 100, offset = 0): QueryLogEntry[] {
  return queryLog.slice(offset, offset + limit);
}

export function getQueryStats(): {
  total: number;
  byIntent: Record<string, number>;
  avgConfidence: number;
  unresolvedRate: number;
} {
  const total = queryLog.length;
  if (total === 0) return { total: 0, byIntent: {}, avgConfidence: 0, unresolvedRate: 0 };

  const byIntent: Record<string, number> = {};
  let sumConfidence = 0;
  let unresolvedCount = 0;

  for (const entry of queryLog) {
    byIntent[entry.intent] = (byIntent[entry.intent] || 0) + 1;
    sumConfidence += entry.confidence;
    if (!entry.resolved) unresolvedCount++;
  }

  return {
    total,
    byIntent,
    avgConfidence: sumConfidence / total,
    unresolvedRate: unresolvedCount / total,
  };
}

function addToReviewQueue(utterance: string, predictedIntent: string, confidence: number): void {
  const id = crypto.randomUUID();
  reviewQueue.push({
    id,
    utterance,
    predictedIntent,
    predictedConfidence: confidence,
    timestamp: new Date(),
    status: "pending",
  });
  if (reviewQueue.length > 5000) {
    reviewQueue = reviewQueue.slice(-5000);
  }
}

export function getReviewQueue(status: "pending" | "reviewed" | "ignored" = "pending", limit = 50): ReviewQueueItem[] {
  return reviewQueue.filter((i) => i.status === status).slice(0, limit);
}

export function reviewItem(id: string, correctLabel: string): ReviewQueueItem | undefined {
  const item = reviewQueue.find((i) => i.id === id);
  if (!item) return undefined;
  item.status = "reviewed";
  item.reviewedLabel = correctLabel;

  addTrainingExample(item.utterance, correctLabel, "university");
  return item;
}

export function ignoreItem(id: string): ReviewQueueItem | undefined {
  const item = reviewQueue.find((i) => i.id === id);
  if (!item) return undefined;
  item.status = "ignored";
  return item;
}

export function addTrainingExample(text: string, label: string, domain: Domain): TrainingExample {
  const example: TrainingExample = {
    id: crypto.randomUUID(),
    text,
    label,
    domain,
    approved: false,
    addedAt: new Date(),
  };
  trainingExamples.push(example);
  return example;
}

export function approveTrainingExample(id: string): TrainingExample | undefined {
  const example = trainingExamples.find((e) => e.id === id);
  if (example) example.approved = true;
  return example;
}

export function getTrainingExamples(domain?: Domain, approved?: boolean): TrainingExample[] {
  let results = trainingExamples;
  if (domain) results = results.filter((e) => e.domain === domain);
  if (approved !== undefined) results = results.filter((e) => e.approved === approved);
  return results;
}

export function getApprovedCount(): number {
  return trainingExamples.filter((e) => e.approved).length;
}

export function shouldTriggerRetraining(threshold = 50): boolean {
  return getApprovedCount() >= threshold;
}

export function logModelMetrics(accuracy: number, f1: number, queriesProcessed: number): void {
  modelMetrics.push({
    date: new Date().toISOString().split("T")[0]!,
    accuracy,
    f1,
    queriesProcessed,
  });
  if (modelMetrics.length > 365) {
    modelMetrics = modelMetrics.slice(-365);
  }
}

export function getModelMetrics(): typeof modelMetrics {
  return modelMetrics;
}

const AB_BUCKETS = new Map<string, "A" | "B">();
let modelBVariantActive = false;

export function setModelBVariant(active: boolean): void {
  modelBVariantActive = active;
}

export function routeToModelVariant(sessionId: string): "A" | "B" {
  let bucket = AB_BUCKETS.get(sessionId);
  if (!bucket) {
    bucket = Math.random() < 0.1 ? "B" : "A";
    AB_BUCKETS.set(sessionId, bucket);
  }
  if (bucket === "B" && !modelBVariantActive) return "A";
  return bucket;
}

export function getABStats(): { total: number; variantA: number; variantB: number } {
  const total = AB_BUCKETS.size;
  let a = 0;
  let b = 0;
  for (const [, v] of AB_BUCKETS) {
    if (v === "A") a++;
    else b++;
  }
  return { total, variantA: a, variantB: b };
}
