"use client";

import { useState, useTransition } from "react";
import { toggleShippingChecklistItems } from "@/lib/shippingChecklistActions";

interface ShippingChecklistCheckboxProps {
  shipDate: string;
  items: { orderId: string; sku: string }[];
  initialChecked: boolean;
}

export function ShippingChecklistCheckbox({ shipDate, items, initialChecked }: ShippingChecklistCheckboxProps) {
  const [checked, setChecked] = useState(initialChecked);
  const [, startTransition] = useTransition();

  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => {
        const next = e.target.checked;
        setChecked(next); // optimistic — flip back if the write fails
        startTransition(async () => {
          try {
            await toggleShippingChecklistItems(shipDate, items, next);
          } catch {
            setChecked(!next);
          }
        });
      }}
      className="h-5 w-5 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary print:h-3.5 print:w-3.5"
      aria-label="ส่งแล้ว"
    />
  );
}
