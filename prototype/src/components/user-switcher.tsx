"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { switchDemoUser } from "@/app/actions";

type U = { id: string; name: string; avatarColor: string };

function Status() {
  const { pending } = useFormStatus();
  return pending ? <span className="text-xs text-slate-500">Switching…</span> : null;
}

/** PROTOTYPE ONLY: pick which demo user you are "signed in" as. */
export function UserSwitcher({ users, currentId }: { users: U[]; currentId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const current = users.find((u) => u.id === currentId);
  return (
    <form ref={formRef} action={switchDemoUser} className="flex items-center gap-2">
      <input type="hidden" name="returnTo" value="/" />
      <span
        className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white sm:inline-flex"
        style={{ backgroundColor: current?.avatarColor }}
        aria-hidden
      >
        {current?.name.split(" ").map((p) => p[0]).join("")}
      </span>
      <label className="sr-only" htmlFor="demo-user">
        Acting as (demo user)
      </label>
      <select
        id="demo-user"
        name="userId"
        defaultValue={currentId}
        onChange={() => formRef.current?.requestSubmit()}
        className="max-w-[9.5rem] rounded-lg border-0 bg-slate-100 py-1.5 pr-8 pl-2.5 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-indigo-600 sm:max-w-none"
        title="Demo: switch the acting user"
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-sm underline">
          Switch
        </button>
      </noscript>
      <Status />
    </form>
  );
}
