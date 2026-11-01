import type { Metadata } from "next";
import { products } from "@/mocks/data";
import { ProductRoute } from "@/features/products/product-screen";
import "@/features/products/product.css";

export function generateStaticParams() {
  return products.map((p) => ({ id: p.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = products.find((p) => p.id === id);
  return { title: product ? product.name : "Sản phẩm" };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductRoute id={id} />;
}
