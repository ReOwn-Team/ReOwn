import { test, expect } from "./fixtures";

test("logo provides press feedback and respects reduced motion", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/browse");
    const logo = page.getByRole("link", { name: "ReOwn — trang chủ" });
    const image = logo.locator("img");
    const box = await logo.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await expect(image).not.toHaveCSS("transform", "none");
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$/);

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedBox = await logo.boundingBox();
    expect(reducedBox).not.toBeNull();
    await page.mouse.move(
        reducedBox!.x + reducedBox!.width / 2,
        reducedBox!.y + reducedBox!.height / 2,
    );
    await page.mouse.down();
    await expect(image).toHaveCSS("transform", "none");
    await page.mouse.up();
});

test("dialog motion keeps focus and scroll lock correct for every dismissal", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");
    const trigger = page.getByRole("button", {
        name: "Đăng nhập / Đăng ký",
        exact: true,
    });
    for (const method of ["button", "escape", "backdrop"]) {
        await trigger.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveCSS("opacity", "1");
        expect(
            await dialog.evaluate((el) => el.contains(document.activeElement)),
        ).toBe(true);
        if (method === "button") {
            const state = await dialog
                .getByRole("button", { name: "Đóng", exact: true })
                .evaluate((button) => {
                    (button as HTMLButtonElement).click();
                    const dialog = button.closest("dialog")!;
                    return {
                        state: dialog.dataset.state,
                        open: dialog.open,
                        scroll: document.body.style.overflow,
                    };
                });
            expect(state).toEqual({
                state: "closing",
                open: true,
                scroll: "hidden",
            });
        } else if (method === "escape") {
            await page.keyboard.press("Escape");
        } else {
            await page.mouse.click(2, 2);
        }
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        expect(await page.evaluate(() => document.body.style.overflow)).toBe(
            "",
        );
    }
});

test("reduced motion disables overlay movement and closes without a closing phase", async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const trigger = page.getByRole("button", {
        name: "Đăng nhập / Đăng ký",
        exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    expect(
        await dialog.evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    const closingState = await dialog
        .getByRole("button", { name: "Đóng", exact: true })
        .evaluate((button) => {
            const dialog = button.closest("dialog")!;
            (button as HTMLButtonElement).click();
            return dialog.dataset.state ?? null;
        });
    expect(closingState).toBeNull();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
});
