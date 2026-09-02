"use client";

import dynamic from "next/dynamic";

const ToolLoading=()=> <div className="detail-loading" role="status">Preparando herramientas de edición…</div>;

export const BulkMovementEditor=dynamic(
  ()=>import("./bulk-movement-editor").then(module=>module.BulkMovementEditor),
  {ssr:false,loading:ToolLoading},
);

export const MovementDetailDrawer=dynamic(
  ()=>import("./movement-detail-drawer").then(module=>module.MovementDetailDrawer),
  {ssr:false,loading:ToolLoading},
);
