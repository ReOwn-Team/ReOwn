import { authSession } from "@/lib/auth/session";

export type KycStatus =
    "none" | "needs_review" | "verified" | "rejected" | "expired";

export type KycState = {
    available: boolean;
    consentVersion: string;
    status: KycStatus;
    submittedAt: string | null;
    reviewedAt: string | null;
    reason: string | null;
    requiresReverification: boolean;
};

export type KycIssue =
    | "FRONT_UNREADABLE"
    | "FRONT_NO_FACE"
    | "FRONT_FACE_TOO_SMALL"
    | "FRONT_BLURRY"
    | "FRONT_NOT_SUPPORTED"
    | "FRONT_ID_UNREADABLE"
    | "SELFIE_UNREADABLE"
    | "SELFIE_NO_FACE"
    | "SELFIE_MULTIPLE_FACES"
    | "SELFIE_FACE_TOO_SMALL"
    | "SELFIE_BLURRY"
    | "SELFIE_NOT_FRONTAL"
    | "SELFIE_BAD_LIGHT"
    | "FACE_MISMATCH"
    | "DUPLICATE_PHOTOS";

/** Which photo each issue asks the user to retake. */
export const issueTarget = (issue: KycIssue): "card" | "selfie" | "both" =>
    issue === "FACE_MISMATCH" || issue === "DUPLICATE_PHOTOS"
        ? "both"
        : issue.startsWith("FRONT_")
          ? "card"
          : "selfie";

export const issueMessage: Record<KycIssue, string> = {
    FRONT_UNREADABLE: "Không đọc được ảnh thẻ. Dùng ảnh JPG, PNG hoặc WebP.",
    FRONT_NO_FACE:
        "Không thấy ảnh chân dung trên thẻ. Chụp rõ cả mặt trước, đủ bốn góc thẻ.",
    FRONT_FACE_TOO_SMALL:
        "Thẻ nằm quá xa. Đưa máy gần hơn để ảnh trên thẻ rõ nét.",
    FRONT_BLURRY:
        "Ảnh thẻ bị mờ. Giữ chắc tay và chạm để lấy nét trước khi chụp.",
    FRONT_NOT_SUPPORTED:
        "Chưa nhận ra thẻ sinh viên HUIT. Chụp mặt trước, tránh bóng loá và che khuất.",
    FRONT_ID_UNREADABLE:
        "Chưa đọc được mã số sinh viên. Chụp gần hơn, tránh loá sáng trên chữ và mã vạch.",
    SELFIE_UNREADABLE: "Không đọc được ảnh chân dung. Hãy chụp lại.",
    SELFIE_NO_FACE: "Không thấy khuôn mặt. Đặt mặt vào giữa khung và đủ sáng.",
    SELFIE_MULTIPLE_FACES: "Chỉ một người trong khung hình. Hãy chụp lại.",
    SELFIE_FACE_TOO_SMALL:
        "Khuôn mặt quá nhỏ. Đưa máy gần hơn để mặt lấp đầy khung.",
    SELFIE_BLURRY: "Ảnh chân dung bị mờ. Giữ yên máy rồi chụp lại.",
    SELFIE_NOT_FRONTAL: "Nhìn thẳng vào camera, giữ đầu thẳng.",
    SELFIE_BAD_LIGHT:
        "Ánh sáng chưa phù hợp. Hướng mặt về nơi đủ sáng, tránh ngược sáng.",
    FACE_MISMATCH:
        "Chưa đối chiếu được khuôn mặt với ảnh trên thẻ. Hãy thử lại với hai ảnh rõ nét hơn.",
    DUPLICATE_PHOTOS:
        "Ảnh thẻ và ảnh chân dung trùng nhau. Hãy chọn ảnh thẻ và chụp ảnh chân dung riêng.",
};

const errorMessages: Record<string, string> = {
    KYC_CARD_EXPIRED: "Thẻ sinh viên đã hết hạn nên chưa thể dùng để xác thực.",
    KYC_STUDENT_ID_IN_USE:
        "Thẻ này đã được dùng để xác thực một tài khoản khác. Liên hệ hỗ trợ nếu đây là thẻ của bạn.",
    KYC_ALREADY_PENDING: "Bạn đã gửi hồ sơ và đang chờ duyệt.",
    KYC_ALREADY_VERIFIED: "Tài khoản của bạn đã được xác thực.",
    KYC_TOO_MANY_ATTEMPTS:
        "Bạn đã thử quá nhiều lần hôm nay. Vui lòng quay lại vào ngày mai.",
};

