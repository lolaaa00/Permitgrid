"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { contractReads } from "@/lib/contract";
import { isContractConfigured } from "@/lib/config";
import type { WorkOrder } from "@/lib/types";

export default function HomePage() {
  const { readClient } = useWallet();
  const [workOrders, setWorkOrders] = useState<WorkOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isContractConfigured()) return;
    let cancelled = false;
    contractReads
      .listWorkOrders(readClient, 0, 50)
      .then((wos) => {
        if (!cancelled) setWorkOrders(wos);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [readClient]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h1 className="font-ident text-xl font-bold uppercase">Work Order Register</h1>
        <Link href="/work-orders/new" className="pg-btn text-xs">
          + New work order
        </Link>
      </div>

      {!isContractConfigured() && (
        <p className="pg-card px-4 py-3 text-sm text-amber" role="status">
          Contract not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS to load the live register.
        </p>
      )}

      {isContractConfigured() && error && (
        <p className="pg-card px-4 py-3 text-sm text-red" role="alert">
          Failed to load work orders: {error}
        </p>
      )}

      {isContractConfigured() && !error && workOrders === null && (
        <p className="text-sm text-ink-muted" role="status">
          Loading register…
        </p>
      )}

      {isContractConfigured() && workOrders !== null && workOrders.length === 0 && (
        <p className="pg-card px-4 py-3 text-sm text-ink-muted" data-testid="empty-state">
          No work orders registered yet.
        </p>
      )}

      {isContractConfigured() && workOrders !== null && workOrders.length > 0 && (
        <div className="overflow-x-auto">
          <table className="permit-table font-ident text-sm" data-testid="work-order-table">
            <thead>
              <tr>
                <th>REF</th>
                <th>WORK</th>
                <th>JURISDICTION</th>
                <th>REQ VER</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((wo) => (
                <tr key={wo.work_order_id}>
                  <td>
                    <Link href={`/work-order/${wo.work_order_id}`} className="underline underline-offset-2">
                      {wo.ref}
                    </Link>
                  </td>
                  <td className="font-sans">{wo.title}</td>
                  <td className="font-sans">{wo.jurisdiction}</td>
                  <td>V{String(wo.requirement_version).padStart(2, "0")}</td>
                  <td>
                    <StatusBadge status={wo.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "REQUIREMENTS_ACTIVE" ? "text-green" : status === "NEEDS_REQUIREMENTS" ? "text-amber" : "text-ink-muted";
  return <span className={`font-bold ${color}`}>{status.replace(/_/g, " ")}</span>;
}
