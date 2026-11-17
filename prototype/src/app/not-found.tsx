import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <div className="mb-3 text-3xl" aria-hidden>
        🔎
      </div>
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        This page doesn&apos;t exist, or the current demo user isn&apos;t a member of the group it belongs to.
      </p>
      <div className="mt-6">
        <LinkButton href="/">Back to dashboard</LinkButton>
      </div>
    </div>
  );
}