export class KycRequestError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly code?: string,
        readonly issues: KycIssue[] = [],
    ) {
        super(message);
        this.name = "KycRequestError";
    }
}

function failure(status: number, body: unknown): KycRequestError {
    const data = (body ?? {}) as { error?: string; issues?: KycIssue[] };
    if (data.error === "KYC_RETAKE" && Array.isArray(data.issues))
        return new KycRequestError(
            status,
            "Cần chụp lại ảnh để tiếp tục.",
            data.error,
            data.issues.filter((issue) => issue in issueMessage),
        );
    if (data.error && errorMessages[data.error])
        return new KycRequestError(
            status,
            errorMessages[data.error],
            data.error,
        );
    return new KycRequestError(
        status,
        status === 401
            ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
            : status === 403
              ? "Bạn không có quyền thực hiện thao tác này."
              : status === 413
                ? "Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn."
                : status === 429
                  ? "Bạn đã thử quá nhiều lần. Vui lòng chờ một lúc rồi thử lại."
                  : status === 503
                    ? "Hệ thống xác thực đang bận hoặc chưa sẵn sàng. Vui lòng thử lại sau."
                    : "Chưa xử lý được yêu cầu. Vui lòng thử lại.",
    );
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api/kyc${path}`, {
            ...options,
            headers: { "X-ReOwn-Client": "web", ...options.headers },
            cache: "no-store",
            credentials: "same-origin",
        });
    } catch {
        throw new KycRequestError(
            0,
            "Không thể kết nối. Kiểm tra mạng và thử lại.",
        );
    }
    const body =
        response.status === 204
            ? null
            : await response.json().catch(() => null);
    if (response.status === 401) await authSession.reload();
    if (!response.ok) throw failure(response.status, body);
    return body as T;
}

export const getKycStatus = () => request<KycState>("/me");

export function submitKyc(
    front: Blob,
    selfie: Blob,
    consent: string,
): Promise<{ status: "needs_review" }> {
    const form = new FormData();
    form.append("consent", consent);
    form.append("card_front", front, "card-front.jpg");
    form.append("selfie", selfie, "selfie.jpg");
    return request("/submissions", { method: "POST", body: form });
}

export const withdrawKyc = () => request<void>("/me", { method: "DELETE" });

// ---- admin ----------------------------------------------------------
export type KycFlag =
    | "face_low_match"
    | "name_mismatch"
    | "name_unreadable"
    | "dob_unreadable"
    | "cohort_unreadable"
    | "cohort_not_started"
    | "age_out_of_range"
    | "student_id_unverified"
    | "student_id_ocr_conflict"
    | "student_id_cohort_mismatch";

export const flagLabel: Record<KycFlag, string> = {
    face_low_match: "Khuôn mặt khớp thấp, cần xem kỹ",
    name_mismatch: "Tên trên thẻ khác tên hiển thị",
    name_unreadable: "Không đọc được tên",
    dob_unreadable: "Không đọc được ngày sinh",
    cohort_unreadable: "Không đọc được niên khoá",
    cohort_not_started: "Niên khoá chưa bắt đầu",
    age_out_of_range: "Tuổi ngoài khoảng 16–45",
    student_id_unverified: "MSSV chỉ đọc được một lần, hãy đối chiếu với ảnh",
    student_id_ocr_conflict: "MSSV khác với mã vạch, hãy đối chiếu",
    // Historical submissions may still contain this retired, unverified flag.
    student_id_cohort_mismatch: "Cảnh báo cũ không còn được sử dụng",
};

export type KycReviewSummary = {
    id: string;
    createdAt: string;
    flags: KycFlag[];
    faceScore: number;
    cardLayout: string;
    user: { id: string; displayName: string; email: string };
};
export type KycReviewDetail = {
    id: string;
    createdAt: string;
    flags: KycFlag[];
    faceScore: number;
    user: KycReviewSummary["user"];
    extracted: {
        layout: string | null;
        fullName: string | null;
        dateOfBirth: string | null;
        major: string | null;
        cohort: { start: number; end: number } | null;
        studentId: string;
        studentIdSource: string;
    };
};

export const listKycReviews = () => request<KycReviewSummary[]>("/admin");
export const getKycReview = (id: string) =>
    request<KycReviewDetail>(`/admin/${id}`);
export const kycAssetUrl = (id: string, kind: "card_front" | "selfie") =>
    `/api/kyc/admin/${id}/assets/${kind}`;
export const decideKyc = (
    id: string,
    body: {
        decision: "approve" | "reject";
        reason?: string;
        studentId?: string;
    },
) =>
    request<{ status: "verified" | "rejected" }>(`/admin/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
