// ─── ModalOverlay ─────────────────────────────────────────────
// Reusable modal overlay wrapper.
//
// ⚠️  STACKING CONTEXT BUG FIX (previous implementation):
// The old version rendered the backdrop `<div>` (which carries
// `backdrop-filter: blur(...)`) as a sibling of `children`
// inside the same `fixed` container. CSS `backdrop-filter`
// creates a new stacking context AND causes the browser to apply
// the blur to the *entire layer* that includes the element,
// which visually bleeds into sibling elements rendered after it
// in the same stacking context — blurring the modal panel too.
//
// Fix: render the blurred backdrop in its own `fixed` div at
// z-[100], and render the modal panel in a *separate* `fixed`
// div at z-[101]. Entirely separate stacking contexts mean the
// backdrop-blur can never propagate into the panel layer.
//
// Props:
//   onClose — called when backdrop is clicked
//   center  — true: items-center (dialog); false: sheet on mobile
//   children — the modal panel

import { useState, useEffect } from 'react'

export default function ModalOverlay({ onClose, center = false, children }) {
  const align = center
    ? 'items-center justify-center'
    : 'items-end sm:items-center justify-center'

  // Fade-in on mount (avoids blur "pop" on first composite frame)
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <>
      {/* Layer 1 — blurred backdrop, own stacking context at z-[100].
          backdrop-blur is isolated here and cannot bleed into Layer 2. */}
      <div
        aria-hidden="true"
        className={`fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm transition-opacity duration-200 ease-out ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Layer 2 — modal panel, separate stacking context at z-[101].
          Rendered AFTER the backdrop in DOM order and at a higher z,
          so it always paints above. No backdrop-filter here — the panel
          content is fully crisp regardless of what's in Layer 1. */}
      <div
        className={`fixed inset-0 z-[101] flex pointer-events-none ${align}`}
      >
        {/* Re-enable pointer events only for the panel itself */}
        <div className="pointer-events-auto">
          {children}
        </div>
      </div>
    </>
  )
}
