"use client";
import { useState, useEffect, useRef, type FormEvent } from "react";
import Link from "next/link";
import { getProduct, saveProduct } from "@/lib/products/client";
import { useAuth } from "@/lib/auth/provider";
import { readDraft, writeDraft } from "@/lib/products/drafts";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { ProductCard } from "@/features/products/components/product-card";
import { ProductPhotoPreview } from "./components/product-photo-preview";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, X, ImagePlus } from "lucide-react";
import {
  categories,
  money,
  emptyDraft,
  type Listing,
  type ListingDraft,
} from "@/mocks/data";
import { useMock } from "@/mocks/store";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";

export function SellScreen() {
  const params = useSearchParams();
  return (
    <AuthGate title="Đăng nhập để đăng bán sản phẩm">
      <SellForm
        key={params.get("edit") ?? "new"}
        editingId={params.get("edit")}
      />
    </AuthGate>
  );
}
function SellForm({ editingId }: { editingId: string | null }) {
  const store = useMock();
  const auth = useAuth();
  const router = useRouter();
  const [created, setCreated] = useState<Listing | null>(null);
  const [existing, setExisting] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(!!editingId);
  const [requestError, setRequestError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const draftKey = `${auth.user!.id}:${editingId ?? "new"}`;
  const [draftReady, setDraftReady] = useState(false);
  const [draft, setDraft] = useState<ListingDraft>({ ...emptyDraft });
  const [draftError, setDraftError] = useState("");
  const persistence = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!editingId) return;
    let active = true;
    getProduct(editingId, true)
      .then((value) => {
        if (active) setExisting(value);
      })
      .catch((error) => {
        if (active) setRequestError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editingId]);
  const initialEditDraft: ListingDraft = existing
    ? {
        title: existing.name,
        category: existing.category,
        price: String(existing.price),
        condition: existing.condition,
        description: existing.description,
        defects: existing.defects,
        location: existing.location,
        shipping: existing.deliveryModes?.includes("shipping") ?? true,
        meetup: existing.deliveryModes?.includes("meetup") ?? true,
        images: existing.images ?? [existing.image],
      }
    : { ...emptyDraft };
  useEffect(() => {
    let active = true;
    if (loading) return;
    readDraft(draftKey)
      .then((saved) => {
        if (!active) return;
        setDraft(saved ?? initialEditDraft);
        if (saved?.requestId) setRequestId(saved.requestId);
      })
      .catch(() => {
        if (active) {
          setDraft(initialEditDraft);
          setDraftError(
            "Không thể mở bản nháp trên thiết bị. Bạn vẫn có thể đăng tin.",
          );
        }
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
    // Initialize once after the owned listing is fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, draftKey]);
  useEffect(() => {
    if (!draftReady || created) return;
    persistence.current = persistence.current
      .catch(() => {})
      .then(() => writeDraft(draftKey, { ...draft, requestId }))
      .catch(() => {
        setDraftError("Chưa thể lưu bản nháp trên thiết bị.");
      });
  }, [draft, draftReady, draftKey, requestId, created]);
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageError, setImageError] = useState("");
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const priceValue = Number(draft.price.replace(/\D/g, ""));
  function update<K extends keyof ListingDraft>(
    key: K,
    value: ListingDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  }
  async function images(files: FileList | null) {
    if (!files) return;
    setImageError("");
    const chosen = Array.from(files);
    if (
      chosen.some(
        (file) =>
          !(
            [
              "image/png",
              "image/jpeg",
              "image/webp",
              "image/heic",
              "image/heif",
              "image/heic-sequence",
              "image/heif-sequence",
            ].includes(file.type) ||
            ((!file.type || file.type === "application/octet-stream") &&
              /\.hei[cf]$/i.test(file.name))
          ) || file.size > 5 * 1024 * 1024,
      )
    ) {
      setImageError(
        "Chọn ảnh gốc JPEG, PNG, WebP hoặc HEIC, tối đa 5MB mỗi ảnh.",
      );
      return;
    }
    if (draft.images.length + chosen.length > 6) {
      setImageError("Mỗi tin tối đa 6 ảnh.");
      return;
    }
    setReading(true);
    try {
      const urls = await Promise.all(
        chosen.map(
          (file) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(
                (!file.type || file.type === "application/octet-stream") &&
                  /\.hei[cf]$/i.test(file.name)
                  ? new Blob([file], { type: "image/heic" })
                  : file,
              );
            }),
        ),
      );
      setDraft((current) => ({
        ...current,
        images: [...current.images, ...urls].slice(0, 6),
      }));
    } catch {
      setImageError("Không thể đọc ảnh. Hãy thử lại.");
    } finally {
      setReading(false);
    }
  }
  async function publish() {
    if (publishing) return;
    setPublishing(true);
    setRequestError("");
    try {
      const listing = await saveProduct(draft, editingId, requestId);
      await persistence.current;
      await writeDraft(draftKey, null).catch(() =>
        setDraftError(
          "Tin đã đăng, nhưng chưa xóa được bản nháp trên thiết bị.",
        ),
      );
      setCreated(listing);
      if (!editingId) {
        setDraft({ ...emptyDraft });
        setConfirmed(false);
        setRequestId(crypto.randomUUID());
      }
      store.notify(
        editingId
          ? "Đã cập nhật và gửi tin để xét duyệt."
          : "Đã gửi tin để xét duyệt.",
      );
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : "Chưa thể đăng tin. Hãy thử lại.",
      );
    } finally {
      setPublishing(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (draft.title.trim().length < 4)
      next.title = "Tên sản phẩm cần ít nhất 4 ký tự.";
    if (
      !Number.isSafeInteger(priceValue) ||
      priceValue <= 0 ||
      priceValue > 1000000000
    )
      next.price = "Nhập giá từ 1₫ đến 1 tỷ đồng.";
    if (draft.description.trim().length < 20)
      next.description = "Mô tả ít nhất 20 ký tự để người mua hiểu rõ.";
    if (!draft.images.length)
      next.images = "Thêm ít nhất một ảnh thật của sản phẩm.";
    if (!draft.location.trim()) next.location = "Nhập khu vực bán.";
    if (!draft.shipping && !draft.meetup)
      next.delivery = "Chọn ít nhất một hình thức giao nhận.";
    if (!confirmed)
      next.confirmed = "Xác nhận thông tin trung thực trước khi đăng.";
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(),
      );
      return;
    }
    store.requireAuth(() => {
      void publish();
    });
  }
  const preview = {
    id: "preview",
    name: draft.title || "Tên món đồ của bạn",
    category: draft.category,
    price: priceValue || 0,
    condition: draft.condition,
    image: draft.images[0] ?? "/figma/laptop.png",
    seller: store.user?.name ?? "Nguyễn An",
    rating: "Chưa có đánh giá",
    posted: "vừa xong",
    description: draft.description,
    defects: draft.defects,
    location: draft.location,
  };
  if (loading || !draftReady) return <LoadingScreen variant="form" />;
  if (existing?.status === "Đã bán")
    return (
      <div className="container page">
        <EmptyState title="Tin đã bán không thể chỉnh sửa">
          <Link href="/listings">Về quản lý tin đăng</Link>
        </EmptyState>
      </div>
    );
  if (editingId && !existing)
    return (
      <div className="container page">
        <EmptyState title="Không tìm thấy tin đăng">
          {requestError ||
            "Tin không tồn tại hoặc không thuộc tài khoản của bạn."}
        </EmptyState>
      </div>
    );
  const error = (key: string) =>
    errors[key] ? (
      <p className="error" id={`sell-${key}-error`} role="alert">
        {errors[key]}
      </p>
    ) : null;
  return (
    <div className="container page sell-page">
      <div className="section-heading">
        <div>
          <h1>
            {existing
              ? "Chỉnh sửa tin đăng"
              : "Đồ bạn không dùng. Ai đó đang cần."}
          </h1>
          <p className="muted">
            Thêm vài tấm ảnh, kể đúng tình trạng và đặt mức giá bạn muốn bán.
          </p>
        </div>
        <button
          className="plain-button"
          disabled={saving || publishing}
          onClick={async () => {
            setSaving(true);
            try {
              await persistence.current;
              await writeDraft(draftKey, { ...draft, requestId });
              store.notify("Đã lưu bản nháp trên thiết bị.");
            } catch {
              store.notify("Chưa thể lưu bản nháp. Hãy thử lại.");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Đang lưu…" : "Lưu bản nháp"}
        </button>
      </div>
      {draftError && (
        <p className="error" role="alert">
          {draftError}
        </p>
      )}
      <p className="small muted">
        Ảnh gốc và metadata được lưu riêng tư trong 30 ngày để đối chiếu. Bản
        ảnh đã bỏ metadata được gửi qua OpenRouter tới nhà cung cấp AI để hỗ trợ
        quản trị viên xem xét. Nhà cung cấp có thể lưu hoặc dùng bản ảnh này và
        mô tả tin đăng để huấn luyện AI.
      </p>
      <nav className="sell-step-nav" aria-label="Các phần của tin đăng">
        {[
          ["photos", "Ảnh sản phẩm"],
          ["details", "Thông tin"],
          ["condition", "Tình trạng"],
          ["price", "Giá bán"],
          ["delivery", "Giao nhận"],
        ].map(([id, label], index) => (
          <a key={id} href={`#sell-section-${id}`}>
            <span>{index + 1}</span>
            {label}
          </a>
        ))}
      </nav>
      <form
        className="two-column sell-layout"
        onSubmit={submit}
        noValidate
        aria-busy={publishing}
      >
        <fieldset disabled={publishing} style={{ display: "contents" }}>
          <div className="stack sell-form-sections">
            <section
              className="panel stack"
              id="sell-section-photos"
              tabIndex={-1}
            >
              <h2>1. Ảnh sản phẩm</h2>
              <p className="small muted">
                Dùng ảnh gốc có giờ chụp và vị trí GPS. Chụp rõ cả những chỗ
                trầy xước hoặc hư hỏng.
              </p>
              <div className="sell-photo-grid">
                {draft.images.map((url, index) => (
                  <div
                    className="sell-photo"
                    key={`${index}-${url.slice(-20)}`}
                  >
                    <ProductPhotoPreview
                      src={url}
                      alt={`Ảnh sản phẩm ${index + 1}`}
                      width={220}
                      height={164}
                    />
                    <span className="photo-cover">
                      {index === 0 ? "Ảnh bìa" : `Ảnh ${index + 1}`}
                    </span>
                    <div className="photo-actions">
                      <button
                        type="button"
                        aria-label={`Đưa ảnh ${index + 1} lên trước`}
                        disabled={index === 0}
                        onClick={() => {
                          const next = [...draft.images];
                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];
                          update("images", next);
                        }}
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Đưa ảnh ${index + 1} ra sau`}
                        disabled={index === draft.images.length - 1}
                        onClick={() => {
                          const next = [...draft.images];
                          [next[index + 1], next[index]] = [
                            next[index],
                            next[index + 1],
                          ];
                          update("images", next);
                        }}
                      >
                        <ArrowRight size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa ảnh ${index + 1}`}
                        onClick={() =>
                          update(
                            "images",
                            draft.images.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {index > 0 && (
                      <button
                        type="button"
                        className="photo-make-cover"
                        onClick={() =>
                          update("images", [
                            draft.images[index],
                            ...draft.images.filter((_, i) => i !== index),
                          ])
                        }
                      >
                        Đặt làm ảnh bìa
                      </button>
                    )}
                  </div>
                ))}
                {draft.images.length < 6 && (
                  <label className="photo-upload">
                    <ImagePlus size={24} />
                    <span>{reading ? "Đang đọc ảnh…" : "Thêm ảnh"}</span>
                    <input
                      type="file"
                      aria-label="Ảnh sản phẩm"
                      accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif"
                      multiple
                      disabled={reading || publishing}
                      onChange={(e) => {
                        void images(e.target.files);
                        e.target.value = "";
                      }}
                      aria-invalid={!!errors.images}
                      aria-describedby={
                        errors.images ? "sell-images-error" : undefined
                      }
                    />
                  </label>
                )}
              </div>
              <div className="action-row">
                <p className="small muted">
                  Ảnh đầu tiên là ảnh bìa. Tối đa 6 ảnh, mỗi ảnh 5MB.
                </p>
              </div>
              {error("images")}
              {imageError && (
                <p className="error" role="alert">
                  {imageError}
                </p>
              )}
            </section>
            <section
              className="panel stack"
              id="sell-section-details"
              tabIndex={-1}
            >
              <h2>2. Thông tin cơ bản</h2>
              <div className="field">
                <label htmlFor="sell-title">Tên sản phẩm</label>
                <input
                  id="sell-title"
                  value={draft.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="Laptop học tập 14 inch"
                  aria-invalid={!!errors.title}
                  aria-describedby={
                    errors.title ? "sell-title-error" : undefined
                  }
                />
                {error("title")}
              </div>
              <div className="field">
                <label htmlFor="sell-category">Danh mục</label>
                <select
                  id="sell-category"
                  value={draft.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  {categories.slice(1).map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sell-description">Mô tả chi tiết</label>
                <textarea
                  id="sell-description"
                  value={draft.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Nguồn gốc, thời gian sử dụng, phụ kiện đi kèm…"
                  aria-invalid={!!errors.description}
                  aria-describedby={
                    errors.description ? "sell-description-error" : undefined
                  }
                />
                {error("description")}
                <p className="hint">
                  Nêu thời gian sử dụng, phụ kiện đi kèm và những gì người mua
                  nên biết.
                </p>
              </div>
            </section>
            <section
              className="panel stack"
              id="sell-section-condition"
              tabIndex={-1}
            >
              <h2>3. Tình trạng thực tế</h2>
              <fieldset className="field">
                <legend>Tình trạng</legend>
                <div className="sell-conditions">
                  {["Như mới", "Dùng tốt", "Cần sửa chữa"].map((value) => (
                    <label
                      className={`choice ${draft.condition === value ? "selected" : ""}`}
                      key={value}
                    >
                      <input
                        type="radio"
                        name="condition"
                        checked={draft.condition === value}
                        onChange={() => update("condition", value)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="sell-defects">
                  Trầy xước, lỗi hoặc điểm cần lưu ý
                </label>
                <textarea
                  id="sell-defects"
                  value={draft.defects}
                  onChange={(e) => update("defects", e.target.value)}
                  placeholder="Ví dụ: Vỏ trầy nhẹ, pin dùng khoảng 3 giờ…"
                />
                <p className="hint">
                  Mô tả rõ giúp người mua quyết định và hạn chế hiểu nhầm khi
                  giao nhận.
                </p>
              </div>
            </section>
            <section
              className="panel stack"
              id="sell-section-price"
              tabIndex={-1}
            >
              <h2>4. Giá bán</h2>
              <div className="field">
                <label htmlFor="sell-price">Giá bán (đ)</label>
                <input
                  id="sell-price"
                  inputMode="numeric"
                  value={draft.price}
                  onChange={(e) =>
                    update("price", e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="1.000.000"
                  aria-invalid={!!errors.price}
                  aria-describedby={
                    errors.price ? "sell-price-error" : undefined
                  }
                />
                {error("price")}
                <p className="hint">
                  Đây là giá bán toàn bộ sản phẩm. Người mua có thể chọn trả
                  thẳng hoặc chia theo tháng trong demo.
                </p>
              </div>
            </section>
            <section
              className="panel stack"
              id="sell-section-delivery"
              tabIndex={-1}
            >
              <h2>5. Khu vực và giao nhận</h2>
              <div className="field">
                <label htmlFor="sell-location">Khu vực bán</label>
                <input
                  id="sell-location"
                  value={draft.location}
                  onChange={(e) => update("location", e.target.value)}
                  aria-invalid={!!errors.location}
                  aria-describedby={
                    errors.location ? "sell-location-error" : undefined
                  }
                />
                {error("location")}
              </div>
              <fieldset className="field">
                <legend>Hình thức bạn có thể hỗ trợ</legend>
                <div className="form-grid">
                  <label className={`choice ${draft.meetup ? "selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={draft.meetup}
                      onChange={(e) => update("meetup", e.target.checked)}
                    />
                    Gặp trực tiếp
                  </label>
                  <label
                    className={`choice ${draft.shipping ? "selected" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={draft.shipping}
                      onChange={(e) => update("shipping", e.target.checked)}
                    />
                    Giao hàng
                  </label>
                </div>
                {error("delivery")}
              </fieldset>
              <p className="small muted">
                Chỉ khu vực được hiển thị công khai. Địa điểm gặp cụ thể được
                thống nhất khi có đơn.
              </p>
            </section>
            <section className="panel stack">
              <label className="choice">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  aria-invalid={!!errors.confirmed}
                  aria-describedby={
                    errors.confirmed ? "sell-confirmed-error" : undefined
                  }
                />
                Tôi xác nhận thông tin phản ánh đúng tình trạng sản phẩm.
              </label>
              {error("confirmed")}
              <div className="action-row">
                <button
                  className="button primary"
                  type="submit"
                  disabled={reading || publishing}
                >
                  {publishing
                    ? "Đang gửi duyệt…"
                    : existing
                      ? "Lưu thay đổi tin đăng"
                      : "Gửi duyệt"}
                </button>
                <Link className="button secondary" href="/listings">
                  Quản lý tin đăng
                </Link>
              </div>
              {requestError && (
                <p className="error" role="alert">
                  {requestError}
                </p>
              )}
            </section>
          </div>
          <aside
            className="stack sell-preview"
            aria-label="Xem trước và hướng dẫn đăng tin"
          >
            <section className="panel stack">
              <h2>Tin của bạn sẽ trông như thế này</h2>
              <ProductCard
                product={preview}
                preview
                imagePreview={
                  draft.images.length ? (
                    <ProductPhotoPreview
                      src={preview.image}
                      alt={preview.name}
                      width={600}
                      height={400}
                    />
                  ) : (
                    <div className="preview-photo-empty">
                      <ImagePlus size={32} aria-hidden="true" />
                      <span>Ảnh sản phẩm của bạn</span>
                    </div>
                  )
                }
              />
              <p className="small muted">
                {draft.images.length
                  ? "Ảnh bìa, tên và giá rõ ràng giúp người mua dễ tìm thấy."
                  : "Thêm ảnh gốc để xem trước tin đăng của bạn."}
              </p>
            </section>
            <section className="panel stack">
              <h3>Một tin đăng dễ được tin tưởng</h3>
              <ul className="listing-tips">
                <li>Ảnh thật của chính sản phẩm.</li>
                <li>Nêu cả ưu điểm và điểm chưa tốt.</li>
                <li>Mức giá phù hợp với tình trạng.</li>
                <li>Giữ trao đổi và giao dịch trên ReOwn.</li>
              </ul>
            </section>
          </aside>
        </fieldset>
      </form>
      {created && (
        <Dialog title="Tin đăng đã được tạo" onClose={() => setCreated(null)}>
          <div className="stack">
            <span className="badge success">
              {existing ? "Đã cập nhật" : "Đã tạo tin đăng"}
            </span>
            <h2>Tin đang chờ xét duyệt.</h2>
            <p>
              Tin sẽ xuất hiện sau khi quản trị viên duyệt. AI chỉ hỗ trợ mô tả
              những gì quan sát được từ ảnh.
            </p>
            <p>
              {created.name} · {money(created.price)}
            </p>
            <button
              className="button primary"
              onClick={() => router.push("/listings")}
            >
              Quản lý tin đăng
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
