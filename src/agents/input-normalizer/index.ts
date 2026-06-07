import type { NormalizedText, Language } from "../../types/index.js";

const FILLER_WORDS_VI = [
  "ừm", "à", "ấy là", "thì", "ừ", "ơi", "này", "nhé", "ạ",
  "dạ", "thưa", "ơi", "nha", "hen", "há", "đi", "mà", "đấy",
  "cơ", "chứ", "nhỉ", "nhờ", "với", "lại", "cho",
  "kiểu", "như là", "kiểu như",
];

const VIETNAMESE_CHARS = /[a-zA-Zàáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

function detectLanguage(text: string): Language {
  const vietnameseLetters = [...text].filter((c) => VIETNAMESE_CHARS.test(c)).length;
  const totalLetters = [...text].filter((c) => /\w/.test(c)).length;
  if (totalLetters === 0) return "vi";
  const ratio = vietnameseLetters / totalLetters;

  const hasVietnameseDiacritics = /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(text);
  const hasEnglishPattern = /^(the|is|are|what|how|when|where|my|i want|please|can you|register|schedule)/i.test(text);

  if (hasEnglishPattern && ratio < 0.3) return "en";
  if (hasVietnameseDiacritics && ratio > 0.5) return "vi";
  if (ratio > 0.6) return "vi";

  return "mixed";
}

function removeFillerWords(text: string): { cleaned: string; removed: string[] } {
  const removed: string[] = [];
  let cleaned = text;

  for (const word of FILLER_WORDS_VI) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(cleaned)) {
      removed.push(word);
      cleaned = cleaned.replace(regex, "").replace(/\s+/g, " ").trim();
    }
  }

  return { cleaned, removed };
}

const TELEX_MAP: Record<string, string> = {
  "aa": "â", "aw": "ă", "dd": "đ", "ee": "ê", "oo": "ô",
  "ow": "ơ", "uw": "ư", "w": "ư",
  "as": "á", "afs": "ắ", "aas": "ấ", "aws": "ẳ", "aaf": "ầ",
  "af": "à", "aar": "ẩ", "awr": "ẵ", "ar": "ả", "aaj": "ậ",
  "awj": "ặ", "aj": "ạ", "es": "é", "ees": "ế", "ef": "è",
  "eef": "ề", "er": "ẻ", "eer": "ể", "ej": "ẹ", "eej": "ệ",
  "is": "í", "if": "ì", "ir": "ỉ", "ij": "ị", "os": "ó",
  "oos": "ố", "ows": "ớ", "of": "ò", "oof": "ồ", "owf": "ờ",
  "or": "ỏ", "oor": "ổ", "owr": "ở", "oj": "ọ", "ooj": "ộ",
  "owj": "ợ", "us": "ú", "uws": "ứ", "uf": "ù", "uwf": "ừ",
  "ur": "ủ", "uwr": "ử", "uj": "ụ", "uwj": "ự", "ys": "ý",
  "yf": "ỳ", "yr": "ỷ", "yj": "ỵ",
};

const VNI_MAP: Record<string, string> = {
  "a6": "â", "a8": "ă", "d9": "đ", "e6": "ê", "o6": "ô",
  "o7": "ơ", "u7": "ư",
  "1": "́", "2": "̀", "3": "̉", "4": "̃", "5": "̣",
};

function convertTelexToUnicode(text: string): string {
  let result = text;
  for (const [telex, unicode] of Object.entries(TELEX_MAP)) {
    result = result.replace(new RegExp(telex, "gi"), unicode);
  }
  return result;
}

function convertVNIToUnicode(text: string): string {
  let result = text;
  const ordered = Object.entries(VNI_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [vni, unicode] of ordered) {
    result = result.replace(new RegExp(vni, "gi"), unicode);
  }
  return result;
}

function convertInputMethod(text: string): { converted: string; method: "telex" | "vni" | "none" } {
  if (/[a-zA-Z]{2,}[sfrxj]\b/.test(text)) {
    return { converted: convertTelexToUnicode(text), method: "telex" };
  }
  if (/[a-zA-Z]\d/.test(text) && /[a-zA-Z][6789]/.test(text)) {
    return { converted: convertVNIToUnicode(text), method: "vni" };
  }
  return { converted: text, method: "none" };
}

function correctDomainTerms(text: string): { corrected: string; corrections: { original: string; corrected: string }[] } {
  const corrections: { original: string; corrected: string }[] = [];
  let result = text;

  const domainCorrections: Record<string, string> = {
    "học phi": "học phí",
    "dang ky": "đăng ký",
    "dang ki": "đăng ký",
    "đang ki": "đăng ký",
    "tín chỉ": "tín chỉ",
    "thoi khoa bieu": "thời khóa biểu",
    "huy hoc": "hủy học",
    "drop mon": "hủy môn",
    "diem danh": "điểm danh",
    "lich thi": "lịch thi",
    "hoc bong": "học bổng",
    "cong no": "công nợ",
    "giay to": "giấy tờ",
    "nghi hoc": "nghỉ học",
    "bao luu": "bảo lưu",
  };

  for (const [wrong, right] of Object.entries(domainCorrections)) {
    if (result.toLowerCase().includes(wrong)) {
      corrections.push({ original: wrong, corrected: right });
      result = result.replace(new RegExp(wrong, "gi"), right);
    }
  }

  return { corrected: result, corrections };
}

function normalizeNumbers(text: string): { text: string; normalized: { original: string; normalized: number }[] } {
  const results: { original: string; normalized: number }[] = [];
  let result = text;

  const millionPattern = /(\d+[.,]?\d*)\s*(triệu|trieu)/gi;
  result = result.replace(millionPattern, (_, num) => {
    const value = parseFloat(num.replace(",", ".")) * 1_000_000;
    results.push({ original: _, normalized: value });
    return value.toString();
  });

  const thousandPattern = /(\d+)\s*(nghìn|ngan|ngàn)/gi;
  result = result.replace(thousandPattern, (_, num) => {
    const value = parseInt(num, 10) * 1000;
    results.push({ original: _, normalized: value });
    return value.toString();
  });

  const kPattern = /(\d+)\s*k\b/gi;
  result = result.replace(kPattern, (_, num) => {
    const value = parseInt(num, 10) * 1000;
    results.push({ original: _, normalized: value });
    return value.toString();
  });

  return { text: result, normalized: results };
}

function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeInput(raw: string): NormalizedText {
  const original = raw.trim();
  const whitespaceCleaned = cleanWhitespace(original);
  const language = detectLanguage(whitespaceCleaned);

  const { converted } = convertInputMethod(whitespaceCleaned);

  const { cleaned: noFillers, removed: fillerRemoved } = removeFillerWords(converted);
  const { corrected, corrections } = correctDomainTerms(noFillers);
  const { text: numbersNormalized, normalized: numResults } = normalizeNumbers(corrected);

  const final = cleanWhitespace(numbersNormalized);

  return {
    text: final || original,
    original,
    language,
    corrections,
    filler_removed: fillerRemoved,
    numbers_normalized: numResults,
  };
}
