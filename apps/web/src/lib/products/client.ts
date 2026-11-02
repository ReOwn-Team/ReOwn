import { authSession } from "@/lib/auth/session";
import type { components } from "@reown/api-contract";
import type { Listing, ListingDraft } from "@/mocks/data";
export type ApiProduct = components["schemas"]["ProductResponse"];
export const realProductId = (id: string) =>
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id);
export function asListing(product: ApiProduct): Listing {
    return {
        id: product.id,
        productId: product.id,
        name: product.title,
        price: product.price,
        category: product.category,
        condition: product.condition,
        description: product.description,
        defects: product.knownDefects,
        location: product.location,
        image: product.images[0]?.url ?? "",
        images: product.images.map((image) => image.url),
        deliveryModes: product.fulfillmentMethods,
        seller: product.seller.displayName,
        sellerId: product.seller.id,
        live: true,
        rating: "Chưa có đánh giá",
        posted: product.publishedAt
            ? new Date(product.publishedAt).toLocaleDateString("vi-VN")
            : "",
        sold: product.status === "sold",
        reviewStatus: product.reviewStatus,
        rejectionReason: product.rejectionReason,
        revision: product.revision,
        status:
            product.status === "sold"
                ? "Đã bán"
                : product.reviewStatus === "pending"
                  ? "Chờ duyệt"
                  : product.reviewStatus === "seller_confirmation"
                    ? "Chờ xác nhận"
                    : product.reviewStatus === "rejected"
                      ? "Bị từ chối"
                      : product.status === "published"
                        ? "Đang hiển thị"
                        : product.status === "hidden"
                          ? "Đã ẩn"
                          : "Đã bán",
    };
}
export class ProductRequestError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly photoIssue?: {
            imageIndex: number;
            code: string;
            fields: string[];
        },
    ) {
        super(message);
    }
}
async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`/api/products${path}`, {
        ...options,
        headers: { "X-ReOwn-Client": "web", ...options.headers },
        cache: "no-store",
        credentials: "same-origin",
    });
    const body = await response.json().catch(() => null);
    if (response.status === 401) await authSession.reload();
    if (!response.ok)
        throw new ProductRequestError(
            response.status,
            body?.error === "PRODUCT_PHOTO_INVALID"
                ? `Ảnh ${Number(body.imageIndex) + 1}: ${body.code === "METADATA_REQUIRED" ? "Cần ảnh gốc có giờ chụp và vị trí GPS. Bật lưu vị trí trong camera rồi chụp lại." : body.code === "ORIGINAL_REQUIRED" ? "Hãy thay bằng ảnh gốc có giờ chụp và GPS để gửi duyệt." : "Không đọc được ảnh hoặc metadata. Hãy chọn ảnh gốc khác."}`
                : response.status === 401
                  ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
                  : response.status === 409
                    ? "Tin đã thay đổi hoặc đã bán. Hãy tải lại trước khi tiếp tục."
                    : response.status === 404
                      ? "Không tìm thấy tin đăng của bạn."
                      : response.status === 413
                        ? "Ảnh vượt quá dung lượng cho phép."
                        : response.status === 400
                          ? "Thông tin hoặc ảnh chưa hợp lệ. Kiểm tra lại trước khi đăng."
                          : "Chưa thể xử lý tin đăng. Vui lòng thử lại; nội dung đã nhập vẫn được giữ.",
            body?.error === "PRODUCT_PHOTO_INVALID"
                ? {
                      imageIndex: Number(body.imageIndex),
                      code: String(body.code),
                      fields: Array.isArray(body.fields) ? body.fields : [],
                  }
                : undefined,
        );
    return body;
}
export async function listProducts(mine = false): Promise<Listing[]> {
    const result: ApiProduct[] = await request(mine ? "/mine" : "");
    return result.map(asListing);
}
export async function getProduct(id: string, mine = false): Promise<Listing> {
    return asListing(await request(`${mine ? "/mine" : ""}/${id}`));
}
export async function saveProduct(
    draft: ListingDraft,
    id: string | null,
    requestId: string,
): Promise<Listing> {
    const form = new FormData();
    let uploads = 0;
    const images = await Promise.all(
        draft.images.map(async (url) => {
            const retained =
                /(?:^\/api\/product-images\/|^\/api\/products\/mine\/[a-f0-9-]{36}\/images\/)([a-f0-9-]{36})$/i.exec(
                    url,
                );
            if (retained) return { id: retained[1] };
            // Only local file previews are accepted; never fetch an arbitrary image URL.
            if (
                !/^data:image\/(png|jpeg|webp|heic|heif|heic-sequence|heif-sequence);base64,/.test(
                    url,
                )
            )
                throw new Error("Chọn ảnh thật từ thiết bị để đăng bán.");
            const blob = await (await fetch(url)).blob();
            const upload = uploads++;
            form.append(
                "files",
                blob,
                `photo-${upload}.${blob.type.split("/")[1]}`,
            );
            return { upload };
        }),
    );
    form.append(
        "data",
        JSON.stringify({
            ...(id ? {} : { requestId }),
            title: draft.title,
            category: draft.category,
            description: draft.description,
            price: Number(draft.price.replace(/\D/g, "")),
            condition: draft.condition,
            knownDefects: draft.defects,
            location: draft.location,
            fulfillmentMethods: [
                ...(draft.shipping ? ["shipping"] : []),
                ...(draft.meetup ? ["meetup"] : []),
            ],
            images,
            confirmed: true,
        }),
    );
    const result = asListing(
        await request(id ? `/${id}` : "", {
            method: id ? "PUT" : "POST",
            body: form,
        }),
    );
    window.dispatchEvent(new Event("reown-products-changed"));
    return result;
}
export async function setProductStatus(
    id: string,
    status: Listing["status"],
): Promise<Listing> {
    if (!["Đang hiển thị", "Đã ẩn", "Đã bán"].includes(status))
        throw new Error("Trạng thái này cần quản trị viên xét duyệt.");
    const result = asListing(
        await request(`/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status:
                    status === "Đang hiển thị"
                        ? "published"
                        : status === "Đã ẩn"
                          ? "hidden"
                          : "sold",
            }),
        }),
    );
    window.dispatchEvent(new Event("reown-products-changed"));
    return result;
}

export type OwnerInspection = components["schemas"]["ProductOwnerInspection"];
export async function getOwnerInspection(id: string): Promise<OwnerInspection> {
    return request(`/mine/${id}/inspection`);
}
export async function deleteProduct(id: string): Promise<void> {
    try {
        await request(`/${id}`, { method: "DELETE" });
    } catch (error) {
        if (error instanceof ProductRequestError && error.status === 409)
            throw new Error(
                "Không thể xóa tin đã bán hoặc đã có đơn hàng. Bạn có thể ẩn tin nếu không còn bán.",
            );
        throw error;
    }
    window.dispatchEvent(new Event("reown-products-changed"));
}
