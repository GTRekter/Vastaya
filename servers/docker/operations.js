import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT = 60_000;
const QUICK_TIMEOUT = 5_000;

let dockerVerified = false;

async function ensureDockerAvailable() {
  if (dockerVerified) {
    return;
  }

  try {
    await execFileAsync("docker", ["info"], {
      timeout: QUICK_TIMEOUT,
    });
    dockerVerified = true;
  } catch (error) {
    const hint =
      "\nMake sure Docker Desktop/daemon is running and that your user has permission to access the Docker socket.";
    throw buildError(
      "Unable to reach the Docker daemon.",
      error,
      hint,
    );
  }
}

function cleanBuffer(value) {
  if (!value) {
    return "";
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return String(value);
}

function buildError(message, error, extra = "") {
  const err = new Error(
    [message, cleanBuffer(error?.stderr), cleanBuffer(error?.stdout), extra]
      .filter(Boolean)
      .join("\n")
      .trim(),
  );
  err.stderr = cleanBuffer(error?.stderr);
  err.stdout = cleanBuffer(error?.stdout);
  err.code = error?.code;
  return err;
}

async function runDockerCommand(args, options = {}) {
  await ensureDockerAvailable();

  try {
    const { stdout, stderr } = await execFileAsync("docker", args, {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      env: {
        ...process.env,
        LANG: "en_US.UTF-8",
      },
    });
    return {
      stdout: cleanBuffer(stdout).trim(),
      stderr: cleanBuffer(stderr).trim(),
    };
  } catch (error) {
    throw buildError("Docker command failed.", error);
  }
}

function normaliseOutput(stdout, stderr, fallback) {
  const content = [stdout, stderr].filter(Boolean).join("\n").trim();
  return content || fallback;
}

function parseCommand(command) {
  if (!command) {
    return [];
  }
  if (Array.isArray(command)) {
    return command.filter((token) => typeof token === "string" && token.length > 0);
  }
  const tokens = [];
  const regexp = /"([^"]*)"|'([^']*)'|`([^`]*)`|([^\s]+)/g;
  let match;
  while ((match = regexp.exec(command)) !== null) {
    const [, dbl, single, backtick, plain] = match;
    tokens.push(dbl ?? single ?? backtick ?? plain);
  }
  return tokens;
}

export async function listContainers(params = {}) {
  const args = ["ps"];
  if (params.all) {
    args.push("-a");
  }
  if (params.format === "json") {
    args.push("--format", "{{json .}}");
  }
  const { stdout, stderr } = await runDockerCommand(args);
  return normaliseOutput(
    stdout,
    stderr,
    params.all ? "No containers found." : "No running containers.",
  );
}

export async function listImages(params = {}) {
  const args = ["images"];
  if (params.all) {
    args.push("-a");
  }
  if (params.digests) {
    args.push("--digests");
  }
  const { stdout, stderr } = await runDockerCommand(args);
  return normaliseOutput(stdout, stderr, "No images found.");
}

export async function getLogs(params = {}) {
  if (!params.containerId) {
    throw new Error("containerId is required.");
  }
  const args = ["logs"];
  if (params.tail !== undefined) {
    args.push("--tail", String(params.tail));
  }
  if (params.timestamps) {
    args.push("-t");
  }
  if (params.since) {
    args.push("--since", params.since);
  }
  args.push(params.containerId);

  const { stdout, stderr } = await runDockerCommand(args, { timeout: params.follow ? undefined : DEFAULT_TIMEOUT });

  return normaliseOutput(stdout, stderr, `No log output for ${params.containerId}.`);
}

