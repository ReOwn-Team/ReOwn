"use client";

import { PushSettings } from "./push-settings";

export function SecurityTab() {
    return (
        <div className="stack">
            <section className="panel stack">
                <h2>Mật khẩu &amp; bảo mật</h2>
                <p>
                    Đổi mật khẩu chưa khả dụng vì API hiện chưa hỗ trợ chức năng
                    này.
                </p>
                <button className="button secondary" type="button" disabled>
                    Đổi mật khẩu
                </button>
            </section>
            <PushSettings />
        </div>
    );
}
