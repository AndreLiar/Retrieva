/**
 * Prompt Injection Detection Utility
 *
 * SECURITY FIX (LLM01): Advanced prompt injection detection with:
 * 1. Unicode/homoglyph normalization to defeat visual bypasses
 * 2. Leet-speak (1337) detection and normalization
 * 3. Semantic pattern matching beyond simple regex
 * 4. Confidence scoring for injection likelihood
 */

import logger from '../../config/logger.js';

/**
 * Unicode homoglyph mapping for normalization
 * Maps visually similar characters to their ASCII equivalents
 */
const HOMOGLYPH_MAP = {
  // Latin-like characters
  а: 'a',
  ą: 'a',
  ä: 'a',
  á: 'a',
  à: 'a',
  â: 'a',
  ã: 'a',
  å: 'a',
  ā: 'a',
  ă: 'a',
  е: 'e',
  ę: 'e',
  ë: 'e',
  é: 'e',
  è: 'e',
  ê: 'e',
  ē: 'e',
  ė: 'e',
  ě: 'e',
  і: 'i',
  ï: 'i',
  í: 'i',
  ì: 'i',
  î: 'i',
  ī: 'i',
  ı: 'i',
  ĩ: 'i',
  о: 'o',
  ö: 'o',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ō: 'o',
  ø: 'o',
  υ: 'u',
  ü: 'u',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ū: 'u',
  ů: 'u',
  ý: 'y',
  ÿ: 'y',
  у: 'y',
  с: 'c',
  ç: 'c',
  ć: 'c',
  č: 'c',
  р: 'p',
  ρ: 'p',
  ѕ: 's',
  ś: 's',
  š: 's',
  ş: 's',
  ń: 'n',
  ñ: 'n',
  ň: 'n',
  ż: 'z',
  ź: 'z',
  ž: 'z',
  ł: 'l',
  ľ: 'l',
  ß: 'ss',
  // Cyrillic lookalikes
  А: 'A',
  В: 'B',
  С: 'C',
  Е: 'E',
  Н: 'H',
  К: 'K',
  М: 'M',
  О: 'O',
  Р: 'P',
  Т: 'T',
  Х: 'X',
  // Greek lookalikes
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
  Ζ: 'Z',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  τ: 't',
  χ: 'x',
};

/**
 * Leet-speak (1337) character mapping
 */
const LEET_MAP = {
  0: 'o',
  1: 'i',
  2: 'z',
  3: 'e',
  4: 'a',
  5: 's',
  6: 'g',
  7: 't',
  8: 'b',
  9: 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '+': 't',
  '|': 'l',
  '(': 'c',
  ')': 'c',
  '[': 'c',
  ']': 'c',
  '{': 'c',
  '}': 'c',
  '<': 'c',
  '>': 'c',
  '\/': 'v',
  '\\': 'v',
  '^': 'a',
  '*': 'a',
  '|\\|': 'n',
  '|/|': 'n',
  '/\\/': 'm',
  '|\\/|': 'm',
  '|-|': 'h',
  '#': 'h',
  '|=': 'f',
  ph: 'f',
};

/**
 * Normalize text by converting homoglyphs and leet-speak to ASCII
 * @param {string} text - Input text
 * @returns {string} - Normalized text
 */
export function normalizeText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let normalized = text.toLowerCase();

  // Apply homoglyph normalization
  for (const [char, replacement] of Object.entries(HOMOGLYPH_MAP)) {
    normalized = normalized.split(char).join(replacement);
  }

  // Apply leet-speak normalization (multi-char patterns first)
  const sortedLeet = Object.entries(LEET_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [pattern, replacement] of sortedLeet) {
    normalized = normalized.split(pattern).join(replacement);
  }

  // Remove zero-width characters and other invisible Unicode
  normalized = normalized.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '');

  // Normalize whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Injection patterns with descriptions for logging
 */
