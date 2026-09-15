"use client";

import { use } from "react";
import { WorkOrderDetailView } from "./view";

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <WorkOrderDetailView id={id} />;
}
