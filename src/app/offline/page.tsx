import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-slate-50">
      <div className="w-full max-w-lg rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur">
        <p className="text-sm font-medium uppercase tracking-[0.28em] text-cyan-300">
          Offline mode
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          MontrAI is temporarily unavailable
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Your device is offline or the network request failed. Core assets stay installable, but
          live workspace data and API requests still require a connection.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
          >
            Retry home
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:border-white/30 hover:bg-white/5"
          >
            Open login
          </Link>
        </div>
      </div>
    </main>
  );
}
