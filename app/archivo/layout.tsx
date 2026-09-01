import { DetailDialogBoundary } from "@/components/detail-dialog-boundary";
import "./tablet.css";
import "../detail-dialog.css";
import "../archive.css";
import "../archive-lifecycle.css";
import "../archive-review.css";
import "../document-linking.css";

export default function Layout({children}:{children:React.ReactNode}){return <DetailDialogBoundary>{children}</DetailDialogBoundary>}
