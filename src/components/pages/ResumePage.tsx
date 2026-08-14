import { useEffect, useRef, useState } from "react";
import type { ResumeProfile } from "../../types";
import { getResumeProfile, saveResumeProfile } from "../../lib/db";
import ProfileEditor from "../resume/ProfileEditor";
import ResumePreview from "../resume/ResumePreview";

// The Tools › Résumé screen: structured Profile editor (left) + live one-page
// preview (right). The Profile is the source of truth; the résumé is a view over
// it (DESIGN.md §11). Edits save to SQLite (debounced) and mark the row dirty
// for the next sync.
export default function ResumePage({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<ResumeProfile | null>(null);
  const [savedAt, setSavedAt] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<ResumeProfile | null>(null);

  useEffect(() => {
    let alive = true;
    getResumeProfile(userId).then((p) => {
      if (alive) setProfile(p);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // On unmount (e.g. a fast tab-switch), cancel the debounce and flush any
  // still-pending edit so it isn't dropped.
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (pending.current) void saveResumeProfile(pending.current);
    },
    [],
  );

  function update(next: ResumeProfile) {
    setProfile(next);
    pending.current = next;
    setSavedAt("saving");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      pending.current = null;
      await saveResumeProfile(next);
      setSavedAt("saved");
    }, 500);
  }

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-slate-800">
      <aside className="w-80 flex-none overflow-auto border-r border-slate-800">
        <ProfileEditor profile={profile} onChange={update} savedAt={savedAt} />
      </aside>
      <ResumePreview profile={profile} onChange={update} />
    </div>
  );
}
