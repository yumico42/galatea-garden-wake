import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export const stateDirectory = resolve(
  process.env.GARDEN_STATE_DIRECTORY ?? "/data/garden-wake",
);
export const armPath = `${stateDirectory}/armed.json`;
export const runtimePath = `${stateDirectory}/runtime.json`;

function decodeMountPath(value) {
  return value
    .replaceAll("\\040", " ")
    .replaceAll("\\011", "\t")
    .replaceAll("\\012", "\n")
    .replaceAll("\\134", "\\");
}

function containsPath(parent, child) {
  const candidate = relative(parent, child);
  return candidate === "" || (!candidate.startsWith("..") && !isAbsolute(candidate));
}

export async function assertPersistentState() {
  if (!isAbsolute(stateDirectory)) {
    throw new Error("GARDEN_STATE_DIRECTORY must be absolute");
  }
  if ((process.env.GARDEN_REQUIRE_PERSISTENT_STATE ?? "true").toLowerCase() === "false") {
    return;
  }

  let mountInfo;
  try {
    mountInfo = await readFile("/proc/self/mountinfo", "utf8");
  } catch {
    throw new Error("cannot verify persistent state mount");
  }
  const mountPoints = mountInfo
    .split("\n")
    .map((line) => line.trim().split(" ")[4])
    .filter(Boolean)
    .map(decodeMountPath)
    .filter((mountPoint) => mountPoint !== "/" && containsPath(mountPoint, stateDirectory));
  if (mountPoints.length === 0) {
    throw new Error("/data is not a dedicated persistent volume; refusing to connect Garden");
  }
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeJsonAtomic(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

export async function consumeArm() {
  const consumedPath = `${stateDirectory}/last-consumed.json`;
  try {
    await rename(armPath, consumedPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
