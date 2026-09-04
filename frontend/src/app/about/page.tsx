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
          No write action in this application reports success before all three of the following are true:
          (1) the underlying transaction reaches on-chain finality, (2) its real per-validator execution
          result is inspected and confirmed successful — consensus acceptance (e.g. &quot;majority agree&quot;)
          is never treated as proof of success on its own, since a transaction can finalize with every
          validator agreeing that the call reverted — and (3) a fresh canonical, final-state view-method
          readback confirms the exact intended state change. If execution did not succeed, or the
          readback does not match, the UI surfaces that specific failure (e.g. execution reverted,
          consensus did not converge, readback mismatch) rather than a false success state.
        </p>
      </div>

      <div>
        <h2 className="font-ident text-sm font-bold uppercase text-ink-muted mb-2">Wallet</h2>
        <p>
          PermitGrid connects to any injected EIP-1193 wallet (e.g. MetaMask or Rabby). No wallet snap or
          proprietary extension is required. The UI can request a network switch to GenLayer Studio
          (chain 61999) if the connected wallet is on the wrong network.
        </p>
      </div>

      <div>
        <h2 className="font-ident text-sm font-bold uppercase text-ink-muted mb-2">Limitations — read before relying on this</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>PermitGrid evaluates the configured public regulatory and credential sources for a given work order or provider — it does not independently verify facts beyond what those sources publish.</li>
          <li>Public regulatory and licensing pages can change, move, or become temporarily unavailable at any time; a stale or unreachable source can affect what a requirement extraction or assessment sees.</li>
          <li>Validator consensus (requirement extraction and provider assessment) can genuinely fail to converge, especially against dynamic or unstable source pages — this is reported as a real failure state, never silently forced to a result.</li>
          <li>A public source being outdated, incomplete, or a non-canonical mirror is possible; PermitGrid does not warrant the completeness or currency of any third-party regulatory page.</li>
          <li>Evidence found on a public page does not, by itself, prove a provider is legally authorized to perform the work described. PermitGrid does not issue, certify, renew, or replace a real-world licence or permit of any kind.</li>
          <li>A <span className="font-ident">CLEARED</span> result from PermitGrid is a statement about configured evidence matching a derived requirement set — it is not a legal opinion. Professional and/or legal verification with the relevant licensing authority may still be required before relying on it.</li>
          <li>Missing or insufficient evidence is always treated conservatively (e.g. <span className="font-ident">INSUFFICIENT_EVIDENCE</span>), never defaulted to a pass — and evidence for a similarly-but-not-identically-named entity is treated the same way unless identity is actually established.</li>
        </ul>
      </div>

      <div>
        <h2 className="font-ident text-sm font-bold uppercase text-ink-muted mb-2">Status</h2>
        <p>
          See the project HANDOFF document for exactly what has been verified, including live Studionet
          transaction hashes, execution results, and canonical readback confirmations for every write
          exercised.
        </p>
      </div>
    </div>
  );
}
