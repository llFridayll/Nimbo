"use client";

import { useParams } from "next/navigation";
import { useRef } from "react";

/** Opens the TikTok shipping-label PDF (proxied same-origin by our API route)
 * in a full-page iframe and immediately triggers the print dialog on it —
 * one click instead of open PDF, then click print inside the viewer. */
export default function PrintLabelPage() {
  const params = useParams<{ id: string }>();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  return (
    <iframe
      ref={iframeRef}
      src={`/api/tiktok/orders/${params.id}/shipping-label`}
      title="ใบปะหน้าพัสดุ"
      className="fixed inset-0 h-full w-full border-0"
      onLoad={() => {
        // Some browsers block a scripted print() on a cross-origin/PDF
        // subframe — if so, the viewer is still right there for a manual print.
        try {
          iframeRef.current?.contentWindow?.print();
        } catch {
          // ignore
        }
      }}
    />
  );
}
