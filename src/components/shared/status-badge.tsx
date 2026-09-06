import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, "success" | "warning" | "danger" | "info" | "neutral" | "default"> = {
  Approved: "success",
  Disbursed: "success",
  Credited: "success",
  Success: "success",
  Verified: "success",
  Paid: "success",
  Cleared: "success",
  Active: "success",
  Pending: "warning",
  "In Progress": "info",
  "In Transit": "info",
  "Under Review": "info",
  Submitted: "info",
  "Follow Up": "warning",
  "On Hold": "warning",
  Draft: "neutral",
  Closed: "neutral",
  Inactive: "neutral",
  Paused: "neutral",
  Rejected: "danger",
  Failed: "danger",
  Returned: "danger",
  Disputed: "danger",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = map[status] ?? "default";
  return (
    <Badge variant={variant} className={cn("gap-1.5", className)}>
      <span
        className="size-1.5 rounded-full bg-current opacity-70"
        aria-hidden="true"
      />
      {status}
    </Badge>
  );
}
