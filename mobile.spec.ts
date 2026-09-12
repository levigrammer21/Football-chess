import { test, expect, Page, chromium } from "@playwright/test";
async function register(page: Page, name: string) {
  await page.goto("http://127.0.0.1:5173/");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByLabel("Coach name").fill(name);
  await page
    .getByLabel("Email", { exact: true })
    .fill(
      `${name.toLowerCase().replaceAll(" ", "")}${Date.now()}@example.test`,
    );
  await page.getByLabel("Password", { exact: true }).fill("Mobile-testing-123");
  await page.getByRole("button", { name: "Create your club" }).click();
  await expect(
    page.getByRole("heading", { name: "Your next winning call." }),
  ).toBeVisible();
}
async function draw(
  page: Page,
  id: string,
  points: { x: number; y: number }[],
) {
  await page.getByRole("button", { name: id, exact: true }).click();
  const field = page.locator("svg.field");
  await field.scrollIntoViewIfNeeded();
  const rect = await field.boundingBox();
  if (!rect) throw Error("Field missing");
  const session = await page.context().newCDPSession(page);
  const point = (p: { x: number; y: number }) => ({
    x: rect.x + (p.x / 53.3) * rect.width,
    y: rect.y + ((65 - p.y) / 80) * rect.height,
    id: 1,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(points[0])],
  });
  for (const p of points.slice(1))
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(p)],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await session.detach();
}
test("phone account, multi-route design, defense, two-player snap, refresh, film and sign-out", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await register(page, "Mobile Coach");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.getByRole("button", { name: "Playbook", exact: true }).click();
  await page
    .getByRole("button", { name: "Design play", exact: true })
    .first()
    .click();
  await page.getByLabel("Play name").fill("Phone-drawn Post");
  await draw(page, "WR1", [
    { x: 5, y: 0 },
    { x: 5, y: 8 },
    { x: 12, y: 16 },
    { x: 24, y: 27 },
  ]);
  await draw(page, "RB", [
    { x: 23, y: -7 },
    { x: 18, y: -4 },
    { x: 10, y: 0 },
    { x: 4, y: 7 },
  ]);
  await page.getByLabel("1 · Primary read").selectOption("WR1");
  await page.getByLabel("2 · Secondary read").selectOption("RB");
  await page.getByRole("button", { name: "Save play", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Phone-drawn Post" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Playbook", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Phone-drawn Post" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "defense · 5" }).click();
  await page.getByRole("button", { name: "Design play" }).first().click();
  await page.getByLabel("Play name").fill("Phone Cover");
  await page.getByRole("button", { name: "CB1", exact: true }).click();
  await page.getByLabel("CB1 assignment").selectOption("zone");
  await page.getByLabel(/Zone radius/).focus();
  await page.getByLabel(/Zone radius/).press("ArrowRight");
  await page.getByRole("button", { name: "Save play", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Phone Cover" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: /Invite an opponent/ }).click();
  const code = (await page.locator(".invite-code").innerText()).trim();
  await page.screenshot({
    path: "test-results/mobile-invite.png",
    fullPage: true,
  });
  const otherBrowser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? {
          executablePath: process.env.CHROMIUM_PATH,
          args: JSON.parse(process.env.CHROMIUM_ARGS || "[]"),
        }
      : {},
  );
  const other = await otherBrowser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const opponent = await other.newPage();
  await register(opponent, "Opponent Coach");
  await opponent.getByLabel("Invite code").fill(code);
  await opponent
    .getByRole("button", { name: "Join game", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose your call" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lock call", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Call locked" }),
  ).toBeVisible();
  await expect(
    opponent.getByText("Phone-drawn Post", { exact: true }),
  ).toHaveCount(0);
  await opponent
    .getByRole("button", { name: "Lock call", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Snap 1", exact: true }),
  ).toBeVisible();
  await expect(
    opponent.getByRole("heading", { name: "Snap 1", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-game.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page.locator(".list-card").first().click();
  await expect(
    page.getByRole("heading", { name: "Snap 1", exact: true }),
  ).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Concede game", exact: true }).click();
  await expect(page.getByText("FINAL", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "film", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Revealed play calls" }),
  ).toBeVisible();
  await expect(
    page.getByText("Phone-drawn Post", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-film.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "stats", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Enter the clubhouse" }),
  ).toBeVisible();
  assertNoErrors(errors);
  await other.close();
  await otherBrowser.close();
});
function assertNoErrors(errors: string[]) {
  expect(errors).toEqual([]);
}
