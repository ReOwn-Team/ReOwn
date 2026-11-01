import Image from "next/image";

export function HackathonStrip() {
    return (
        <section className="hackathon-strip">
            <p>ReOwn là một trong những dự án tham gia hackathon tại</p>
            <div className="hackathon-card">
                <Image
                    src="/hackathon/UII.png"
                    alt="Institute of Innovation"
                    width={1240}
                    height={340}
                    sizes="220px"
                />
            </div>
        </section>
    );
}
