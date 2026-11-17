"use client";

import Link from "next/link";
import { BUTTON_STYLES } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm" role="alert">
      <div className="mb-3 text-3xl" aria-hidden>
        ⚠️
      </div>
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        {process.env.NODE_ENV === "development" ? error.message : "The page couldn't be loaded. Your data has not been changed."}
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={reset} className={BUTTON_STYLES.primary}>
          Try again
        </button>
        <Link href="/" className={BUTTON_STYLES.secondary}>
          Dashboard
        </Link>
      </div>
    </div>
  );
}
