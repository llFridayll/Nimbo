export function OrderRowCheckbox({ orderId }: { orderId: string }) {
  return (
    <label className="flex h-8 w-8 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        name="ids"
        value={orderId}
        aria-label="เลือกออเดอร์นี้"
        // Some browser extensions inject a caret-color style onto checkboxes
        // before React hydrates — harmless but noisy hydration-mismatch
        // warning, safe to suppress on this element specifically.
        suppressHydrationWarning
        className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
      />
    </label>
  );
}
