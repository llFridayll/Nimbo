"use client";

import { useEffect, useState } from "react";

/** Lives inside the selection <form> on /orders and just watches how many
 * `ids` checkboxes are checked — the actual selection is carried to
 * /orders/print by the form's native GET submit, not by this component. */
export function PrintSelectedButton() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById("orders-select-form");
    if (!form) return;
    const update = () => setCount(form.querySelectorAll('input[name="ids"]:checked').length);
    update();
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, []);

  return (
    <button
      type="submit"
      formTarget="_blank"
      disabled={count === 0}
      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
    >
      🖨️ พิมพ์รายการที่เลือก{count > 0 ? ` (${count})` : ""}
    </button>
  );
}
