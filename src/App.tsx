/**
 * Application shell.
 * The real workbench UI is assembled in later steps; for now this only
 * verifies that the Tailwind theme tokens and the build pipeline work.
 */
export default function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-lab-bg">
      <h1 className="font-mono text-3xl tracking-[0.3em] text-lab-accent">LAVOISIER</h1>
      <p className="text-sm text-lab-muted">化学模拟实验室 · 正在搭建</p>
    </main>
  )
}
