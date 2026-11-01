import type { Metadata } from "next";
import { KycReviewScreen } from "@/features/admin/kyc-review-screen";
import "@/features/admin/kyc-review.css";

export const metadata: Metadata = {
  title: "Duyệt xác thực sinh viên",
  robots: { index: false, follow: false },
};

export default function AdminKycPage() {
  return <KycReviewScreen />;
}
