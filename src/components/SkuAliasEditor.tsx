"use client";

import { useState, useTransition } from "react";
import { setSkuAlias } from "@/lib/skuAliasActions";

interface SkuAliasEditorProps {
  rawSku: string;
  displaySku: string;
  className?: string;
}

/** Click-to-edit SKU name — renames how `rawSku` displays everywhere in the
 * shipping summary (every row sharing that raw SKU, past and future orders
 * included), since the platform's own seller_sku often doesn't match what
 * the shop actually calls the product. */
export function SkuAliasEditor({ rawSku, displaySku, className }: SkuAliasEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displaySku);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(displaySku);
          setEditing(true);
        }}
        title="แก้ไขชื่อ SKU (มีผลกับทุกออเดอร์ที่ใช้ SKU นี้)"
        className={`group inline-flex items-center gap-1 text-left ${className ?? ""}`}
      >
        <span>{displaySku}</span>
        <span className="text-[10px] opacity-0 group-hover:opacity-100">✏️</span>
      </button>
    );
  }

  const commit = () => {
    if (pending) return;
    startTransition(async () => {
      await setSkuAlias(rawSku, value);
      setEditing(false);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        autoFocus
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue(displaySku);
            setEditing(false);
          }
        }}
        className="w-full min-w-[8rem] rounded border border-gray-300 bg-white px-1 py-0.5 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
    </form>
  );
}
