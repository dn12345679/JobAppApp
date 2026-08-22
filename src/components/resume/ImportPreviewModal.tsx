import { motion } from "framer-motion";
import ModalPortal from "../ModalPortal";
import type { ResumeProfile } from "../../types";
import { PAGE_H, PAGE_W, Sheet } from "./ResumePreview";

// Read-only preview of a sanitised import candidate. The résumé is shown exactly
// as it will render (scaled down), with a summary of what was found — but NOTHING
// is editable here and NOTHING is written until "Import" is pressed. Editing only
// becomes possible once the résumé is actually created, preserving data integrity.

const THUMB_W = 320;

export default function ImportPreviewModal({
  profile,
  onConfirm,
  onCancel,
}: {
  profile: ResumeProfile;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const scale = THUMB_W / PAGE_W;
  const counts = [
    { label: "Experience", n: profile.experience.length },
    { label: "Education", n: profile.education.length },
    { label: "Projects", n: profile.projects.length },
    { label: "Skills", n: profile.skills.length },
  ];
  const hasContact = Boolean(
    profile.contact.fullName.trim() ||
      profile.contact.email ||
      profile.contact.phone,
  );

  return (
    <ModalPortal>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      >
        <motion.div
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.96, y: 12 }}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
        >
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">
              Import résumé — preview
            </h2>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-200">
              ✕
            </button>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Read-only preview. Nothing is saved until you press Import; you can edit
            after it’s added.
          </p>

          <div className="flex flex-1 gap-4 overflow-hidden">
            {/* Scaled, non-interactive render of the candidate. */}
            <div className="flex-none overflow-auto rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <div
                style={{
                  width: THUMB_W,
                  height: PAGE_H * scale,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    width: PAGE_W,
                    pointerEvents: "none",
                  }}
                >
                  <Sheet profile={profile} bare />
                </div>
              </div>
            </div>

            {/* Summary of what the sanitiser found. */}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="mb-1 text-xs text-slate-500">Name</div>
              <div className="mb-4 truncate text-sm font-medium text-slate-100">
                {profile.name}
              </div>

              <div className="mb-1 text-xs text-slate-500">Contents</div>
              <ul className="mb-4 space-y-1 text-sm text-slate-300">
                <li className="flex justify-between">
                  <span>Contact details</span>
                  <span className={hasContact ? "text-emerald-300" : "text-slate-500"}>
                    {hasContact ? "found" : "none"}
                  </span>
                </li>
                {counts.map((c) => (
                  <li key={c.label} className="flex justify-between">
                    <span>{c.label}</span>
                    <span className={c.n ? "text-slate-100" : "text-slate-500"}>
                      {c.n}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-slate-500">
                Unrecognised or malformed fields were dropped and replaced with
                blanks. This will be added as a new résumé.
              </p>

              <div className="mt-auto flex justify-end gap-2 pt-4">
                <button
                  onClick={onCancel}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-600 hover:text-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
                >
                  Import
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </ModalPortal>
  );
}
