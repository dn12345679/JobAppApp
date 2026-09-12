import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  type AutoSettings,
  getActiveApiKey,
} from "./autoSettings";
import type { JobApplication, ResumeProfile } from "../types";

export type AiMatchStep =
  | "reading"
  | "analyzing"
  | "tailoring"
  | "done"
  | "error";

export interface AiMatchStepInfo {
  step: AiMatchStep;
  label: string;
  detail?: string;
  progress: number;
}

export interface BulletDiff {
  id: string;
  section: "Experience" | "Projects" | "Skills" | "Summary";
  entryId?: string;
  bulletIndex?: number;
  entryTitle: string;
  original: string;
  modified: string;
}

export interface KeywordMatchResult {
  modifiedProfile: ResumeProfile;
  keywordsMatched: string[];
  diffs: BulletDiff[];
}

export const MATCH_STEP_LABELS: Record<AiMatchStep, string> = {
  reading: "Reading résumé content…",
  analyzing: "Analyzing job requirements & extracting keywords…",
  tailoring: "Tailoring bullet points with targeted ATS keywords…",
  done: "Keywords matched and diff ready!",
  error: "Failed to match keywords",
};

function cleanJsonResponse(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return cleaned.trim();
}

/** Calls Google Gemini API */
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
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty text response");
  }
  return text;
}

/** Calls OpenAI API */
async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const targetModel = (model || "gpt-4o-mini").trim();
  const url = "https://api.openai.com/v1/chat/completions";

  const isO3 = targetModel.toLowerCase().startsWith("o3") || targetModel.toLowerCase().startsWith("o1");
  const payload: any = {
    model: targetModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  };

  if (!isO3) {
    payload.temperature = 0.2;
  }

  const res = await tauriFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI returned empty text response");
  }
  return text;
}

