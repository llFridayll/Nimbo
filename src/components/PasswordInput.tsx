"use client";

import { useId, useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/icons";

// Forwards every prop straight to <input> except `type` (always driven by
// the show/hide toggle here) and `className` (kept fixed so the eye button
// lines up — pass one to the wrapper via wrapperClassName instead).
type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  wrapperClassName?: string;
  inputClassName?: string;
};

export function PasswordInput({ wrapperClassName = "", inputClassName = "", ...inputProps }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input {...inputProps} id={inputProps.id ?? id} type={visible ? "text" : "password"} className={`pr-9 ${inputClassName}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
      >
        {visible ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
      </button>
    </div>
  );
}
