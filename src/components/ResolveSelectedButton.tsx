"use client";

import { useEffect, useState } from "react";

/** Lives inside the selection <form> on /problems and just watches how many
 * `ids` checkboxes are checked — the actual selection is carried by the
 * form's own submit (a bound server action) or, when this button sets its
 * own `formAction`, that action instead — not by this component. */
export function ResolveSelectedButton({
  label,
  formAction,
  variant = "primary",
}: {
  label: string;
  formAction?: (formData: FormData) => void | Promise<void>;
  variant?: "primary" | "secondary";
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const form = document.getElementById("problems-select-form");
    if (!form) return;
    const update = () => setCount(form.querySelectorAll('input[name="ids"]:checked').length);
    update();
    form.addEventListener("change", update);
    return () => form.removeEventListener("change", update);
  }, []);

  return (
    <button
      type="submit"
      formAction={formAction}
      disabled={count === 0}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        variant === "primary"
          ? "bg-primary text-white hover:bg-primary-hover"
          : "border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      }`}
    >
      {label}
      {count > 0 ? ` (${count})` : ""}
    </button>
  );
}
