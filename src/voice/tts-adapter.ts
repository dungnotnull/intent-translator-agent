export type TTSMode = "google" | "coqui" | "disabled";

export interface TTSConfig {
  mode: TTSMode;
  googleApiKey?: string;
  voiceName?: string;
  languageCode?: string;
}

export async function synthesizeSpeech(
  text: string,
  config: TTSConfig = { mode: "disabled" },
): Promise<Buffer> {
  switch (config.mode) {
    case "google":
      return synthesizeGoogleTTS(text, config);
    case "coqui":
      return synthesizeCoquiTTS(text);
    case "disabled":
    default:
      throw new Error("TTS is disabled in current deployment mode");
  }
}

async function synthesizeGoogleTTS(text: string, config: TTSConfig): Promise<Buffer> {
  const apiKey = config.googleApiKey || process.env.GOOGLE_SPEECH_API_KEY;
  if (!apiKey) {
    throw new Error("Google TTS API key not configured. Set GOOGLE_SPEECH_API_KEY in .env");
  }

  const voiceName = config.voiceName || process.env.GOOGLE_TTS_VOICE_NAME || "vi-VN-Wavenet-A";
  const languageCode = config.languageCode || process.env.GOOGLE_TTS_LANGUAGE_CODE || "vi-VN";

  const requestBody = {
    input: { text },
    voice: { languageCode, name: voiceName },
    audioConfig: {
      audioEncoding: "MP3" as const,
      speakingRate: 0.95,
    },
  };

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(15000),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Google TTS API returned ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    throw new Error("Google TTS returned no audio content");
  }

  return Buffer.from(data.audioContent, "base64");
}

async function synthesizeCoquiTTS(text: string): Promise<Buffer> {
  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const proc = spawn("python", [
      "-c",
      `
import sys, io, json, base64
try:
    from TTS.api import TTS
    tts = TTS(model_name="tts_models/vi/fairseq/vits", progress_bar=False, gpu=False)
    wav = tts.tts(text=${JSON.stringify(text)})
    buf = io.BytesIO()
    import soundfile as sf
    sf.write(buf, wav, 22050, format="mp3")
    print(base64.b64encode(buf.getvalue()).decode())
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
      `,
    ], {
      timeout: 20000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Coqui TTS failed (exit ${code}): ${stderr.slice(0, 500)}`));
        return;
      }
      try {
        resolve(Buffer.from(stdout.trim(), "base64"));
      } catch {
        reject(new Error("Coqui TTS: invalid base64 output"));
      }
    });

    proc.on("error", reject);
  });
}

export function preprocessForTTS(text: string): string {
  let result = text;

  result = result.replace(/\bHK1\b/g, "học kỳ một");
  result = result.replace(/\bHK2\b/g, "học kỳ hai");
  result = result.replace(/\bHK3\b/g, "học kỳ hè");
  result = result.replace(/\bGPA\b/g, "điểm trung bình");
  result = result.replace(/\bCNTT\b/g, "Công nghệ thông tin");
  result = result.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, (m) => {
    const [d, mo, y] = m.split("/");
    return `ngày ${d} tháng ${mo} năm ${y}`;
  });
  result = result.replace(/(\d+)\.(\d+)\.(\d+)\s*đồng/g, "$1 triệu $2 trăm $3 nghìn đồng");

  return result;
}