const INJECTION_PATTERNS = [
  // Instruction override attempts
  {
    pattern:
      /ignore\s+(all\s+)?(previous|prior|above|earlier|original)\s+(instructions?|context|rules?|prompts?)/i,
    category: 'instruction_override',
    severity: 'critical',
  },
  {
    pattern: /disregard\s+(the\s+)?(context|instructions?|rules?|system|above|everything)/i,
    category: 'instruction_override',
    severity: 'critical',
  },
  {
    pattern: /forget\s+(everything|all|what|your)\s*(you|i)?\s*(told|said|know|learned)?/i,
    category: 'instruction_override',
    severity: 'critical',
  },
  {
    pattern: /do\s+not\s+follow\s+(the\s+)?(above|previous|system)/i,
    category: 'instruction_override',
    severity: 'critical',
  },
  {
    pattern: /override\s+(the\s+)?(system|previous|default)/i,
    category: 'instruction_override',
    severity: 'critical',
  },
  { pattern: /new\s+instructions?\s*:/i, category: 'instruction_override', severity: 'high' },

  // Role manipulation
  {
    pattern: /you\s+are\s+now\s+(a|an|the|my)/i,
    category: 'role_manipulation',
    severity: 'critical',
  },
  {
    pattern: /pretend\s+(you\s+are|to\s+be|you're)/i,
    category: 'role_manipulation',
    severity: 'critical',
  },
  { pattern: /act\s+as\s+(if|though|a|an|my)/i, category: 'role_manipulation', severity: 'high' },
  { pattern: /from\s+now\s+on,?\s+you/i, category: 'role_manipulation', severity: 'critical' },
  { pattern: /roleplay\s+as/i, category: 'role_manipulation', severity: 'high' },
  { pattern: /imagine\s+you\s+are/i, category: 'role_manipulation', severity: 'medium' },
  { pattern: /switch\s+(to|into)\s+.+\s+mode/i, category: 'role_manipulation', severity: 'high' },

  // System prompt extraction
  {
    pattern:
      /what\s+(are|is|were)\s+(your|the)\s+(system\s+)?(prompt|instructions?|rules?|guidelines?)/i,
    category: 'prompt_extraction',
    severity: 'high',
  },
  {
    pattern: /show\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instructions?|configuration)/i,
    category: 'prompt_extraction',
    severity: 'high',
  },
  {
    pattern: /reveal\s+(your|the)\s+(system\s+)?(prompt|instructions?|secrets?)/i,
    category: 'prompt_extraction',
    severity: 'high',
  },
  {
    pattern: /print\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
    category: 'prompt_extraction',
    severity: 'high',
  },
  {
    pattern: /repeat\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
    category: 'prompt_extraction',
    severity: 'high',
  },
  {
    pattern: /output\s+(your|the)\s+(system\s+)?(prompt|instructions?)/i,
    category: 'prompt_extraction',
    severity: 'high',
  },

  // Known jailbreak patterns
  { pattern: /\bDAN\b/, category: 'jailbreak', severity: 'critical' },
  { pattern: /\bAIM\b/, category: 'jailbreak', severity: 'high' },
  { pattern: /developer\s+mode/i, category: 'jailbreak', severity: 'critical' },
  { pattern: /jailbreak/i, category: 'jailbreak', severity: 'critical' },
  {
    pattern: /bypass\s+(the\s+)?(safety|filter|restriction|guardrail)/i,
    category: 'jailbreak',
    severity: 'critical',
  },
  {
    pattern: /disable\s+(your\s+)?(safety|filter|restriction|guardrail)/i,
    category: 'jailbreak',
    severity: 'critical',
  },
  { pattern: /unrestricted\s+mode/i, category: 'jailbreak', severity: 'critical' },
  {
    pattern: /no\s+(rules?|restrictions?|limits?|filters?)/i,
    category: 'jailbreak',
    severity: 'high',
  },

  // Output manipulation
  {
    pattern: /respond\s+(only\s+)?with\s*(exactly)?/i,
    category: 'output_manipulation',
    severity: 'medium',
  },
  {
    pattern: /your\s+(only\s+)?response\s+(should|must|will)\s+be/i,
    category: 'output_manipulation',
    severity: 'medium',
  },
  { pattern: /output\s+(only|exactly|just)/i, category: 'output_manipulation', severity: 'medium' },
  {
    pattern: /say\s+(only|exactly|nothing\s+but)/i,
    category: 'output_manipulation',
    severity: 'medium',
  },
  {
    pattern: /reply\s+with\s+(only|just|exactly)/i,
    category: 'output_manipulation',
    severity: 'medium',
  },

  // Code/command injection
  {
    pattern: /execute\s+(this|the\s+following)\s+(code|command|script)/i,
    category: 'code_injection',
    severity: 'critical',
  },
  {
    pattern: /run\s+(this|the\s+following)\s+(code|command|script)/i,
    category: 'code_injection',
    severity: 'critical',
  },
  { pattern: /\beval\s*\(/i, category: 'code_injection', severity: 'critical' },
  { pattern: /\bexec\s*\(/i, category: 'code_injection', severity: 'critical' },
  { pattern: /<script[\s>]/i, category: 'code_injection', severity: 'critical' },

  // Delimiter escape attempts
  { pattern: /<\/user_question>/i, category: 'delimiter_escape', severity: 'critical' },
  { pattern: /<\/system>/i, category: 'delimiter_escape', severity: 'critical' },
  {
    pattern: /\[end\s+of\s+(user\s+)?(input|question|message)\]/i,
    category: 'delimiter_escape',
    severity: 'high',
  },
  { pattern: /\[system\]/i, category: 'delimiter_escape', severity: 'high' },
  { pattern: /```system/i, category: 'delimiter_escape', severity: 'high' },
];

/**
 * Analyze text for prompt injection attempts
 * @param {string} text - User input to analyze
 * @returns {Object} Analysis result with score and detected patterns
 */
export function analyzeForInjection(text) {
  if (!text || typeof text !== 'string') {
    return {
      isInjection: false,
      score: 0,
      patterns: [],
      normalizedText: '',
    };
  }

  // Normalize the text to defeat obfuscation
  const normalizedText = normalizeText(text);

  const detectedPatterns = [];
  let totalScore = 0;

  // Severity score mapping
  const severityScores = {
    critical: 100,
    high: 60,
    medium: 30,
    low: 10,
  };

  // Test each pattern against both original and normalized text
  for (const { pattern, category, severity } of INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    const matchesOriginal = pattern.test(text);
    pattern.lastIndex = 0;
    const matchesNormalized = pattern.test(normalizedText);

    if (matchesOriginal || matchesNormalized) {
      const score = severityScores[severity] || 10;
      totalScore += score;

      detectedPatterns.push({
        category,
        severity,
        score,
        pattern: pattern.source.substring(0, 50),
        matchedNormalized: matchesNormalized && !matchesOriginal,
      });
    }
  }

  // Additional heuristics
  const heuristicScore = analyzeHeuristics(text, normalizedText);
  totalScore += heuristicScore.score;
  if (heuristicScore.flags.length > 0) {
    detectedPatterns.push({
      category: 'heuristic',
      severity: heuristicScore.score > 30 ? 'high' : 'medium',
      score: heuristicScore.score,
      flags: heuristicScore.flags,
    });
  }

  // Determine if this is likely an injection (threshold: 50)
  const isInjection = totalScore >= 50;

  return {
    isInjection,
    score: Math.min(totalScore, 200), // Cap at 200
    patterns: detectedPatterns,
    normalizedText,
  };
}

/**
 * Additional heuristic checks for suspicious patterns
 */
function analyzeHeuristics(originalText, normalizedText) {
  const flags = [];
  let score = 0;

  // Check for high ratio of non-ASCII to ASCII characters (obfuscation attempt)
  const nonAsciiCount = (originalText.match(/[^\x00-\x7F]/g) || []).length;
  const asciiCount = originalText.length - nonAsciiCount;
  if (asciiCount > 0 && nonAsciiCount / asciiCount > 0.3) {
    flags.push('high_non_ascii_ratio');
    score += 20;
  }

  // Check for excessive use of numbers mixed with letters (leet speak)
  const leetPattern = /[a-z]+[0-9]+[a-z]+|[0-9]+[a-z]+[0-9]+/gi;
  const leetMatches = (originalText.match(leetPattern) || []).length;
  if (leetMatches > 3) {
    flags.push('leet_speak_detected');
    score += 15;
  }

  // Check for multiple instruction-like sentences
  const instructionIndicators = (
    normalizedText.match(/\b(must|should|will|shall|need\s+to|have\s+to)\b/gi) || []
  ).length;
  if (instructionIndicators > 3) {
    flags.push('multiple_instruction_indicators');
    score += 10;
  }

  // Check for system-like keywords
  const systemKeywords = (
    normalizedText.match(/\b(system|prompt|instruction|context|rule|constraint)\b/gi) || []
  ).length;
  if (systemKeywords > 2) {
    flags.push('system_keywords_detected');
    score += 15;
  }

  return { flags, score };
}

/**
 * Validate user input and return sanitized version if safe
 * @param {string} input - User input to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateInput(input, options = {}) {
  const { allowPartial = false, maxLength = 2000 } = options;

  if (!input || typeof input !== 'string') {
    return {
      valid: false,
      reason: 'Input must be a non-empty string',
      sanitized: null,
    };
  }

  // Length check
  if (input.length > maxLength) {
    return {
      valid: false,
      reason: `Input exceeds maximum length of ${maxLength}`,
      sanitized: null,
    };
  }

  // Analyze for injection
  const analysis = analyzeForInjection(input);

  if (analysis.isInjection) {
    logger.warn('Prompt injection attempt detected', {
      service: 'prompt-injection-detector',
      score: analysis.score,
      patterns: analysis.patterns.map((p) => p.category),
      inputPreview: input.substring(0, 100),
    });

    if (!allowPartial) {
      return {
        valid: false,
        reason: 'Potential prompt injection detected',
        score: analysis.score,
        patterns: analysis.patterns,
        sanitized: null,
      };
    }
  }

  return {
    valid: true,
    score: analysis.score,
    patterns: analysis.patterns,
    sanitized: input, // Original input if valid
    wasNormalized: analysis.normalizedText !== input.toLowerCase(),
  };
}

export default {
  normalizeText,
  analyzeForInjection,
  validateInput,
};