/** Calls Anthropic Claude API */
async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const targetModel = (model || "claude-3-5-haiku-latest").trim();
  const url = "https://api.anthropic.com/v1/messages";

  const res = await tauriFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: targetModel,
      max_tokens: 4096,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `${userPrompt}\n\nIMPORTANT: Respond ONLY with valid JSON. Do not wrap in markdown or backticks.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const text = data?.content?.[0]?.text;
  if (!text) {
    throw new Error("Anthropic returned empty text response");
  }
  return text;
}

/**
 * Matches keywords between a target job application and the candidate's résumé profile.
 * Only updates bullet points, skills items, and optional summary — does not alter
 * dates, companies, degree, or document layout.
 */
export async function matchKeywordsToResume(
  profile: ResumeProfile,
  job: JobApplication,
  settings: AutoSettings,
  onStep: (info: AiMatchStepInfo) => void,
): Promise<KeywordMatchResult> {
  const apiKey = getActiveApiKey(settings);
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${settings.aiProvider}. Please set your API key.`,
    );
  }

  // Step 1: Reading
  onStep({
    step: "reading",
    label: MATCH_STEP_LABELS.reading,
    detail: `Preparing résumé "${profile.name || "Untitled"}" and job details…`,
    progress: 20,
  });

  // Extract relevant resume bullet items with IDs
  const experiences = profile.experience.map((exp) => ({
    id: exp.id,
    company: exp.company,
    role: exp.role,
    bullets: exp.bullets || [],
  }));

  const projects = profile.projects.map((proj) => ({
    id: proj.id,
    name: proj.name,
    tech: proj.tech,
    bullets: proj.bullets || [],
  }));

  const skills = profile.skills.map((s) => ({
    id: s.id,
    label: s.label,
    items: s.items || [],
  }));

  const summary = profile.contact.summary || "";

  // Step 2: Analyzing
  onStep({
    step: "analyzing",
    label: MATCH_STEP_LABELS.analyzing,
    detail: `Extracting ATS keywords from ${job.title} at ${job.company}…`,
    progress: 45,
  });

  const systemPrompt = `You are an elite, human resume consultant specializing in natural, authentic ATS keyword optimization.
Your goal is surgical, high-impact tailoring: weave in missing target keywords ONLY where they fit naturally, without rewriting the entire resume.

HUMAN-SOUNDING WRITING RULES (CRITICAL):
1. STRICTLY FORBIDDEN AI BUZZWORDS & INFLATED VOCABULARY:
   NEVER use stereotypical AI filler words or inflated phrasing such as:
   - "spearheaded", "orchestrated", "leveraged", "synergized", "delved", "testament to"
   - "pivotal", "transformative", "revolutionized", "fostered", "streamlined", "utilized"
   - "tapestry", "beacon", "cutting-edge", "game-changing", "holistic", "seamlessly"
2. WRITE DIRECTLY & AUTHENTICALLY LIKE A REAL PRACTITIONER:
   Use direct, grounded action verbs that human engineers and professionals actually write:
   - "built", "designed", "wrote", "added", "improved", "shipped", "cut", "profiled", "debugged", "scaled", "managed", "deployed", "integrated", "refactored", "migrated".
   Keep sentences clear, concise, and punchy. Do not bloat bullet points with fluffy adjectives.
3. SURGICAL & SELECTIVE EDITS ONLY (DO NOT REWRITE EVERYTHING):
   - DO NOT rewrite bullets just to rephrase them.
   - ONLY modify the specific bullets (typically 2 to 5 bullets TOTAL across the entire resume) where a critical keyword or skill from the target job posting genuinely and naturally fits.
   - If a bullet does not need an ATS keyword or already describes work well, LEAVE IT UNCHANGED.
   - Preserve the candidate's original voice, tone, style, and bullet count.
4. FACTUAL INTEGRITY:
   - Do NOT invent fabricated metrics, false projects, or unearned credentials.
   - Only integrate technical terms, frameworks, tools, or domain keywords that align with the candidate's existing experience.

RESPONSE FORMAT (VALID JSON ONLY):
{
  "keywordsMatched": ["keyword1", "keyword2", ...],
  "summary": "Only modify if an essential target keyword fits naturally, otherwise keep identical or null",
  "experience": [
    {
      "id": "<id of experience entry>",
      "bullets": ["bullet 1", "bullet 2", ...]
    }
  ],
  "projects": [
    {
      "id": "<id of project entry>",
      "bullets": ["bullet 1", "bullet 2", ...]
    }
  ],
  "skills": [
    {
      "id": "<id of skill group>",
      "items": ["skill 1", "skill 2", ...]
    }
  ]
}
Note: For experience and projects, keep unchanged bullets identical so that only true keyword improvements are surfaced.`;

  const userPrompt = `TARGET JOB:
- Company: ${job.company}
- Job Title: ${job.title}
- Location: ${job.locationCity || ""}, ${job.locationState || ""} ${job.remote ? "(Remote)" : ""}
- Tags / Requirements: ${(job.tags || []).join(", ") || "None"}
- Job Description / Notes:
${(job.notes || "No description or notes provided").slice(0, 8000)}

CURRENT RÉSUMÉ CONTENT TO TAILOR:
Summary / Headline: "${summary}"

Experience Entries:
${JSON.stringify(experiences, null, 2)}

Projects:
${JSON.stringify(projects, null, 2)}

Skill Groups:
${JSON.stringify(skills, null, 2)}
`;

  // Step 3: Tailoring
  onStep({
    step: "tailoring",
    label: MATCH_STEP_LABELS.tailoring,
    detail: "Synthesizing natural, keyword-optimized bullets…",
    progress: 75,
  });

  let aiRawResponse = "";
  try {
    if (settings.aiProvider === "gemini") {
      aiRawResponse = await callGemini(apiKey, settings.aiModel, systemPrompt, userPrompt);
    } else if (settings.aiProvider === "anthropic") {
      aiRawResponse = await callAnthropic(apiKey, settings.aiModel, systemPrompt, userPrompt);
    } else {
      aiRawResponse = await callOpenAI(apiKey, settings.aiModel, systemPrompt, userPrompt);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`AI keyword matching failed: ${msg}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleanJsonResponse(aiRawResponse));
  } catch {
    throw new Error("AI returned invalid JSON. Please try again.");
  }

  // Construct modified profile & compute bullet diffs
  const diffs: BulletDiff[] = [];
  const modifiedProfile: ResumeProfile = JSON.parse(JSON.stringify(profile));

  // 1. Summary diff
  if (typeof parsed.summary === "string" && parsed.summary.trim()) {
    const origSummary = profile.contact.summary || "";
    const newSummary = parsed.summary.trim();
    if (origSummary !== newSummary && newSummary.toLowerCase() !== origSummary.toLowerCase()) {
      diffs.push({
        id: "summary",
        section: "Summary",
        entryTitle: "Professional Summary",
        original: origSummary || "(No summary)",
        modified: newSummary,
      });
      modifiedProfile.contact.summary = newSummary;
    }
  }

  // 2. Experience diffs
  if (Array.isArray(parsed.experience)) {
    const expMap = new Map<string, string[]>();
    for (const item of parsed.experience) {
      if (item && typeof item.id === "string" && Array.isArray(item.bullets)) {
        expMap.set(item.id, item.bullets.map(String));
      }
    }

    modifiedProfile.experience = modifiedProfile.experience.map((exp) => {
      const newBullets = expMap.get(exp.id);
      if (!newBullets || newBullets.length === 0) return exp;

      // Track diffs per bullet
      const origBullets = exp.bullets || [];
      const title = `${exp.company}${exp.role ? ` — ${exp.role}` : ""}`;

      for (let i = 0; i < Math.max(origBullets.length, newBullets.length); i++) {
        const orig = (origBullets[i] || "").trim();
        const mod = (newBullets[i] || "").trim();
        if (orig !== mod && mod && orig) {
          diffs.push({
            id: `exp-${exp.id}-${i}`,
            section: "Experience",
            entryId: exp.id,
            bulletIndex: i,
            entryTitle: title,
            original: orig,
            modified: mod,
          });
        }
      }

      return {
        ...exp,
        bullets: newBullets,
      };
    });
  }

  // 3. Project diffs
  if (Array.isArray(parsed.projects)) {
    const projMap = new Map<string, string[]>();
    for (const item of parsed.projects) {
      if (item && typeof item.id === "string" && Array.isArray(item.bullets)) {
        projMap.set(item.id, item.bullets.map(String));
      }
    }

    modifiedProfile.projects = modifiedProfile.projects.map((proj) => {
      const newBullets = projMap.get(proj.id);
      if (!newBullets || newBullets.length === 0) return proj;

      const origBullets = proj.bullets || [];
      for (let i = 0; i < Math.max(origBullets.length, newBullets.length); i++) {
        const orig = (origBullets[i] || "").trim();
        const mod = (newBullets[i] || "").trim();
        if (orig !== mod && mod && orig) {
          diffs.push({
            id: `proj-${proj.id}-${i}`,
            section: "Projects",
            entryId: proj.id,
            bulletIndex: i,
            entryTitle: proj.name,
            original: orig,
            modified: mod,
          });
        }
      }

      return {
        ...proj,
        bullets: newBullets,
      };
    });
  }

  // 4. Skills diffs
  if (Array.isArray(parsed.skills)) {
    const skillMap = new Map<string, string[]>();
    for (const item of parsed.skills) {
      if (item && typeof item.id === "string" && Array.isArray(item.items)) {
        skillMap.set(item.id, item.items.map(String));
      }
    }

    modifiedProfile.skills = modifiedProfile.skills.map((group) => {
      const newItems = skillMap.get(group.id);
      if (!newItems || newItems.length === 0) return group;

      const origStr = (group.items || []).join(", ");
      const newStr = newItems.join(", ");
      if (origStr !== newStr) {
        diffs.push({
          id: `skill-${group.id}`,
          section: "Skills",
          entryId: group.id,
          entryTitle: group.label || "Skills",
          original: origStr || "(None)",
          modified: newStr,
        });
      }

      return {
        ...group,
        items: newItems,
      };
    });
  }

  const keywordsMatched: string[] = Array.isArray(parsed.keywordsMatched)
    ? parsed.keywordsMatched.map(String).filter(Boolean)
    : [];

  onStep({
    step: "done",
    label: MATCH_STEP_LABELS.done,
    progress: 100,
  });

  return {
    modifiedProfile,
    keywordsMatched,
    diffs,
  };
}

/**
 * Applies only the selected diff items to the baseline profile,
 * leaving unselected bullets strictly unchanged.
 */
export function applySelectedDiffs(
  baselineProfile: ResumeProfile,
  diffs: BulletDiff[],
  selectedIds: Set<string>,
): ResumeProfile {
  const result: ResumeProfile = JSON.parse(JSON.stringify(baselineProfile));
  const activeDiffs = diffs.filter((d) => selectedIds.has(d.id));

  for (const diff of activeDiffs) {
    if (diff.section === "Summary") {
      result.contact.summary = diff.modified;
    } else if (
      diff.section === "Experience" &&
      diff.entryId &&
      diff.bulletIndex !== undefined
    ) {
      const exp = result.experience.find((e) => e.id === diff.entryId);
      if (exp && exp.bullets && diff.bulletIndex < exp.bullets.length) {
        exp.bullets[diff.bulletIndex] = diff.modified;
      }
    } else if (
      diff.section === "Projects" &&
      diff.entryId &&
      diff.bulletIndex !== undefined
    ) {
      const proj = result.projects.find((p) => p.id === diff.entryId);
      if (proj && proj.bullets && diff.bulletIndex < proj.bullets.length) {
        proj.bullets[diff.bulletIndex] = diff.modified;
      }
    } else if (diff.section === "Skills" && diff.entryId) {
      const skill = result.skills.find((s) => s.id === diff.entryId);
      if (skill) {
        skill.items = diff.modified.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
  }

  return result;
}
