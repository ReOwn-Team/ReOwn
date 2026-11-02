import { authSession } from "@/lib/auth/session";

// The list accepts the existing minimal response as well as the safe profile fields.
export type AdminUser = {
    id: string;
    role: string;
    status: string;
    displayName?: string;
    email?: string;
    phone?: string;
    emailVerified?: number;
    phoneVerified?: number;
    kycStatus?: number;
};
export type AdminUsersPage = { items: AdminUser[]; nextCursor: string | null };
export type KycHistoryItem = {
    id: string;
    status: string;
    createdAt: string;
    reviewedAt: string | null;
    purgedAt: string | null;
};
export type AdminUserDetail = AdminUser & {
    displayName: string;
    email: string;
    phone: string;
    emailVerified: number;
    phoneVerified: number;
    kycStatus: number;
    kycHistory: KycHistoryItem[];
    kycHistoryTruncated: boolean;
};

const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
const nullableString = (value: unknown) =>
    value === null || typeof value === "string";
function isUser(value: unknown): value is AdminUser {
    if (!record(value)) return false;
    return (
        ["id", "role", "status"].every(
            (key) => typeof value[key] === "string",
        ) &&
        ["displayName", "email", "phone"].every(
            (key) => value[key] === undefined || typeof value[key] === "string",
        ) &&
        ["emailVerified", "phoneVerified", "kycStatus"].every(
            (key) => value[key] === undefined || typeof value[key] === "number",
        )
    );
}
function isHistory(value: unknown): value is KycHistoryItem {
    return (
        record(value) &&
        typeof value.id === "string" &&
        typeof value.status === "string" &&
        typeof value.createdAt === "string" &&
        nullableString(value.reviewedAt) &&
        nullableString(value.purgedAt)
    );
}

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
        response = await fetch(`/api/admin/users${path}`, {
            signal,
            credentials: "same-origin",
            cache: "no-store",
            headers: { "X-ReOwn-Client": "web" },
        });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new Error("Không thể kết nối. Kiểm tra mạng và thử lại.");
    }
    if (response.status === 401) void authSession.reload();
    if (!response.ok)
        throw new Error(
            response.status === 401
                ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
                : response.status === 403
                  ? "Bạn không có quyền xem người dùng."
                  : response.status === 404
                    ? "Không tìm thấy người dùng hoặc chức năng chưa khả dụng."
                    : response.status === 429
                      ? "Quá nhiều yêu cầu. Vui lòng thử lại sau."
                      : "Không xử lý được yêu cầu. Vui lòng thử lại.",
        );
    return response.json().catch(() => null);
}

export async function listAdminUsers(
    filters: { cursor: string | null; search?: string; limit?: number },
    signal?: AbortSignal,
): Promise<AdminUsersPage> {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters.cursor) params.set("cursor", filters.cursor);
    const query = params.toString();
    const data = await request(query ? `?${query}` : "", signal);
    if (
        !record(data) ||
        !Array.isArray(data.items) ||
        !data.items.every(isUser) ||
        !(
            data.nextCursor === null ||
            (typeof data.nextCursor === "string" && data.nextCursor.length > 0)
        )
    )
        throw new Error("Phản hồi danh sách không hợp lệ.");
    return { items: data.items, nextCursor: data.nextCursor };
}

export async function getAdminUser(
    id: string,
    signal?: AbortSignal,
): Promise<AdminUserDetail> {
    const data = await request(`/${encodeURIComponent(id)}`, signal);
    if (!record(data))
        throw new Error("Phản hồi chi tiết người dùng không hợp lệ.");
    const history = data.kycHistory;
    const truncated = data.kycHistoryTruncated;
    if (
        !isUser(data) ||
        typeof data.displayName !== "string" ||
        typeof data.email !== "string" ||
        typeof data.phone !== "string" ||
        typeof data.emailVerified !== "number" ||
        typeof data.phoneVerified !== "number" ||
        typeof data.kycStatus !== "number" ||
        !Array.isArray(history) ||
        !history.every(isHistory) ||
        typeof truncated !== "boolean"
    )
        throw new Error("Phản hồi chi tiết người dùng không hợp lệ.");
    return data as AdminUserDetail;
}
