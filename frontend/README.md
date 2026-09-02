# PermitGrid frontend

Next.js 16 + TypeScript + `genlayer-js` UI for the PermitGrid Intelligent
Contract (`../contracts/permitgrid.py`). See the repository root `README.md`
for the product description and `../HANDOFF.md` for current verified status.

## Setup

```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_CONTRACT_ADDRESS after deploy
npm run dev
```

Until `NEXT_PUBLIC_CONTRACT_ADDRESS` is set, every page shows a clear
"contract not configured" state rather than attempting live calls — there is
no mock/demo data anywhere in this app.

## Routes

`/`, `/work-orders/new`, `/work-order/[id]`, `/providers/new`,
`/clearance/new`, `/provider/[id]/work/[workId]`, `/about`.

## Scripts

```bash
npm run dev         # dev server
npm run build       # production build (also runs the TypeScript checker)
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test        # vitest run
```

## Wallet

Any injected EIP-1193 wallet (e.g. MetaMask). No wallet snap or proprietary
extension is required. Handles missing provider, disconnected, connecting,
wrong-network, and rejected-signature states; can request a network switch
to GenLayer Studio (chain id `61999`).

## Write-transaction flow

Every write goes through `src/lib/txFlow.ts`, which never reports success
before the transaction finalizes on-chain *and* a fresh canonical
view-method readback confirms the intended state change. See
`src/components/TxProgress.tsx` for the UI representation of that state
machine (`SUBMITTING → LEADER_EXECUTION → VALIDATOR_REVIEW → CONSENSUS →
FINALISED → CANONICAL_READBACK → UPDATED`, or `READBACK_MISMATCH`).
