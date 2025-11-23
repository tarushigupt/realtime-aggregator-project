// src/routes/admin.ts
import { Router } from "express";
import redis, { getJson } from "../cache/redis";

const router = Router();

/**
 * Simple admin auth middleware
 * Accepts:
 *  - Authorization: Bearer <token>
 *  - x-admin-token: <token>
 */
function adminAuth(req: any, res: any, next: any) {
  const header = req.headers["authorization"];
  const bearer = typeof header === "string" && header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : null;
  const token = bearer || req.headers["x-admin-token"] || process.env.ADMIN_TOKEN;
  if (!process.env.ADMIN_TOKEN) {
    // If ADMIN_TOKEN isn't set, deny access to avoid accidental exposure
    return res.status(403).json({ error: "admin token not configured" });
  }
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
}

/**
 * GET /admin/snapshot/:query
 * - Protected by adminAuth
 * - Returns JSON snapshot (or 404 if not found)
 */
router.get("/snapshot/:query", adminAuth, async (req, res) => {
  try {
    const qRaw = String(req.params.query ?? "").trim().toLowerCase();
    if (!qRaw) return res.status(400).json({ error: "missing query" });

    const key = `snapshot:${qRaw}`;
    const payload = await getJson<any>(key);

    if (!payload) {
      return res.status(404).json({ error: "snapshot not found", key });
    }

    return res.json({ key, snapshot: payload });
  } catch (e: any) {
    console.error("[admin] snapshot error:", e);
    return res.status(500).json({ error: "internal_error", message: String(e?.message ?? e) });
  }
});

export default router;
