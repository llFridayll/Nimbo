"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Platform } from "@prisma/client";
import { platformLabel } from "@/lib/labels";

export function ProductsFilterBar({ initialQuery, initialPlatform }: { initialQuery: string; initialPlatform: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const [query, setQuery] = useState(initialQuery);
  const isFirstRender = useRef(true);

  function pushParams(next: Record<string, string>) {
    const params = new URLSearchParams(searchParamsRef.current.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/products?${params.toString()}`);
  }

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => pushParams({ q: query }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-wrap gap-3">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาด้วย SKU หรือชื่อสินค้า..."
        suppressHydrationWarning
        className="w-full max-w-md rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
      />
      <select
        value={initialPlatform}
        onChange={(e) => pushParams({ platform: e.target.value })}
        className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm"
      >
        <option value="">ทุกช่องทางขาย</option>
        {Object.values(Platform).map((p) => (
          <option key={p} value={p}>
            {platformLabel[p]}
          </option>
        ))}
      </select>
    </div>
  );
}
