import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const projectFiles = [
  "app",
  "components",
  "lib",
  "scripts",
  "mac",
  "test",
  "examples",
  "docs",
  ".gitignore",
  ".node-version",
  ".env.example",
  "package.json",
  "package-lock.json",
  "pmrzokbo.json",
  "tsconfig.json",
  "next.config.ts",
  "next-env.d.ts",
  "playwright.config.ts",
  "README.md",
];
export function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
export function createUpdateFixture(root, project) {
  const remote = join(root, "github-fixture"),
    bin = join(root, "git-bin");
  if (!existsSync(join(remote, ".git"))) {
    mkdirSync(remote, { recursive: true });
    for (const name of projectFiles)
      if (existsSync(join(project, name)))
        cpSync(join(project, name), join(remote, name), { recursive: true });
    git(remote, ["init", "--initial-branch=main"]);
    git(remote, ["add", "--all"]);
    git(remote, [
      "-c",
      "user.name=PMRZ Test",
      "-c",
      "user.email=test@localhost",
      "commit",
      "-m",
      "Fixture baseline",
    ]);
  }
  mkdirSync(bin, { recursive: true });
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  const quote = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
  const rewrite = `url.${pathToFileURL(remote).href}.insteadOf=https://github.com/Taesootosterone/PMRzokbo.git`;
  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh\nexec ${quote(realGit)} -c ${quote(rewrite)} "$@"\n`,
    { mode: 0o755 },
  );
  return { remote, bin };
}
export function publishFixture(
  remote,
  version,
  { buildFailure = false, startFailure = false } = {},
) {
  const pkgPath = join(remote, "package.json"),
    lockPath = join(remote, "package-lock.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")),
    lock = JSON.parse(readFileSync(lockPath, "utf8"));
  pkg.version = version;
  pkg.scripts.build = buildFailure
    ? 'node -e "process.exit(42)"'
    : "next build";
  lock.version = version;
  lock.packages[""].version = version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  if (startFailure) {
    const path = join(remote, "app/api/v1/[...path]/route.ts");
    const code = readFileSync(path, "utf8");
    writeFileSync(
      path,
      code.replace(
        "const db = store();",
        'if (resource === "health") return new Response("Fixture startup failure", {status:503});\n    const db = store();',
      ),
    );
  }
  git(remote, ["add", "--all"]);
  git(remote, [
    "-c",
    "user.name=PMRZ Test",
    "-c",
    "user.email=test@localhost",
    "commit",
    "-m",
    `Fixture ${version}`,
  ]);
  return git(remote, ["rev-parse", "HEAD"]);
}
