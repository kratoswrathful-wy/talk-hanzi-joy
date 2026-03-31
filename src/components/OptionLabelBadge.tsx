import { useSelectOptions } from "@/stores/select-options-store";
import { useLabelStyles } from "@/stores/label-style-store";

type OptionFieldKey = "client" | "dispatchRoute" | "contact";

interface OptionLabelBadgeProps {
  fieldKey: OptionFieldKey;
  value: string;
  emptyText?: string;
  className?: string;
}

export function OptionLabelBadge({
  fieldKey,
  value,
  emptyText = "—",
  className,
}: OptionLabelBadgeProps) {
  const { options } = useSelectOptions(fieldKey);
  const labelStyles = useLabelStyles();
  const opt = options.find((o) => o.label === value);

  if (!value) {
    return <span className="text-sm text-muted-foreground">{emptyText}</span>;
  }

  const textColor =
    fieldKey === "dispatchRoute"
      ? labelStyles.dispatchRoute.textColor
      : labelStyles.client.textColor;

  const bgColor = opt?.color || "#6B7280";

  return (
    <span
      className={className ?? "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"}
      style={{ backgroundColor: bgColor, color: textColor, borderColor: bgColor }}
      title={value}
    >
      <span className="truncate">{value}</span>
    </span>
  );
}
