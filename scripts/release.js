import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const bump = args.find((arg) => arg !== "--dry-run");

if (args.length < 1 || args.length > 2 || !["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: npm run release -- <patch|minor|major> [--dry-run]");
  process.exit(1);
}

function git(args, capture = false) {
  const result = execFileSync("git", args, {
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  return capture ? (result ?? "").trim() : "";
}

function bumpVersion(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`Expected a stable semantic version, got ${version}`);
  }

  const parts = version.split(".").map(Number);
  const index = { major: 0, minor: 1, patch: 2 }[bump];

  if (!Number.isSafeInteger(parts[index] + 1)) {
    throw new Error(`Version component is too large to increment: ${version}`);
  }

  parts[index] += 1;
  for (let i = index + 1; i < parts.length; i += 1) {
    parts[i] = 0;
  }
  return parts.join(".");
}

function updateTomlPackageVersion(contents, label) {
  const lines = contents.split(/\r?\n/);
  const sectionStart = lines.indexOf("[package]");
  const sectionEnd = lines.findIndex(
    (line, index) => index > sectionStart && line.startsWith("["),
  );
  const end = sectionEnd === -1 ? lines.length : sectionEnd;
  const versionLine = lines.findIndex(
    (line, index) => index > sectionStart && index < end && /^version = ".*"$/.test(line),
  );

  if (sectionStart === -1 || versionLine === -1) {
    throw new Error(`Could not find the package version in ${label}`);
  }

  const current = lines[versionLine].match(/^version = "([^"]+)"$/)?.[1];
  if (current !== oldVersion) {
    throw new Error(`${label} has version ${current ?? "invalid"}; expected ${oldVersion}`);
  }

  lines[versionLine] = `version = "${newVersion}"`;
  return lines.join("\n");
}

function updateCargoLockVersion(contents) {
  const lines = contents.split(/\r?\n/);
  const packageStart = lines.findIndex((line, index) => {
    if (line !== "[[package]]") {
      return false;
    }

    const nextPackage = lines.findIndex(
      (nextLine, nextIndex) => nextIndex > index && nextLine === "[[package]]",
    );
    const end = nextPackage === -1 ? lines.length : nextPackage;
    return lines.slice(index + 1, end).includes('name = "prosecraft"');
  });
  const packageEnd = lines.findIndex(
    (line, index) => index > packageStart && line === "[[package]]",
  );
  const end = packageEnd === -1 ? lines.length : packageEnd;
  const nameLine = lines.findIndex(
    (line, index) => index > packageStart && index < end && line === 'name = "prosecraft"',
  );
  const versionLine = lines.findIndex(
    (line, index) => index > nameLine && index < end && /^version = ".*"$/.test(line),
  );

  if (packageStart === -1 || nameLine === -1 || versionLine === -1) {
    throw new Error("Could not find the prosecraft package version in src-tauri/Cargo.lock");
  }

  const current = lines[versionLine].match(/^version = "([^"]+)"$/)?.[1];
  if (current !== oldVersion) {
    throw new Error(`src-tauri/Cargo.lock has version ${current ?? "invalid"}; expected ${oldVersion}`);
  }

  lines[versionLine] = `version = "${newVersion}"`;
  return lines.join("\n");
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const tauriConfig = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
const oldVersion = packageJson.version;
const newVersion = bumpVersion(oldVersion);
const tag = `v${newVersion}`;

for (const [label, version] of [
  ["package-lock.json", packageLock.packages?.[""]?.version],
  ["package-lock.json root", packageLock.version],
  ["src-tauri/tauri.conf.json", tauriConfig.version],
]) {
  if (version !== oldVersion) {
    throw new Error(`${label} has version ${version ?? "missing"}; expected ${oldVersion}`);
  }
}

const cargoToml = updateTomlPackageVersion(
  readFileSync("src-tauri/Cargo.toml", "utf8"),
  "src-tauri/Cargo.toml",
);
const cargoLock = updateCargoLockVersion(readFileSync("src-tauri/Cargo.lock", "utf8"));
const branch = git(["branch", "--show-current"], true);
if (!branch) {
  throw new Error("Release must be run from a named branch, not detached HEAD");
}
git(["remote", "get-url", "origin"], true);

let tagExists = true;
try {
  git(["show-ref", "--verify", "--quiet", `refs/tags/${tag}`], true);
} catch (error) {
  if (error.status !== 1) {
    throw error;
  }
  tagExists = false;
}
if (tagExists) {
  throw new Error(`Tag ${tag} already exists locally`);
}

if (!dryRun) {
  const status = git(["status", "--porcelain"], true);
  if (status) {
    throw new Error("Tracked changes must be committed before releasing");
  }

  for (const file of [".github/workflows/release.yml", "scripts/release.js"]) {
    if (!git(["ls-tree", "--name-only", "HEAD", "--", file], true)) {
      throw new Error(`Commit ${file} before creating a release`);
    }
  }
}

console.log(`${dryRun ? "Would release" : "Releasing"} ${tag} from branch ${branch}`);
if (dryRun) {
  process.exit(0);
}

packageJson.version = newVersion;
packageLock.version = newVersion;
packageLock.packages[""].version = newVersion;
tauriConfig.version = newVersion;
writeFileSync("package.json", `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync("package-lock.json", `${JSON.stringify(packageLock, null, 2)}\n`);
writeFileSync("src-tauri/tauri.conf.json", `${JSON.stringify(tauriConfig, null, 2)}\n`);
writeFileSync("src-tauri/Cargo.toml", cargoToml);
writeFileSync("src-tauri/Cargo.lock", cargoLock);

git([
  "add",
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
]);
git(["commit", "-m", `chore(release): ${tag}`]);
git(["tag", "-a", tag, "-m", `Release ${tag}`]);
try {
  git([
    "push",
    "--atomic",
    "origin",
    `HEAD:refs/heads/${branch}`,
    `refs/tags/${tag}`,
  ]);
} catch (error) {
  console.error(
    `The release commit and local tag ${tag} were created, but the push failed. ` +
      `After resolving the Git error, retry with:\n` +
      `git push --atomic origin HEAD:refs/heads/${branch} refs/tags/${tag}`,
  );
  throw error;
}

const expectedCommit = git(["rev-parse", "HEAD"], true);
const remoteTagCommit = git(
  ["ls-remote", "--tags", "origin", `${tag}^{}`],
  true,
)
  .split(/\s+/)[0];

if (remoteTagCommit !== expectedCommit) {
  throw new Error(
    `Release push completed but remote tag verification failed for ${tag}. ` +
      `Expected it to point to ${expectedCommit}; found ${remoteTagCommit || "missing"}.`,
  );
}

console.log(`Pushed ${tag}; the GitHub Actions release workflow will build and publish it.`);
