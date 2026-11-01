import { describe, expect, it } from "@jest/globals";
import {
    cohortStatus,
    fold,
    mergeParsedCards,
    nameSimilarity,
    parseCardText,
    studentIdIntakeYear,
} from "../../../src/kyc/card-parser";

// Entirely synthetic cards; no real person or student number.
const blue = [
    "BỘ CÔNG THƯƠNG",
    "TRƯỜNG ĐẠI HỌC CÔNG THƯƠNG TP. HỒ CHÍ MINH",
    "140 Lê Trọng Tấn, P. Tây Thanh, Q. Tân Phú, TP. Hồ Chí Minh.",
    "HO CHI MINH CITY UNIVERSITY OF INDUSTRY AND TRADE",
    "THẺ SINH VIÊN",
    "Trần Thị Mẫu Thử",
    "Ngày sinh: 02/03/2005",
    "Ngành: Quản trị kinh doanh",
    "Khoá học: 2023 - | 2027",
].join("\n");

const white = [
    "CÔNG THƯƠNG TP. HCM",
    "Vietcombank",
    "THẺ SINH VIÊN",
    "Student ID Card",
    "MSSV/IĐ: 2311223344",
    "HỌ TÊN:",
    "Fullname",
    "LÊ VĂN MẪU",
    "NGÀY SINH: 31/12/2007",
    "NGÀNH : Kế toán",
    "Accounting",
    "NIÊN KHÓA: 2025-2029",
    "97043633 11111111 111",
].join("\n");

describe("parseCardText", () => {
    it("reads the blue layout", () => {
        const card = parseCardText(blue);
        expect(card).toMatchObject({
            isHuitCard: true,
            layout: "blue",
            fullName: "Trần Thị Mẫu Thử",
            dateOfBirth: "2005-03-02",
            major: "Quản trị kinh doanh",
            cohort: { start: 2023, end: 2027 },
        });
    });

    it("reads the white layout, the labelled student id and skips the napas number", () => {
        const card = parseCardText(white);
        expect(card).toMatchObject({
            isHuitCard: true,
            layout: "white",
            fullName: "Lê Văn Mẫu",
            dateOfBirth: "2007-12-31",
            major: "Kế toán",
            cohort: { start: 2025, end: 2029 },
        });
        expect(card.studentIds).toEqual([{ value: "2311223344", strong: true }]);
    });

    it("repairs common OCR digit confusions next to the MSSV label", () => {
        const card = parseCardText(white.replace("2311223344", "23l1223S44"));
        expect(card.studentIds[0]).toEqual({ value: "2311223544", strong: true });
    });

    it("does not treat other documents as student cards", () => {
        for (const text of [
            "CĂN CƯỚC CÔNG DÂN\nSố: 001234567890\nHọ và tên: NGUYEN VAN A",
            "Hóa đơn bán hàng\nTổng cộng 1.200.000",
            "",
        ])
            expect(parseCardText(text).isHuitCard).toBe(false);
    });

    it("rejects impossible dates and cohorts", () => {
        expect(parseCardText("Ngày sinh: 31/02/2005").dateOfBirth).toBeNull();
        expect(parseCardText("Ngày sinh: 01/01/1950").dateOfBirth).toBeNull();
        expect(parseCardText("Khoá học: 2024 - 2025").cohort).toBeNull();
    });
});

describe("mergeParsedCards", () => {
    it("lets the majority win and prefers labelled student ids", () => {
        const base = parseCardText(white);
        const wrong = parseCardText(white.replace("2311223344", "1311223344"));
        const merged = mergeParsedCards([base, wrong, base]);
        expect(merged.studentId).toMatchObject({ value: "2311223344", votes: 2 });
        const weak = { ...base, studentIds: [{ value: "9999999999", strong: false }] };
        expect(mergeParsedCards([weak, weak, base]).studentId?.value).toBe(
            "2311223344",
        );
    });

    it("reports nothing when no pass found a student id", () => {
        expect(mergeParsedCards([parseCardText(blue)]).studentId).toBeNull();
    });
});

describe("helpers", () => {
    it("folds Vietnamese diacritics without changing length", () => {
        const value = "Nguyễn Đặng Thị Hiếu";
        expect(fold(value)).toBe("NGUYEN DANG THI HIEU");
        expect(fold(value)).toHaveLength(value.length);
    });

    it("matches names across OCR noise, accents and word order", () => {
        expect(nameSimilarity("Nguyên Viết Hiếu", "NGUYỄN VIẾT HIẾU")).toBeGreaterThan(0.9);
        expect(nameSimilarity("Hiếu Nguyễn Viết", "Nguyễn Viết Hiếu")).toBe(1);
        expect(nameSimilarity("Trần Thị Mẫu", "Lê Văn Khác")).toBeLessThan(0.5);
        expect(nameSimilarity("", "Lê Văn Khác")).toBe(0);
    });

    it("derives the intake year from the student id", () => {
        expect(studentIdIntakeYear("2046240180")).toBe(2024);
    });

    it("judges card validity by calendar year", () => {
        const now = new Date("2026-11-01T00:00:00Z");
        expect(cohortStatus({ start: 2024, end: 2028 }, now)).toBe("valid");
        expect(cohortStatus({ start: 2026, end: 2030 }, now)).toBe("valid");
        expect(cohortStatus({ start: 2020, end: 2024 }, now)).toBe("expired");
        expect(cohortStatus({ start: 2027, end: 2031 }, now)).toBe("not_started");
        expect(cohortStatus(null, now)).toBe("unknown");
    });
});
