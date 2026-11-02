import { authSession } from "@/lib/auth/session";
import type { components } from "@reown/api-contract";

export type ProductReviewStatus =
    "pending" | "seller_confirmation" | "approved" | "rejected" | "superseded";
export type ProductReviewEdit = components["schemas"]["ProductReviewEdit"];

export type ReviewSummary = {
    id: string;
    productId: string;
    revision: number;
    createdAt: string;
    product: { title: string; sellerId: string; revision: number };
    inspections: { id: string; status: string; errorCode: string | null }[];
};
type Finding = {
    imageIds: string[];
    observation: string;
    evidence: string;
    certainty: string;
};
type Report = {
    summary: string;
    productObservations: Finding[];
    visibleDefects: Finding[];
    imageQuality: Finding[];
    inconsistencies: Finding[];
    limitations: string[];
};
export type ReviewDetail = {
    id: string;
    productId: string;
    revision: number;
    status: ProductReviewStatus;
    createdAt: string;
    reason: string | null;
    product: {
        revision: number;
        reviewStatus:
            Exclude<ProductReviewStatus, "superseded"> | "not_required";
        deletedAt: string | null;
    };
    snapshot: {
        title: string;
        category: string;
        description: string;
        condition: string;
        knownDefects: string | null;
        price: number;
        location: string;
        fulfillmentMethods: string[];
        images: { id: string; sortOrder: number }[];
    };
    inspections: {
        id: string;
        status: string;
        attempts: number;
        createdAt: string;
        errorCode: string | null;
        report: Report | null;
    }[];
    evidence: {
        id: string;
        expiresAt: string;
        purgedAt: string | null;
        originalMime: string;
        sha256: string;
        metadata: {
            capturedAtLocal: string;
            utcOffset: string | null;
            latitude: number;
            longitude: number;
            make: string | null;
            model: string | null;
        };
    }[];
};

export class ReviewRequestError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api/admin/product-reviews${path}`, {
            ...options,
            headers: { "X-ReOwn-Client": "web", ...options.headers },
            credentials: "same-origin",
            cache: "no-store",
        });
    } catch {
        throw new ReviewRequestError(
            0,
            "Không thể kết nối. Kiểm tra mạng và thử lại.",
        );
    }
    if (response.status === 401) await authSession.reload();
    if (!response.ok)
        throw new ReviewRequestError(
            response.status,
            response.status === 401
                ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
                : response.status === 403
                  ? "Bạn không có quyền duyệt sản phẩm."
                  : response.status === 404
                    ? "Không tìm thấy hồ sơ hoặc hồ sơ không còn khả dụng."
                    : response.status === 409
                      ? "Hồ sơ đã thay đổi hoặc đã được duyệt. Hãy tải lại danh sách."
                      : response.status === 429
                        ? "Quá nhiều yêu cầu. Vui lòng thử lại sau."
                        : "Không xử lý được yêu cầu. Vui lòng thử lại.",
        );
    try {
        return (await response.json()) as T;
    } catch {
        throw new ReviewRequestError(
            0,
            "Phản hồi không hợp lệ. Vui lòng tải lại và kiểm tra trạng thái trước khi thử lại.",
        );
    }
}
export const listProductReviews = (cursor?: string) =>
    request<ReviewSummary[]>(
        cursor ? `?cursor=${encodeURIComponent(cursor)}` : "",
    );
export const getProductReview = (id: string) =>
    request<ReviewDetail>(`/${encodeURIComponent(id)}`);
export const decideProductReview = (
    id: string,
    body: { revision: number; decision: "approve" | "reject"; reason?: string },
) =>
    request<{ status: string }>(`/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
export type ProductReviewChanges = Partial<
    Pick<
        ReviewDetail["snapshot"],
        | "title"
        | "category"
        | "description"
        | "condition"
        | "knownDefects"
        | "location"
        | "fulfillmentMethods"
    >
>;
export const editProductReview = (
    id: string,
    body: { revision: number; changes: ProductReviewChanges; note?: string },
) =>
    request<ProductReviewEdit>(`/${encodeURIComponent(id)}/edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
export const productReviewImageUrl = (
    id: string,
    imageId: string,
    original = false,
) =>
    `/api/admin/product-reviews/${encodeURIComponent(id)}/${original ? "originals" : "images"}/${encodeURIComponent(imageId)}`;
