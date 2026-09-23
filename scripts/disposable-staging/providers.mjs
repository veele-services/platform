import { STORAGE_BUCKETS, digest, fail, requireThat } from "./contract.mjs";

const PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 1000;
const MAX_PAGES = 5000;
const MAX_USERS = 100000;
const MAX_OBJECTS = 200000;

async function call(
  operation,
  {
    allow404 = false,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  } = {},
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let result;
    try {
      result = await operation();
    } catch {
      if (attempt === 2) fail("PROVIDER_NETWORK");
      await sleep(250 * 2 ** attempt);
      continue;
    }
    requireThat(
      result && typeof result === "object",
      "PROVIDER_RESPONSE_INVALID",
    );
    if (!result.error) return result;
    const status = Number(result.error.status ?? result.error.statusCode);
    if (allow404 && status === 404) return { data: null, missing: true };
    if ([429, 500, 502, 503, 504].includes(status) && attempt < 2) {
      await sleep(250 * 2 ** attempt);
      continue;
    }
    fail(status === 404 ? "PROVIDER_NOT_FOUND" : "PROVIDER_FAILED");
  }
  fail("PROVIDER_FAILED");
}

function assertObjectName(value) {
  requireThat(
    typeof value === "string" &&
      value.length > 0 &&
      value.length <= 1024 &&
      !value.includes("\0"),
    "STORAGE_NAME_INVALID",
  );
  return value;
}

export function createProviderControl(admin, options = {}) {
  const providerCall = (operation, config) =>
    call(operation, { sleep: options.sleep, ...config });

  async function bucketInventory() {
    const result = await providerCall(() => admin.storage.listBuckets());
    requireThat(Array.isArray(result.data), "STORAGE_BUCKET_RESPONSE_INVALID");
    const ids = result.data.map((bucket) => bucket?.id);
    requireThat(
      ids.every((id) => typeof id === "string") &&
        ids.length === new Set(ids).size,
      "STORAGE_BUCKET_RESPONSE_INVALID",
    );
    const unknown = ids.filter((id) => !STORAGE_BUCKETS.includes(id));
    requireThat(unknown.length === 0, "UNKNOWN_STORAGE_BUCKET");
    return ids.sort();
  }

  async function listBucketObjects(bucket) {
    const objects = [];
    const seenObjects = new Set();
    const seenDirectories = new Set([""]);
    const directories = [""];
    let pages = 0;
    while (directories.length > 0) {
      const prefix = directories.shift();
      let offset = 0;
      for (;;) {
        requireThat(++pages <= MAX_PAGES, "STORAGE_PAGINATION_LIMIT");
        const result = await providerCall(() =>
          admin.storage.from(bucket).list(prefix, {
            limit: PAGE_SIZE,
            offset,
            sortBy: { column: "name", order: "asc" },
          }),
        );
        requireThat(
          Array.isArray(result.data) && result.data.length <= PAGE_SIZE,
          "STORAGE_PAGE_INVALID",
        );
        if (result.data.length === 0) break;
        let newEntries = 0;
        for (const item of result.data) {
          const name = assertObjectName(item?.name);
          const path = prefix ? `${prefix}/${name}` : name;
          if (item.id === null || item.id === undefined) {
            requireThat(
              !seenDirectories.has(path),
              "STORAGE_PAGINATION_STALLED",
            );
            seenDirectories.add(path);
            directories.push(path);
          } else {
            requireThat(!seenObjects.has(path), "STORAGE_PAGINATION_STALLED");
            seenObjects.add(path);
            objects.push(path);
            requireThat(objects.length <= MAX_OBJECTS, "STORAGE_OBJECT_LIMIT");
          }
          newEntries += 1;
        }
        requireThat(newEntries > 0, "STORAGE_PAGINATION_STALLED");
        if (result.data.length < PAGE_SIZE) break;
        offset += result.data.length;
      }
    }
    return objects.sort();
  }

  async function storageInventory() {
    const configured = await bucketInventory();
    const objects = {};
    for (const bucket of configured)
      objects[bucket] = await listBucketObjects(bucket);
    return {
      configured,
      objects,
      count: Object.values(objects).reduce(
        (sum, paths) => sum + paths.length,
        0,
      ),
      digest: digest(objects),
    };
  }

  async function emptyStorage(expected) {
    const before = await storageInventory();
    requireThat(
      before.digest === expected.digest && before.count === expected.count,
      "STORAGE_INVENTORY_DRIFT",
      "QUIESCED",
      true,
    );
    for (const bucket of before.configured) {
      const paths = before.objects[bucket];
      for (let index = 0; index < paths.length; index += DELETE_BATCH_SIZE) {
        await providerCall(() =>
          admin.storage
            .from(bucket)
            .remove(paths.slice(index, index + DELETE_BATCH_SIZE)),
        );
      }
    }
    const after = await storageInventory();
    requireThat(
      after.count === 0,
      "STORAGE_DELETE_INCOMPLETE",
      "STORAGE_EMPTY",
      true,
    );
    return after;
  }

  async function authInventory() {
    const ids = [];
    const seen = new Set();
    for (let page = 1; page <= Math.ceil(MAX_USERS / PAGE_SIZE); page += 1) {
      const result = await providerCall(() =>
        admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE }),
      );
      const users = result.data?.users;
      requireThat(
        Array.isArray(users) && users.length <= PAGE_SIZE,
        "AUTH_PAGE_INVALID",
      );
      for (const user of users) {
        requireThat(
          typeof user?.id === "string" && !seen.has(user.id),
          "AUTH_PAGINATION_STALLED",
        );
        seen.add(user.id);
        ids.push(user.id);
        requireThat(ids.length <= MAX_USERS, "AUTH_USER_LIMIT");
      }
      if (users.length < PAGE_SIZE)
        return {
          ids: ids.sort(),
          count: ids.length,
          digest: digest(ids.sort()),
        };
    }
    fail("AUTH_PAGINATION_LIMIT");
  }

  async function emptyAuth(expected) {
    const before = await authInventory();
    requireThat(
      before.digest === expected.digest && before.count === expected.count,
      "AUTH_INVENTORY_DRIFT",
      "STORAGE_EMPTY",
      true,
    );
    for (const id of before.ids) {
      await providerCall(() => admin.auth.admin.deleteUser(id, false), {
        allow404: true,
      });
    }
    const after = await authInventory();
    requireThat(
      after.count === 0,
      "AUTH_DELETE_INCOMPLETE",
      "AUTH_EMPTY",
      true,
    );
    return after;
  }

  async function createIdentity({ email, password, name, portal, role }) {
    const result = await providerCall(() =>
      admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { portal, role, rebuilt_by: "disposable-staging-v1" },
        user_metadata: { full_name: name, name },
      }),
    );
    requireThat(
      typeof result.data?.user?.id === "string",
      "AUTH_CREATE_INVALID",
      "MIGRATED",
      true,
    );
    return result.data.user.id;
  }

  async function preflight() {
    const storage = await storageInventory();
    const auth = await authInventory();
    return { storage, auth };
  }

  return {
    authInventory,
    bucketInventory,
    createIdentity,
    emptyAuth,
    emptyStorage,
    preflight,
    storageInventory,
  };
}
