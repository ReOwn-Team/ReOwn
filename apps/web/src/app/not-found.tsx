import Link from "next/link";

export default function NotFound() {
  return (
    <main
      id="noi-dung"
      tabIndex={-1}
      className="mx-auto flex min-h-svh max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16"
    >
      <h1 className="text-3xl leading-tight font-bold">Trang này chưa có.</h1>
      <p className="max-w-[60ch] text-muted">
        Bạn có thể quay về trang chủ để tiếp tục.
      </p>
      <Link
        href="/"
        className="rounded-[10px] bg-brand px-5 py-3 font-semibold text-white hover:bg-brand-hover"
      >
        Về trang chủ
      </Link>
    </main>
  );
}
