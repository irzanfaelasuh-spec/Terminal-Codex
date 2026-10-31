export interface GeminiModel {
  name: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

export interface GeminiTurn {
  role: 'user' | 'model';
  text: string;
}

export interface GeminiReply {
  text: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason?: string;
}

function parseApiError(payload: unknown, status: number): string {
  const message = typeof payload === 'object' && payload !== null && 'error' in payload
    ? String((payload as { error?: { message?: string } }).error?.message ?? '')
    : '';
  if (status === 400) return `Gemini rejected the request: ${message || 'Check the selected model and request.'}`;
  if (status === 401 || status === 403) return 'Gemini API key is invalid or does not have access to this model.';
  if (status === 404) return 'The selected Gemini model was not found. Refresh the Models list and choose another model.';
  if (status === 429) return `Gemini rate limit reached: ${message || 'Wait for Google quota to become available.'}`;
  if (status >= 500) return 'Gemini service is temporarily unavailable. Try again shortly.';
  return message || `Gemini request failed (${status}).`;
}

export async function fetchGeminiModels(apiKey: string): Promise<GeminiModel[]> {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    headers: { 'x-goog-api-key': apiKey }
  });
  const payload = await response.json() as { models?: Array<GeminiModel & { supportedGenerationMethods?: string[] }> };
  if (!response.ok) throw new Error(parseApiError(payload, response.status));
  return (payload.models ?? [])
    .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function generateGeminiReply(
  apiKey: string,
  model: string,
  history: GeminiTurn[],
  userPrompt: string
): Promise<GeminiReply> {
  const content = [
    ...history.slice(-20).map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    { role: 'user', parts: [{ text: userPrompt }] }
  ];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: 'You are CodEX ai, a precise programming and terminal assistant. Give practical, accurate answers. When asked to create code, return complete working code in fenced code blocks and include a sensible filename in the opening fence when useful, such as ```ts filename="src/example.ts". Explain setup steps briefly. Do not pretend to have executed code or accessed the user device.' }]
      },
      contents: content,
      generationConfig: {
        temperature: 0.65,
        topP: 0.92,
        maxOutputTokens: 8192
      }
    })
  });

  const payload = await response.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
  };
  if (!response.ok) throw new Error(parseApiError(payload, response.status));
  const text = (payload.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini returned an empty response. Try again or choose another model.');
  const inputTokens = payload.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? 0;
  return {
    text,
    inputTokens,
    outputTokens,
    totalTokens: payload.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens,
    finishReason: payload.candidates?.[0]?.finishReason
  };
}

export function extractCodeBlocks(text: string): Array<{ language: string; filename: string; code: string }> {
  const results: Array<{ language: string; filename: string; code: string }> = [];
  const expression = /```([\w+#.-]*)(?:\s+filename=["']([^"']+)["'])?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let index = 1;
  while ((match = expression.exec(text)) !== null) {
    const language = match[1] || 'text';
    const code = match[3].replace(/\n$/, '');
    const filename = match[2] || `codex-output-${index}.${extensionForLanguage(language)}`;
    results.push({ language, filename, code });
    index += 1;
  }
  return results;
}

function extensionForLanguage(language: string): string {
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', html: 'html', css: 'css', json: 'json',
    py: 'py', python: 'py', java: 'java', c: 'c', cpp: 'cpp', cs: 'cs', csharp: 'cs',
    sh: 'sh', bash: 'sh', sql: 'sql', yaml: 'yml', yml: 'yml', xml: 'xml', rust: 'rs',
    go: 'go', php: 'php', kotlin: 'kt', swift: 'swift', lua: 'lua', text: 'txt'
  };
  return map[language.toLowerCase()] ?? 'txt';
}
