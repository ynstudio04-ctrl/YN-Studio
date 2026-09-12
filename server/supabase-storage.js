const crypto = require("crypto");

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const SERVICE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "yn-studio-files").trim();

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase Storage."
  );
}

let bucketReady = false;

function authHeaders(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    ...extra,
  };
}

async function ensureBucket() {
  if (bucketReady) return;

  // First check whether the bucket already exists. This avoids treating
  // Supabase's "BucketAlreadyExists" response as a fatal upload error.
  const getResponse = await fetch(
    `${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`,
    { method: "GET", headers: authHeaders() }
  );

  if (getResponse.ok) {
    // Existing buckets may have been created with the old 10 MB limit.
    // Update it to 20 MB, but don't fail the upload solely because the
    // metadata update is rejected by an already-correct bucket.
    const updateResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ file_size_limit: 20 * 1024 * 1024, public: true }),
      }
    );

    if (!updateResponse.ok) {
      const text = await updateResponse.text();
      console.warn(`Supabase Storage bucket limit update skipped (${updateResponse.status}): ${text}`);
    }

    bucketReady = true;
    return;
  }

  // Bucket does not exist, so create it.
  const createResponse = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 20 * 1024 * 1024,
    }),
  });

  if (!createResponse.ok) {
    const text = await createResponse.text();
    const isAlreadyExists =
      createResponse.status === 409 ||
      (createResponse.status === 400 && /BucketAlreadyExists|already exists/i.test(text));

    if (!isAlreadyExists) {
      throw new Error(`Supabase Storage bucket setup failed (${createResponse.status}): ${text}`);
    }

    // Another request may have created it between our GET and POST. Verify it
    // exists before continuing.
    const verifyResponse = await fetch(
      `${SUPABASE_URL}/storage/v1/bucket/${encodeURIComponent(BUCKET)}`,
      { method: "GET", headers: authHeaders() }
    );

    if (!verifyResponse.ok) {
      const verifyText = await verifyResponse.text();
      throw new Error(`Supabase Storage bucket verification failed (${verifyResponse.status}): ${verifyText}`);
    }
  }

  bucketReady = true;
}

function safeExtension(mimetype, originalName = "") {
  const fromName = String(originalName).match(/\.([a-z0-9]{1,8})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();

  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
  };
  return map[mimetype] || "bin";
}

function parseDataUrl(value, fallbackType = "application/octet-stream") {
  const text = String(value || "");
  const match = text.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s);
  if (!match) return null;

  return {
    mimetype: match[1] || fallbackType,
    buffer: Buffer.from(match[2], "base64"),
  };
}

async function uploadBuffer(buffer, mimetype, folder = "uploads", originalName = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  await ensureBucket();

  const extension = safeExtension(mimetype, originalName);
  const path = `${String(folder).replace(/^\/+|\/+$/g, "")}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "POST",
      headers: authHeaders({
        "Content-Type": mimetype || "application/octet-stream",
        "x-upsert": "true",
      }),
      body: buffer,
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase Storage upload failed (${response.status}): ${text}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function uploadDataUrl(value, fallbackType, folder = "uploads") {
  if (!value) return null;
  const parsed = parseDataUrl(value, fallbackType);

  // Already a URL: don't upload it again.
  if (!parsed) return String(value);

  return uploadBuffer(parsed.buffer, parsed.mimetype || fallbackType, folder);
}

module.exports = {
  uploadBuffer,
  uploadDataUrl,
};
