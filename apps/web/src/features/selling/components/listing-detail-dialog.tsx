"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import {
  getProduct,
  getOwnerInspection,
  type OwnerInspection,
} from "@/lib/products/client";
import { money, type Listing } from "@/mocks/data";

type Report = NonNullable<NonNullable<OwnerInspection["inspection"]>["report"]>;
const groups: Array<
  [
    keyof Pick<
      Report,
      | "visibleDefects"
      | "imageQuality"
      | "inconsistencies"
      | "productObservations"
    >,
    string,
  ]
> = [
  ["visibleDefects", "Dấu hiệu hư hại"],
  ["imageQuality", "Ảnh cần bổ sung hoặc chụp lại"],
  ["inconsistencies", "Điểm chưa khớp với mô tả"],
  ["productObservations", "Chi tiết quan sát được"],
];
export function ListingDetailDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{
    listing: Listing;
    inspection: OwnerInspection;
  }>();
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.all([getProduct(id, true), getOwnerInspection(id)])
      .then(([listing, inspection]) => {
        if (active) {
          setData({ listing, inspection });
          setError("");
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Chưa thể tải tin.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reload]);
  function refresh() {
    setLoading(true);
    setReload((value) => value + 1);
  }
  const result = data?.inspection.inspection;
  const report = result?.status === "completed" ? result.report : null;
  return (
    <Dialog title="Chi tiết tin đăng" onClose={onClose} wide>
      <div className="stack" aria-busy={loading}>
        {loading && <p role="status">Đang tải tin và kết quả kiểm tra ảnh…</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {data && (
          <>
            <div>
              <h2>{data.listing.name}</h2>
              <p>
                {money(data.listing.price)} · {data.listing.status}
              </p>
            </div>
            <div className="listing-photo-review">
              {(data.listing.images ?? [data.listing.image]).map(
                (url, index) => (
                  <figure key={url} id={`listing-photo-${index}`}>
                    <Image
                      src={url}
                      unoptimized
                      width={320}
                      height={240}
                      alt={`${data.listing.name}, ảnh ${index + 1}`}
                    />
                    <figcaption>Ảnh {index + 1}</figcaption>
                  </figure>
                ),
              )}
            </div>
            <p className="preserve-lines">{data.listing.description}</p>
            <p>
              <strong>Tình trạng người bán khai báo:</strong>{" "}
              {data.listing.condition}
            </p>
            <p>
              <strong>Điểm cần lưu ý:</strong>{" "}
              {data.listing.defects || "Chưa khai báo"}
            </p>
            <section className="stack" aria-label="Kết quả kiểm tra ảnh AI">
              <div>
                <h3>Kiểm tra ảnh AI</h3>
                <p className="small muted">
                  AI ghi nhận dấu hiệu nhìn thấy được. Kết quả không thay thế
                  kiểm tra trực tiếp hay quyết định của quản trị viên.
                </p>
              </div>
              {!report && (
                <p role="status">
                  {!result
                    ? "Tin này chưa có kết quả kiểm tra ảnh."
                    : result.status === "failed"
                      ? "Chưa phân tích được ảnh. Tin vẫn có thể được quản trị viên xem xét."
                      : result.status === "cancelled"
                        ? "Lượt kiểm tra này đã dừng."
                        : "Ảnh đang chờ hoặc đang được phân tích. Bạn có thể đóng cửa sổ và xem lại sau."}
                </p>
              )}
              {report && (
                <>
                  <p>{report.summary}</p>
                  {groups.map(([key, label]) => (
                    <section className="inspection-findings" key={key}>
                      <h4>{label}</h4>
                      {key === "visibleDefects" && !report[key].length && (
                        <p>
                          Chưa ghi nhận dấu hiệu hư hại trong phần sản phẩm nhìn
                          thấy được. Điều này không xác nhận sản phẩm không có
                          lỗi.
                        </p>
                      )}
                      {report[key].length === 0 && key !== "visibleDefects" && (
                        <p className="small muted">
                          Không có ghi nhận trong báo cáo này.
                        </p>
                      )}
                      {report[key].map((finding, index) => (
                        <div className="inspection-finding" key={index}>
                          <p>
                            <strong>{finding.observation}</strong>
                          </p>
                          <p>{finding.evidence}</p>
                          <div className="action-row small">
                            {finding.imageIds.map((imageId) => {
                              const imageIndex = (
                                data.listing.images ?? [data.listing.image]
                              ).findIndex(
                                (url) => url.split("/").at(-1) === imageId,
                              );
                              return imageIndex < 0 ? null : (
                                <a
                                  href={`#listing-photo-${imageIndex}`}
                                  key={imageId}
                                >
                                  Ảnh {imageIndex + 1}
                                </a>
                              );
                            })}
                            <span className="muted">
                              Mức chắc chắn:{" "}
                              {
                                { low: "thấp", medium: "vừa", high: "cao" }[
                                  finding.certainty
                                ]
                              }
                            </span>
                          </div>
                        </div>
                      ))}
                    </section>
                  ))}
                  <div>
                    <h4>Những điều chưa thể kết luận</h4>
                    <ul>
                      {report.limitations.map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </section>
            <div className="action-row">
              {data.listing.status !== "Đã bán" && (
                <Link className="button secondary" href={`/sell?edit=${id}`}>
                  Chỉnh sửa và gửi duyệt lại
                </Link>
              )}
              {data.listing.status === "Đang hiển thị" && (
                <Link className="button secondary" href={`/products/${id}`}>
                  Xem trang công khai
                </Link>
              )}
            </div>
          </>
        )}
        <div className="action-row">
          <button
            className="button secondary"
            disabled={loading}
            onClick={refresh}
          >
            Cập nhật kết quả
          </button>
          <button className="button secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </Dialog>
  );
}
