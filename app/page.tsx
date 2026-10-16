import HomeControls from "@/components/HomeControls";

export default function Home() {
  return (
    <main className="felt flex min-h-screen flex-col items-center justify-center px-4 py-10 text-emerald-50">
      <div className="flex w-full flex-col items-center gap-7 text-center">
        <div className="space-y-2">
          <h1 className="text-balance text-5xl font-bold tracking-tight text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.35)] sm:text-6xl">
            Belote
          </h1>
          <p className="text-base text-emerald-50 [text-shadow:0_1px_6px_rgba(0,0,0,0.3)]">
            Enter your name to start playing
          </p>
        </div>
        <div className="w-full rounded-2xl border border-black/5 bg-white p-6 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.55)] sm:max-w-sm">
          <HomeControls />
        </div>
      </div>
    </main>
  );
}
