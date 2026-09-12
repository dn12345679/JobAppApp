import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  type AutoSettings,
  getActiveApiKey,
  PROVIDER_OPTIONS,
} from "./autoSettings";
import type { JobApplication } from "../types";

export type AiFillStep =
  | "fetching"
  | "reading"
  | "building"
  | "done"
  | "error";

export interface AiFillStepInfo {
  step: AiFillStep;
  label: string;
  detail?: string;
}

export const STEP_LABELS: Record<AiFillStep, string> = {
  fetching: "Fetching page content…",
  reading: "Reading job description…",
  building: "Building your application…",
  done: "Application data ready!",
  error: "Failed to extract job details",
};

/** Strips HTML scripts, styles, and tags to extract readable text */
export function extractTextFromHtml(html: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Remove unwanted elements
    const unwanted = doc.querySelectorAll("script, style, svg, noscript, nav, footer, header, iframe");
    unwanted.forEach((el) => el.remove());

    // Prefer main or article if present, otherwise body
    const container = doc.querySelector("main") || doc.querySelector("article") || doc.body;
    const text = container ? (container.textContent || "") : "";

    return text
      .replace(/[\r\n\t]+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 30000); // limit to ~30k chars to stay comfortably in context window
  } catch {
    // Fallback regex strip
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30000);
  }
}

function cleanJsonResponse(raw: string): string {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }
  return text;
}

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await tauriFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsedErr = "";
    try {
      parsedErr = JSON.parse(errText)?.error?.message || "";
    } catch {}
    throw new Error(parsedErr || `OpenAI API error (${res.status}): ${res.statusText}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const targetModel = (model || "gemini-3.6-flash").trim().replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    targetModel,
  )}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const res = await tauriFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsedErr = "";
    try {
      parsedErr = JSON.parse(errText)?.error?.message || "";
    } catch {}
    throw new Error(parsedErr || `Gemini API error (${res.status}): ${res.statusText}`);
  }

  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const res = await tauriFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || "claude-3-5-haiku-latest",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${userPrompt}\n\nRespond ONLY with valid JSON matching the schema. No markdown or backticks.`,
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let parsedErr = "";
    try {
      parsedErr = JSON.parse(errText)?.error?.message || "";
    } catch {}
    throw new Error(parsedErr || `Anthropic API error (${res.status}): ${res.statusText}`);
  }

  const json = await res.json();
  return json.content?.[0]?.text || "";
}

export async function fillJobFromUrl(
  url: string,
  settings: AutoSettings,
  existingTags: string[],
  onStep: (info: AiFillStepInfo) => void,
): Promise<Partial<JobApplication>> {
  const apiKey = getActiveApiKey(settings);
  if (!apiKey.trim()) {
    const provName =
      PROVIDER_OPTIONS.find((p) => p.id === settings.aiProvider)?.name ||
      settings.aiProvider;
    throw new Error(`Missing ${provName} API key. Please enter your API key.`);
  }

  // Phase 1: Fetching
  onStep({
    step: "fetching",
    label: STEP_LABELS.fetching,
    detail: `Connecting to ${new URL(url).hostname}…`,
  });

  let rawHtml = "";
  try {
    const res = await tauriFetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    rawHtml = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch page from URL: ${msg}`);
  }

  const pageText = extractTextFromHtml(rawHtml);
  if (!pageText || pageText.length < 50) {
    throw new Error(
      "The page content appears empty or blocked by a bot challenge. Try copying key details manually.",
    );
  }

  // Phase 2: Reading
  onStep({
    step: "reading",
    label: STEP_LABELS.reading,
    detail: `Analyzing job title, company, salary, and requirements with ${
      PROVIDER_OPTIONS.find((p) => p.id === settings.aiProvider)?.name || "AI"
    }…`,
  });

  const systemPrompt = `You are an expert career and job application assistant.
Analyze the provided job posting text extracted from a job webpage and extract structured application information as JSON.

Schema fields:
- "company": string (Required. Company or organization name offering the job)
- "title": string (Required. Job title or role name)
- "locationCity": string or null (City name if listed)
- "locationState": string or null (State/Province code or name if listed)
- "remote": boolean (true if remote or hybrid, false otherwise)
- "payMin": number or null (Minimum pay number, without dollar signs or commas. If annual, e.g. 120000. If hourly, e.g. 45)
- "payMax": number or null (Maximum pay number, without dollar signs or commas)
- "hourly": boolean (true if pay is hourly, false if annual salary)
- "deadline": string or null (Application deadline in ISO format "YYYY-MM-DD" if mentioned, otherwise null)
- "notes": string or null (A concise 1 to 2 sentence summary of the role and its primary purpose. Maximum 2 sentences. Do NOT exceed 2 sentences.)
- "tags": array of strings (Select ONLY matching tags from the allowed tag list. Allowed tags: ${JSON.stringify(existingTags)}. If none match or allowed list is empty, return []. NEVER create or output tags that are not in this allowed list.)

CRITICAL CONSTRAINTS:
1. Do NOT invent tags not in the allowed list: ${JSON.stringify(existingTags)}.
2. Notes must be strictly 1-2 sentences summarizing the role.
3. Output MUST be valid JSON only. Do not include markdown code fence formatting like \`\`\`json.`;

  let aiRawResponse = "";
  try {
    const userPrompt = `Job URL: ${url}\n\nWebpage content:\n${pageText}`;
    if (settings.aiProvider === "gemini") {
      aiRawResponse = await callGemini(apiKey, settings.aiModel, systemPrompt, userPrompt);
    } else if (settings.aiProvider === "anthropic") {
      aiRawResponse = await callAnthropic(apiKey, settings.aiModel, systemPrompt, userPrompt);
    } else {
      aiRawResponse = await callOpenAI(apiKey, settings.aiModel, systemPrompt, userPrompt);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`AI processing failed: ${msg}`);
  }

  // Phase 3: Building
  onStep({
    step: "building",
    label: STEP_LABELS.building,
    detail: "Formatting and validating extracted fields…",
  });

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJsonResponse(aiRawResponse));
  } catch {
    throw new Error("AI returned invalid JSON. Please try again.");
  }

  // Validate and sanitize tags: only existingTags allowed!
  const allowedTagSet = new Set(existingTags);
  const validatedTags: string[] = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t: unknown): t is string => typeof t === "string" && allowedTagSet.has(t))
    : [];

  const partial: Partial<JobApplication> = {
    company: typeof parsed.company === "string" ? parsed.company.trim() : "",
    title: typeof parsed.title === "string" ? parsed.title.trim() : "",
    locationCity: typeof parsed.locationCity === "string" ? parsed.locationCity.trim() || null : null,
    locationState: typeof parsed.locationState === "string" ? parsed.locationState.trim() || null : null,
    remote: Boolean(parsed.remote),
    payMin: typeof parsed.payMin === "number" && !isNaN(parsed.payMin) ? parsed.payMin : null,
    payMax: typeof parsed.payMax === "number" && !isNaN(parsed.payMax) ? parsed.payMax : null,
    hourly: Boolean(parsed.hourly),
    deadline: typeof parsed.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.deadline) ? parsed.deadline : null,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim() || null : null,
    link: url.trim(),
    tags: validatedTags,
  };

  onStep({
    step: "done",
    label: STEP_LABELS.done,
  });

  return partial;
}
