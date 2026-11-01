"use client";
import { useRef } from "react";
import { EyeOff, Eye, Check, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/primitives/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/primitives/dropdown-menu";
import type { Listing } from "@/mocks/data";

export type ListingAction = "hide" | "show" | "sold" | "delete";
export function ListingActions({
  listing,
  disabled,
  onAction,
}: {
  listing: Listing;
  disabled: boolean;
  onAction: (action: ListingAction, trigger: HTMLButtonElement | null) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          variant="outline"
          size="icon"
          disabled={disabled}
          aria-label={`Thêm thao tác: ${listing.name}`}
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuLabel>Quản lý tin đăng</DropdownMenuLabel>
        <DropdownMenuGroup>
          {listing.status !== "Chờ duyệt" &&
            listing.status !== "Bị từ chối" && (
              <DropdownMenuItem
                onSelect={() =>
                  onAction(
                    listing.status === "Đã ẩn" ? "show" : "hide",
                    trigger.current,
                  )
                }
              >
                {listing.status === "Đã ẩn" ? (
                  <Eye aria-hidden="true" />
                ) : (
                  <EyeOff aria-hidden="true" />
                )}
                {listing.status === "Đã ẩn" ? "Hiện lại" : "Ẩn tin"}
              </DropdownMenuItem>
            )}
          <DropdownMenuItem onSelect={() => onAction("sold", trigger.current)}>
            <Check aria-hidden="true" />
            Đánh dấu đã bán
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onAction("delete", trigger.current)}
          >
            <Trash2 aria-hidden="true" />
            Xóa tin
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
