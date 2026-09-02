"use client";

import dynamic from "next/dynamic";

const ToolLoading=()=> <div className="detail-loading" role="status">Preparando herramientas de edición…</div>;

export const SplitEditor=dynamic(
  ()=>import("./split-editor").then(module=>module.SplitEditor),
  {ssr:false,loading:ToolLoading},
);

export const MovementDocuments=dynamic(
  ()=>import("./movement-documents").then(module=>module.MovementDocuments),
  {ssr:false,loading:ToolLoading},
);

export const BulkMovementEditor=dynamic(
  ()=>import("./bulk-movement-editor").then(module=>module.BulkMovementEditor),
  {ssr:false,loading:ToolLoading},
);
