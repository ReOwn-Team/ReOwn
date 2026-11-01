import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SparklesText } from "@/components/primitives/sparkles-text";
import "./team.css";

export const metadata: Metadata = {
    title: "Đội Ngũ ReOwn",
    description:
        "Gặp gỡ năm thành viên đang xây dựng ReOwn — nơi đồ cũ tìm thấy giá trị mới.",
};

const members = [
    {
        name: "Vi Diệp Khánh Linh",
        role: "Leader · Risk Management",
        school: "Trường Đại học Công Thương TP. Hồ Chí Minh",
        major: "Công nghệ tài chính",
        portrait: "/figma/team/khanh-linh.png",
    },
    {
        name: "Võ Hoàng Minh Anh",
        role: "Marketing · Growth Lead",
        school: "Trường Đại học Công Thương TP. Hồ Chí Minh",
        major: "Công nghệ tài chính",
        portrait: "/figma/team/minh-anh.png",
    },
    {
        name: "Vũ Bá Thành",
        role: "CTO",
        school: "Trường Đại học Công Thương TP. Hồ Chí Minh",
        major: "An toàn thông tin",
        portrait: "/figma/team/ba-thanh.png",
    },
    {
        name: "Nguyễn Viết Hiếu",
        role: "Full-stack Developer",
        school: "Trường Đại học Công Thương TP. Hồ Chí Minh",
        major: "Công nghệ thông tin",
        portrait: "/figma/team/viet-hieu.png",
    },
    {
        name: "Phạm Hồng Thanh",
        role: "Legal / Compliance Lead",
        school: "Trường Đại học Kinh Tế TP. Hồ Chí Minh",
        major: "Luật kinh tế",
        portrait: "/figma/team/hong-thanh.png",
    },
] as const;

export default function TeamPage() {
    return (
        <div className="container page team-page">
            <nav className="team-breadcrumb" aria-label="Đường dẫn trang">
                <Link href="/">Trang chủ</Link>
                <ChevronRight aria-hidden="true" />
                <span aria-current="page">Đội ngũ ReOwn</span>
            </nav>

            <SparklesText
                as="h1"
                id="team-heading"
                className="team-mark"
                colors={{ first: "#e67e22", second: "#f6c453" }}
            >
                Đội Ngũ ReOwn
            </SparklesText>

            <section className="team-roster" aria-labelledby="team-heading">
                <header className="team-intro">
                    <p>
                        Gặp năm thành viên đang xây dựng ReOwn — nơi đồ cũ tìm
                        thấy giá trị mới.
                    </p>
                </header>

                <ul className="team-members">
                    {members.map((member, index) => (
                        <li
                            className="team-member"
                            key={member.name}
                            style={
                                {
                                    "--team-index": index,
                                } as React.CSSProperties
                            }
                        >
                            <Image
                                src={member.portrait}
                                alt=""
                                width={112}
                                height={148}
                                sizes="112px"
                            />
                            <h2>{member.name}</h2>
                            <p className="team-role">{member.role}</p>
                            <p className="team-school">{member.school}</p>
                            <p className="team-major">{member.major}</p>
                        </li>
                    ))}
                </ul>
            </section>

            <aside className="team-note" aria-label="Điều đội ngũ tin tưởng">
                <h2>Đồ cũ, giá trị mới.</h2>
                <p>
                    Mỗi món đồ vẫn có thể hữu ích với một người khác. ReOwn bắt
                    đầu từ suy nghĩ giản dị đó — và được xây dựng từng ngày bởi
                    cả đội ngũ.
                </p>
            </aside>
        </div>
    );
}
