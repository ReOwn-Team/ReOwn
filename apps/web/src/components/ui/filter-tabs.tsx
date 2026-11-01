"use client";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/primitives/toggle-group";

type FilterItem<T extends string> = { value: T; label: string; count?: number };
export function FilterTabs<T extends string>({
  value,
  onValueChange,
  items,
  label,
}: {
  value: T;
  onValueChange: (value: T) => void;
  items: FilterItem<T>[];
  label: string;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (items.some((item) => item.value === next)) onValueChange(next as T);
      }}
      aria-label={label}
      className="status-filters"
    >
      {items.map((item) => (
        <ToggleGroupItem value={item.value} key={item.value}>
          {item.label}
          {item.count !== undefined && ` · ${item.count}`}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
