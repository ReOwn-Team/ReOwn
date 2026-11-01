/**
 * Pure parsing of OCR text from HUIT student cards. Everything here is
 * deterministic and free of I/O so it can be unit-tested with synthetic text.
 */
export type CardLayout = "blue" | "white";

export type ParsedCard = {
    isHuitCard: boolean;
    layout: CardLayout | null;
    fullName: string | null;
    /** ISO yyyy-mm-dd */
    dateOfBirth: string | null;
    major: string | null;
    cohort: { start: number; end: number } | null;
    /** 10-digit candidates; `strong` when printed next to an MSSV label. */
    studentIds: { value: string; strong: boolean }[];
};

/** Strip Vietnamese diacritics and upper-case, keeping string length. */
export function fold(value: string): string {
    return Array.from(value.normalize("NFC"))
        .map((char) => {
            if (char === "đ" || char === "Đ") return "D";
            const base = char.normalize("NFD")[0];
            return base.toUpperCase();
        })
        .join("");
}

const NOT_NAME =
    /CONG THUONG|TRUONG|DAI HOC|THE SINH|SINH VIEN|STUDENT|NGANH|KHOA|NIEN|NGAY|MAJOR|YEAR|ADMISSION|INFORMATION|TECHNOLOGY|FULLNAME|UNIVERSITY|INDUSTRY|VIETCOMBANK|NAPAS|MSSV|HO TEN|HO CHI MINH|TAN PHU|TAY THANH|TRONG TAN|^BO /;

