import { motion } from "framer-motion";
import ModalPortal from "../ModalPortal";
import type { CoverLetter } from "../../types";
import { CoverSheet, PAGE_H, PAGE_W } from "./CoverLetterPreview";

const THUMB_W = 320;

// Read-only preview of a sanitised import candidate. Nothing is written until
// "Import" is pressed; editing is only possible once it's a real cover letter.
export default function CoverLetterImportPreviewModal({
  letter,
  onConfirm,
  onCancel,
}: {
  letter: CoverLetter;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const scale = THUMB_W / PAGE_W;

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
              Import cover letter — preview
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
            <div className="flex-none overflow-auto rounded-lg border border-slate-700 bg-slate-900/60 p-3">
              <div style={{ width: THUMB_W, height: PAGE_H * scale, overflow: "hidden" }}>
                <div
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    width: PAGE_W,
                    pointerEvents: "none",
                  }}
                >
                  <CoverSheet letter={letter} bare />
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              <div className="mb-1 text-xs text-slate-500">Name</div>
              <div className="mb-4 truncate text-sm font-medium text-slate-100">
                {letter.name}
              </div>
              <p className="text-xs text-slate-500">
                Unrecognised or malformed fields were dropped and replaced with
                blanks. This will be added as a new cover letter.
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
