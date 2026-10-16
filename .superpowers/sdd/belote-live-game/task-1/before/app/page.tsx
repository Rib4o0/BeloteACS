import HomeControls from "@/components/HomeControls";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-4 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950">
      <div className="flex flex-col items-center gap-8 text-center">
        <div className="space-y-2">
          <h1 className="text-5xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 sm:text-6xl">
            Belote
          </h1>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            Enter your name to start playing
          </p>
        </div>
        <div className="w-full rounded-2xl border border-emerald-100 bg-white/95 p-6 shadow-xl backdrop-blur-sm transition-shadow hover:shadow-2xl dark:border-zinc-800 dark:bg-zinc-950/95 sm:max-w-sm">
          <HomeControls />
        </div>
      </div>
    </main>
  );
}