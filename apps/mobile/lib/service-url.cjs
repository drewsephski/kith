/** The hosted release endpoint is a public origin, never a credential-bearing URL. */
/** @param {string} value */
function hostedServiceOrigin(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("RAKAZO_SERVICE_URL must be a valid public HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    isLocalServiceHost(url.hostname)
  ) {
    throw new Error(
      "RAKAZO_SERVICE_URL must be a public HTTPS origin without credentials or a path.",
    );
  }
  return url.origin;
}

/** @param {string} hostname */
function isLocalServiceHost(hostname) {
  const host = hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "::1" ||
    host === "::" ||
    host.startsWith("::ffff:") ||
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    /^fe[89ab][0-9a-f]:/i.test(host)
  )
    return true;
  const octets = host.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second !== undefined && second >= 64 && second <= 127)
  );
}

module.exports = { hostedServiceOrigin };