function cleanLine(line: string) {
    return line.replace(/[|_~=—–`'"“”‘’]+/g, " ").replace(/\s+/g, " ").trim();
}

function looksLikeName(line: string) {
    const text = cleanLine(line);
    const folded = fold(text);
    if (/\d/.test(folded) || NOT_NAME.test(folded)) return false;
    const words = folded.split(" ").filter(Boolean);
    return (
        words.length >= 2 &&
        words.length <= 6 &&
        words.every((word) => /^[A-Z]{1,12}$/.test(word)) &&
        words.filter((word) => word.length >= 2).length >= 2 &&
        folded.length >= 5 &&
        folded.length <= 40
    );
}

function titleCase(value: string) {
    return cleanLine(value)
        .toLocaleLowerCase("vi-VN")
        .replace(/(^|\s)(\S)/gu, (_, space: string, letter: string) =>
            `${space}${letter.toLocaleUpperCase("vi-VN")}`,
        );
}

function extractName(lines: string[], layout: CardLayout | null) {
    const foldedLines = lines.map(fold);
    const dobIndex = foldedLines.findIndex((line) => /NGAY\s*SINH/.test(line));
    const labelIndex = foldedLines.findIndex((line) =>
        /H[O0]\s*T[E3]N/.test(line),
    );
    const candidates: string[] = [];
    if (layout !== "blue" && labelIndex >= 0) {
        // Same line after the label, then the next few lines.
        const same = lines[labelIndex].replace(/^.*?T[EÊ3]N\s*[:.]?/iu, "");
        if (looksLikeName(same)) candidates.push(same);
        for (let i = labelIndex + 1; i <= labelIndex + 3 && i < lines.length; i++)
            if (looksLikeName(lines[i])) {
                candidates.push(lines[i]);
                break;
            }
    }
    if (!candidates.length && dobIndex > 0)
        for (let i = dobIndex - 1; i >= Math.max(0, dobIndex - 3); i--)
            if (looksLikeName(lines[i])) {
                candidates.push(lines[i]);
                break;
            }
    return candidates.length ? titleCase(candidates[0]) : null;
}

function extractDob(text: string) {
    const folded = fold(text);
    const near = /NGAY\s*SINH\W{0,6}(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})/.exec(
        folded,
    );
    const any = /\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*((?:19|20)\d{2})\b/.exec(
        folded,
    );
    const match = near ?? any;
    if (!match) return null;
    const [day, month, year] = [match[1], match[2], match[3]].map(Number);
    if (year < 1980 || year > 2015 || month < 1 || month > 12) return null;
    if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate())
        return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function extractCohort(text: string) {
    const joined = text.replace(/\s*[\n|]\s*/g, " ");
    const match = /\b(20\d{2})\s*[-–—~]\s*(20\d{2})\b/.exec(joined);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2]);
    return end - start >= 2 && end - start <= 7 ? { start, end } : null;
}

function extractMajor(lines: string[]) {
    for (let i = 0; i < lines.length; i++) {
        const folded = fold(lines[i]);
        const at = folded.search(/NGANH/);
        if (at < 0 || /KHOA/.test(folded)) continue;
        let rest = lines[i]
            .slice(at + 5)
            .replace(/^[\s:.|]+/, "")
            .replace(/[|_~=]+/g, " ")
            .trim();
        if (rest.length < 3 && lines[i + 1]) rest = cleanLine(lines[i + 1]);
        rest = cleanLine(rest);
        if (/^[\p{L}\s]{3,60}$/u.test(rest) && !/\d/.test(rest)) return rest;
    }
    return null;
}

const DIGIT_FIX: Record<string, string> = {
    O: "0",
    o: "0",
    I: "1",
    l: "1",
    "|": "1",
    S: "5",
    B: "8",
    Z: "2",
};

function extractStudentIds(lines: string[], text: string) {
    const found = new Map<string, boolean>();
    for (const line of lines) {
        const folded = fold(line);
        if (!/MSSV/.test(folded)) continue;
        const afterColon = line.includes(":")
            ? line.slice(line.indexOf(":") + 1)
            : line.slice(folded.indexOf("MSSV") + 4);
        const digits = Array.from(afterColon)
            .map((char) => DIGIT_FIX[char] ?? char)
            .filter((char) => /\d/.test(char))
            .join("");
        if (digits.length === 10) found.set(digits, true);
    }
    for (const match of text.matchAll(/(?<![\d])(\d{10})(?![\d])/g))
        if (!found.has(match[1])) found.set(match[1], false);
    return [...found].map(([value, strong]) => ({ value, strong }));
}

export function parseCardText(text: string): ParsedCard {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    const folded = fold(text);
    const markers = [
        /C[O0]NG\s*TH[UV][O0]NG/.test(folded),
        /INDUSTRY\s*AND\s*TRADE|UNIVERSITY\s*OF\s*INDUSTRY/.test(folded),
        /SINH\s*VI[EF]N|STUDENT\s*ID/.test(folded),
        /MSSV|KHOA\s*H[O0]C|NI[EF]N\s*KH[O0]A/.test(folded),
    ].filter(Boolean).length;
    const white = /STUDENT\s*ID|MSSV|VIETCOMBANK|NAPAS|NI[EF]N\s*KH[O0]A/.test(
        folded,
    );
    const blue = /B[O0]\s*C[O0]NG\s*TH|KH[O0]A\s*H[O0]C/.test(folded);
    const layout: CardLayout | null = white ? "white" : blue ? "blue" : null;
    return {
        isHuitCard: markers >= 2,
        layout,
        fullName: extractName(lines, layout),
        dateOfBirth: extractDob(text),
        major: extractMajor(lines),
        cohort: extractCohort(text),
        studentIds: extractStudentIds(lines, text),
    };
}

function mostCommon<T>(values: (T | null)[], key: (value: T) => string) {
    const counts = new Map<string, { value: T; count: number }>();
    for (const value of values) {
        if (value === null) continue;
        const id = key(value);
        const entry = counts.get(id) ?? { value, count: 0 };
        entry.count++;
        counts.set(id, entry);
    }
    return (
        [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null
    );
}

export type MergedCard = Omit<ParsedCard, "studentIds"> & {
    studentId: { value: string; votes: number; passes: number } | null;
};

/** Combine several OCR passes; each field is decided by majority vote. */
export function mergeParsedCards(passes: ParsedCard[]): MergedCard {
    const pick = <T>(
        select: (card: ParsedCard) => T | null,
        key: (value: T) => string,
    ) => mostCommon(passes.map(select), key)?.value ?? null;
    const ids = new Map<string, { votes: number; strong: number }>();
    for (const pass of passes)
        for (const id of pass.studentIds) {
            const entry = ids.get(id.value) ?? { votes: 0, strong: 0 };
            entry.votes++;
            if (id.strong) entry.strong++;
            ids.set(id.value, entry);
        }
    const best = [...ids]
        .map(([value, entry]) => ({ value, ...entry }))
        .sort((a, b) => b.strong - a.strong || b.votes - a.votes)[0];
    return {
        isHuitCard: passes.some((pass) => pass.isHuitCard),
        layout: pick((card) => card.layout, String),
        fullName: pick((card) => card.fullName, (name) => fold(name)),
        dateOfBirth: pick((card) => card.dateOfBirth, String),
        major: pick((card) => card.major, (value) => fold(value)),
        cohort: pick(
            (card) => card.cohort,
            (value) => `${value.start}-${value.end}`,
        ),
        studentId: best
            ? { value: best.value, votes: best.votes, passes: passes.length }
            : null,
    };
}

function levenshtein(a: string, b: string) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let previous = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const current = row[j];
            row[j] = Math.min(
                row[j] + 1,
                row[j - 1] + 1,
                previous + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            previous = current;
        }
    }
    return row[b.length];
}

/** 0..1 similarity ignoring diacritics, case and word order. */
export function nameSimilarity(a: string, b: string) {
    const tokens = (value: string) =>
        fold(value)
            .replace(/[^A-Z\s]/g, " ")
            .split(/\s+/)
            .filter(Boolean)
            .sort();
    const left = tokens(a).join(" ");
    const right = tokens(b).join(" ");
    if (!left || !right) return 0;
    return 1 - levenshtein(left, right) / Math.max(left.length, right.length);
}

/** Position 5-6 of the student id mirrors the intake year on known cards. */
export function studentIdIntakeYear(studentId: string) {
    return 2000 + Number(studentId.slice(4, 6));
}

export function cohortStatus(
    cohort: { start: number; end: number } | null,
    now: Date,
): "valid" | "expired" | "not_started" | "unknown" {
    if (!cohort) return "unknown";
    const year = now.getUTCFullYear();
    if (year > cohort.end) return "expired";
    if (year < cohort.start) return "not_started";
    return "valid";
}
