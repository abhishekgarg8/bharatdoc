const requiredEnv = ["STAGING_WEB_URL", "STAGING_WORKER_URL"];

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value.replace(/\/$/, "");
}

async function checkJson(url, validate) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}.`);
  }

  const payload = await response.json();
  validate(payload);
}

async function checkText(url, expected) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}.`);
  }

  const text = await response.text();

  if (!text.includes(expected)) {
    throw new Error(`${url} did not include ${expected}.`);
  }
}

async function main() {
  for (const envName of requiredEnv) {
    requireEnv(envName);
  }

  const webUrl = requireEnv("STAGING_WEB_URL");
  const workerUrl = requireEnv("STAGING_WORKER_URL");

  await checkJson(`${workerUrl}/health`, (payload) => {
    if (payload?.ok !== true || payload?.service !== "bharatdoc-worker") {
      throw new Error("Worker health payload was not recognized.");
    }
  });

  await checkJson(`${webUrl}/manifest.webmanifest`, (payload) => {
    if (payload?.name !== "BharatDoc" || payload?.display !== "standalone") {
      throw new Error("Web manifest payload was not recognized.");
    }
  });

  await checkText(`${webUrl}/dashboard`, "BharatDoc");
  await checkText(`${webUrl}/recordings/new`, "BharatDoc");

  console.log("Staging smoke passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