export async function runContainer(params = {}) {
  if (!params.image) {
    throw new Error("image is required.");
  }

  const args = ["run"];
  const detach = params.detach !== false;
  if (detach) {
    args.push("-d");
  }
  if (params.remove) {
    args.push("--rm");
  }
  if (params.name) {
    args.push("--name", params.name);
  }
  if (params.workdir) {
    args.push("-w", params.workdir);
  }
  if (Array.isArray(params.ports)) {
    params.ports.forEach((mapping) => {
      if (typeof mapping === "string" && mapping.includes(":")) {
        args.push("-p", mapping);
      }
    });
  }
  if (Array.isArray(params.volumes)) {
    params.volumes.forEach((volume) => {
      if (typeof volume === "string" && volume.includes(":")) {
        args.push("-v", volume);
      }
    });
  }
  if (params.env && typeof params.env === "object") {
    for (const [key, value] of Object.entries(params.env)) {
      if (typeof key === "string" && key.length > 0) {
        args.push("-e", `${key}=${value ?? ""}`);
      }
    }
  }
  if (Array.isArray(params.extraArgs)) {
    params.extraArgs.forEach((value) => {
      if (typeof value === "string" && value.length > 0) {
        args.push(value);
      }
    });
  }

  args.push(params.image);
  args.push(...parseCommand(params.command));

  const { stdout, stderr } = await runDockerCommand(args, {
    timeout: params.detach === false ? undefined : DEFAULT_TIMEOUT,
  });
  return normaliseOutput(
    stdout,
    stderr,
    detach ? "Container started successfully." : "Docker run completed.",
  );
}

export async function stopContainer(params = {}) {
  if (!params.containerId) {
    throw new Error("containerId is required.");
  }
  const { stdout, stderr } = await runDockerCommand([
    "stop",
    params.containerId,
  ]);
  return normaliseOutput(stdout, stderr, `Sent stop signal to ${params.containerId}.`);
}

export async function removeContainer(params = {}) {
  if (!params.containerId) {
    throw new Error("containerId is required.");
  }
  const args = ["rm"];
  if (params.force) {
    args.push("-f");
  }
  args.push(params.containerId);

  const { stdout, stderr } = await runDockerCommand(args);
  return normaliseOutput(stdout, stderr, `Removed container ${params.containerId}.`);
}

export async function removeImage(params = {}) {
  if (!params.imageId) {
    throw new Error("imageId is required.");
  }
  const args = ["image", "rm"];
  if (params.force) {
    args.push("-f");
  }
  if (params.prune === false) {
    args.push("--no-prune");
  }
  args.push(params.imageId);

  try {
    const { stdout, stderr } = await runDockerCommand(args);
    return normaliseOutput(stdout, stderr, `Removed image ${params.imageId}.`);
  } catch (error) {
    if (error?.stderr?.includes("is being used by running container")) {
      throw buildError(
        `Failed to remove image ${params.imageId}. Stop or remove dependent containers and try again.`,
        error,
      );
    }
    throw error;
  }
}

export async function inspectResource(params = {}) {
  if (!params.target) {
    throw new Error("target is required.");
  }
  const args = ["inspect", params.target];
  if (params.format) {
    args.push("--format", params.format);
  }
  const { stdout, stderr } = await runDockerCommand(args);
  return normaliseOutput(stdout, stderr, `No inspection data for ${params.target}.`);
}

export async function pruneDocker(params = {}) {
  const scope = params.scope ?? "system";
  const args = [scope, "prune"];
  if (params.force !== false) {
    args.push("-f");
  }
  const { stdout, stderr } = await runDockerCommand(args);
  return normaliseOutput(stdout, stderr, `Pruned Docker ${scope}.`);
}

export async function composeCommand(params = {}) {
  if (!params.subcommand) {
    throw new Error("subcommand is required.");
  }

  const subcommandArgs = Array.isArray(params.args) ? params.args : parseCommand(params.args);
  const args = ["compose", params.subcommand, ...subcommandArgs];
  if (params.file) {
    args.push("-f", params.file);
  }
  if (params.project) {
    args.push("-p", params.project);
  }
  const { stdout, stderr } = await runDockerCommand(args, {
    timeout: params.subcommand === "logs" ? undefined : DEFAULT_TIMEOUT,
  });
  return normaliseOutput(stdout, stderr, `docker compose ${params.subcommand} completed.`);
}
