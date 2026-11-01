import type { Metadata } from "next";
import { products } from "@/mocks/data";
import { SellerProfileScreen } from "@/features/sellers/seller-profile-screen";

export function generateStaticParams() {
  return [...new Set(products.map((p) => p.seller))].map((name) => ({
    name: encodeURIComponent(name),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  return { title: `Người bán ${decodeURIComponent(name)}` };
}

export default async function SellerPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return <SellerProfileScreen name={decodeURIComponent(name)} />;
}
