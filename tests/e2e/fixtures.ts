import { type Page, expect } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByPlaceholder("Correo").fill(email);
  await page.getByPlaceholder(/contraseña/i).fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export const PROF = { email: "prof@test.pe", password: "prof12345" };
export const ALUMNO = { email: "alumno@test.pe", password: "alumno12345" };
