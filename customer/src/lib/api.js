const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export { API_URL };

export function getCustomerToken() {
  return localStorage.getItem("customerToken");
}

export function clearCustomerSession() {
  localStorage.removeItem("customerToken");
  localStorage.removeItem("customerAuthenticated");
  localStorage.removeItem("customerUser");
  localStorage.removeItem("customerWalletPinSet");
  localStorage.removeItem("customerAuthVersion");
  localStorage.removeItem("customerWalletUnlockedAt");
}

export async function customerRequest(path, options = {}) {
  const token = getCustomerToken();

  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  let data = {};
  const text = await response.text();

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (response.status === 401) {
    clearCustomerSession();
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Request failed (${response.status})`
    );
  }

  return data;
}
