import { ProductReviewDetailScreen } from "@/features/admin/products/product-review-screen";

export default async function AdminProductReviewPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return <ProductReviewDetailScreen id={id} />;
}
