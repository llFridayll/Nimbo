"use client";

import { Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";

function PrintLabelsFrame() {
  const searchParams = useSearchParams();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const query = searchParams.toString();

  return (
    <iframe
      ref={iframeRef}
      src={`/api/tiktok/orders/print-labels?${query}`}
      title="ใบปะหน้าพัสดุ"
      className="fixed inset-0 h-full w-full border-0"
      onLoad={() => {
        try {
          iframeRef.current?.contentWindow?.print();
        } catch {
          // ignore — viewer is still there for a manual print
        }
      }}
    />
  );
}

/** Same idea as /orders/[id]/print-label but for several orders at once —
 * embeds the merged multi-order label PDF (see the print-labels API route)
 * in a full-page iframe and triggers the print dialog on load. */
export default function PrintLabelsPage() {
  return (
    <Suspense fallback={null}>
      <PrintLabelsFrame />
    </Suspense>
  );
}
