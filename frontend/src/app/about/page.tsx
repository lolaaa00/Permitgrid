export default function AboutPage() {
  return (
    <div className="max-w-2xl space-y-6 text-sm">
      <div>
        <h1 className="font-ident text-xl font-bold uppercase mb-2">About PermitGrid</h1>
        <p>
          PermitGrid is a consensus-backed regulated-work clearance protocol running on GenLayer. It
          registers work orders against configured regulatory sources, derives a frozen requirement set
          through validator consensus, and assesses provider credential evidence against that frozen set
          to produce a deterministic clearance state.
        </p>
      </div>

      <div>
        <h2 className="font-ident text-sm font-bold uppercase text-ink-muted mb-2">How it works</h2>
        <ol className="list-decimal list-inside space-y-1">
          <li>Register a work order with its regulatory sources.</li>
          <li>Extract requirements — validators independently fetch every source and reach consensus on a structured requirement set.</li>
          <li>Register a provider and submit credential evidence sources.</li>
          <li>Run an assessment — validators independently evaluate the provider&apos;s evidence against the frozen requirement set.</li>
          <li>A deterministic clearance state and assignment gate are derived from the assessment results, never from a single model call.</li>
        </ol>
      </div>

      <div>
        <h2 className="font-ident text-sm font-bold uppercase text-ink-muted mb-2">Finality and readback</h2>
        <p>
          No write action in this application reports success before the underlying transaction has
          finalized on-chain <em>and</em> a fresh canonical view-method readback confirms the intended
          state change. If the readback does not match, the UI surfaces a readback mismatch rather than a
          false success state.
        </p>
      </div>

      <div>
        <h2 className="font-ident text-sm font-bold uppercase text-ink-muted mb-2">Wallet</h2>
        <p>
          PermitGrid connects to any injected EIP-1193 wallet (e.g. MetaMask). No wallet snap or
          proprietary extension is required. The UI can request a network switch to GenLayer Studio
          (chain 61999) if the connected wallet is on the wrong network.
        </p>
      </div>

      <div>
        <h2 className="font-ident text-sm font-bold uppercase text-ink-muted mb-2">Status</h2>
        <p>
          This is a build in progress. See the project HANDOFF document for exactly what has been
          verified so far and what remains before a live Studionet deployment.
        </p>
      </div>
    </div>
  );
}
