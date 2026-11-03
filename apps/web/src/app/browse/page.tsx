import { Suspense } from "react";
import type { Metadata } from "next";
import { BrowseScreen } from "@/features/browse/browse-screen";
import { LoadingScreen } from "@/components/ui/loading-screen";
import "@/features/browse/browse.css";

export const metadata: Metadata = { title: "Khám phá sản phẩm" };

export default function BrowsePage() {
    return (
        <Suspense fallback={<LoadingScreen variant="catalog" />}>
            <BrowseScreen />
        </Suspense>
    );
}
