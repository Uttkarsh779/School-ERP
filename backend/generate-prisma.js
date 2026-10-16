const { execSync } = require("child_process");

try {
  console.log("Pushing Prisma schema to database...");
  const pushOutput = execSync("npx prisma db push --accept-data-loss", { encoding: "utf8", cwd: __dirname });
  console.log("Prisma DB push succeeded:\n", pushOutput);

  console.log("Running Prisma generate...");
  const genOutput = execSync("npx prisma generate", { encoding: "utf8", cwd: __dirname });
  console.log("Prisma generate succeeded:\n", genOutput);
} catch (err) {
  console.error("Prisma generate failed:", err.message);
  if (err.stdout) console.log("STDOUT:", err.stdout.toString());
  if (err.stderr) console.log("STDERR:", err.stderr.toString());
}
