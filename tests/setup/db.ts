import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function setup() {
  config({ path: ".env.local" });
  // Override SMTP settings to use MailHog for hermetic tests (not live Gmail)
  config({ path: ".env.test", override: true });
  process.env.TEST_DATABASE_URL ??=
    "postgres://appcurso:appcurso@localhost:5432/appcurso_test";
  try {
    execSync("pnpm drizzle-kit migrate", {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    });
  } catch (error) {
    console.log(
      "Migration setup failed - this is expected until migrations are created"
    );
  }
}
