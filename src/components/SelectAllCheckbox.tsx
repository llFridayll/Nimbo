"use client";

export function SelectAllCheckbox() {
  return (
    <label className="flex h-8 w-8 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        aria-label="เลือกทั้งหมด"
        suppressHydrationWarning
        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
        onChange={(e) => {
          const form = e.currentTarget.closest("form");
          if (!form) return;
          form.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((el) => {
            el.checked = e.currentTarget.checked;
          });
          form.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      />
    </label>
  );
}
