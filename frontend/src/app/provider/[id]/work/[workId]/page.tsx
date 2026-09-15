"use client";

import { use } from "react";
import { ProviderWorkDetailView } from "./view";

export default function ProviderWorkDetailPage({
  params,
}: {
  params: Promise<{ id: string; workId: string }>;
}) {
  const { id: providerId, workId } = use(params);
  return <ProviderWorkDetailView providerId={providerId} workId={workId} />;
}
