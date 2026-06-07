import { spawn } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Language } from "../types/index.js";

export type ASRMode = "whisper" | "google" | "disabled";
export type WhisperModelSize = "tiny" | "small" | "medium" | "large";

export interface ASRConfig {
  mode: ASRMode;
  whisperModel?: WhisperModelSize;
  googleApiKey?: string;
}

export interface ASRResult {
  text: string;
  language: Language;
  confidence: number;
  durationMs: number;
}

export function normalizeAudioFormat(audioBase64: string): string {
  const buffer = Buffer.from(audioBase64, "base64");

  // WAV header: RIFF + size + WAVE + fmt  + subchunk1size + PCM + channels + sampleRate + byteRate + blockAlign + bitsPerSample + data + subchunk2size
  if (buffer.length < 44) return audioBase64;

  const header = buffer.toString("ascii", 0, 4);
  const waveMarker = buffer.toString("ascii", 8, 12);

  if (header !== "RIFF" || waveMarker !== "WAVE") {
    // Not a valid WAV — assume it's raw PCM 16kHz 16bit mono and wrap it
    const pcmData = buffer;
    const dataSize = pcmData.length;
    const wav = Buffer.alloc(44 + dataSize);

    wav.write("RIFF", 0);
    wav.writeUInt32LE(36 + dataSize, 4);
    wav.write("WAVE", 8);
    wav.write("fmt ", 12);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); // PCM
    wav.writeUInt16LE(1, 22); // Mono
    wav.writeUInt32LE(16000, 24); // 16kHz
    wav.writeUInt32LE(32000, 28); // byteRate
    wav.writeUInt16LE(2, 32); // blockAlign
    wav.writeUInt16LE(16, 34); // bitsPerSample
    wav.write("data", 36);
    wav.writeUInt32LE(dataSize, 40);
    pcmData.copy(wav, 44);

    return wav.toString("base64");
  }

  // Validate WAV format — check header fields
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);

  const needsResample = sampleRate !== 16000 || channels !== 1 || bitsPerSample !== 16;

  if (needsResample) {
    // Write to temp file and convert via Python + librosa or similar
    // For now: pass through with a warning; the Python Whisper/Google will handle resampling
    console.warn(
      `[asr] Audio format mismatch: ${sampleRate}Hz/${channels}ch/${bitsPerSample}bit. ` +
        `Expected 16000Hz/1ch/16bit. Passing through; transcriber may resample.`,
    );
  }

  return audioBase64;
}

export async function transcribeAudio(
  audioBase64: string,
  config: ASRConfig = { mode: "disabled" },
): Promise<ASRResult> {
  switch (config.mode) {
    case "whisper":
      return transcribeLocalWhisper(audioBase64, config.whisperModel ?? "small");
    case "google":
      return transcribeGoogleCloud(audioBase64, config.googleApiKey);
    case "disabled":
    default:
      throw new Error("ASR is disabled in current deployment mode");
  }
}

async function transcribeLocalWhisper(audioBase64: string, modelSize: WhisperModelSize): Promise<ASRResult> {
  const start = Date.now();
  const audioBuffer = Buffer.from(audioBase64, "base64");

  const tmpDir = join(tmpdir(), "intent-translator-asr");
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const audioFile = join(tmpDir, `${randomUUID()}.wav`);
  writeFileSync(audioFile, audioBuffer);

  return new Promise((resolve, reject) => {
    const proc = spawn("python", [
      "-c",
      `
import sys, json
try:
    import whisper
    model = whisper.load_model("${modelSize}")
    result = model.transcribe(${JSON.stringify(audioFile)}, language="vi", task="transcribe")
    print(json.dumps({"text": result["text"].strip(), "language": result.get("language", "vi")}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
      `,
    ], {
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => { stdout += chunk; });
    proc.stderr?.on("data", (chunk) => { stderr += chunk; });

    proc.on("close", (code) => {
      try {
        if (existsSync(audioFile)) unlinkSync(audioFile);
      } catch { /* ok */ }

      if (code !== 0) {
        reject(new Error(`Whisper ASR failed (exit ${code}): ${stderr.slice(0, 500)}`));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (result.error) {
          reject(new Error(`Whisper ASR error: ${result.error}`));
          return;
        }
        resolve({
          text: postProcessASR(result.text),
          language: result.language === "vi" ? "vi" : "en",
          confidence: 0.88,
          durationMs: Date.now() - start,
        });
      } catch {
        reject(new Error(`Whisper ASR parse error: ${stdout.slice(0, 200)}`));
      }
    });

    proc.on("error", (err) => {
      try { if (existsSync(audioFile)) unlinkSync(audioFile); } catch { /* ok */ }
      reject(err);
    });
  });
}

async function transcribeGoogleCloud(audioBase64: string, apiKey?: string): Promise<ASRResult> {
  const start = Date.now();
  const key = apiKey || process.env.GOOGLE_SPEECH_API_KEY;

  if (!key) {
    throw new Error("Google Speech API key not configured. Set GOOGLE_SPEECH_API_KEY in .env");
  }

  const requestBody = {
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "vi-VN",
      alternativeLanguageCodes: ["en-US"],
      enableAutomaticPunctuation: true,
      model: "default",
    },
    audio: {
      content: audioBase64,
    },
  };

  const res = await fetch(
    `https://speech.googleapis.com/v1/speech:recognize?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20000),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google Speech API returned ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    results?: Array<{ alternatives: Array<{ transcript: string; confidence: number }> }>;
  };

  if (!data.results || data.results.length === 0) {
    throw new Error("Google Speech API returned no transcription results");
  }

  const best = data.results[0]!.alternatives[0]!;
  return {
    text: postProcessASR(best.transcript),
    language: "vi",
    confidence: best.confidence || 0.9,
    durationMs: Date.now() - start,
  };
}

const ASR_POST_CORRECTIONS: Record<string, string> = {
  "học phỉ": "học phí",
  "tín chỉ": "tín chỉ",
  "đăng ki": "đăng ký",
  "thoi khoa bieu": "thời khóa biểu",
  "đang kí": "đăng ký",
  "huy mon": "hủy môn",
  "thi lai": "thi lại",
  "bang diem": "bảng điểm",
  "tot nghiep": "tốt nghiệp",
};

export function postProcessASR(text: string): string {
  let result = text.trim();
  for (const [wrong, correct] of Object.entries(ASR_POST_CORRECTIONS)) {
    result = result.replace(new RegExp(wrong, "gi"), correct);
  }
  return result;
}
