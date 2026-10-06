async function request(url, options = {}) {
  const res = await fetch(url, { cache: "no-store", ...options });
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const error = new Error(typeof data.error === "string" ? data.error : "Request failed");
    error.status = res.status;
    throw error;
  }
  return data;
}

function json(method, body) {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const signalAPI = {
  options: () => request("/api/signals/options"),
  listPublic: () => request("/api/signals"),
  listMine: () => request("/api/signals?mine=1"),
  get: (slug) => request(`/api/signals/${encodeURIComponent(slug)}`),
  create: (body) => request("/api/signals", json("POST", body)),
  update: (slug, body) => request(`/api/signals/${encodeURIComponent(slug)}`, json("PATCH", body)),
  remove: (slug) => request(`/api/signals/${encodeURIComponent(slug)}`, { method: "DELETE" }),
  candidates: (slug, window) =>
    request(`/api/signals/${encodeURIComponent(slug)}/candidates${window ? `?window=${window}` : ""}`),
  generate: (slug, formData) =>
    request(`/api/signals/${encodeURIComponent(slug)}/items`, { method: "POST", body: formData }),
  items: (slug) => request(`/api/signals/${encodeURIComponent(slug)}/items`),
  item: (slug, id) => request(`/api/signals/${encodeURIComponent(slug)}/items/${encodeURIComponent(id)}`),
  setPublished: (slug, id, published) =>
    request(`/api/signals/${encodeURIComponent(slug)}/items/${encodeURIComponent(id)}`, json("PATCH", { published })),
  removeItem: (slug, id) =>
    request(`/api/signals/${encodeURIComponent(slug)}/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
