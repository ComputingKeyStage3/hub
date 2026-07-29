// Your Vercel backend address — no trailing slash.
// Example: "https://lesson-hub-abc123.vercel.app"
//
// If this is left as PASTE_..., the site still works perfectly: lessons simply
// run with every step open, exactly as they do now. Teacher-paced release only
// switches on once this points at your backend.
window.HUB = {
  API: "PASTE_YOUR_VERCEL_URL_HERE".replace(/\/+$/, "")
};
