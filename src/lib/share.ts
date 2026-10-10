import type { Recipe } from "@/lib/ai/schema";
import { fingerprint } from "@/lib/sync/rows";

/**
 * A shared recipe's public address: its slug plus a fingerprint of the exact content, so sharing
 * the same recipe twice gives the same link, and two different recipes never collide.
 */
export function shareSlug(recipe: Recipe): string {
  const base = recipe.id.slice(0, 100).replace(/-+$/, "") || "recipe";
  return `${base}-${fingerprint(JSON.stringify(recipe))}`;
}

export const SHARE_CARD = { width: 1200, height: 630 } as const;

/** Public URL of a shared recipe's preview card in Supabase Storage. */
export function shareCardUrl(slug: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  return supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/share-cards/${slug}.jpg` : null;
}

/** The site's own address (absolute links in share text and OG tags). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function sharePath(locale: string, slug: string) {
  return `/${locale}/r/${slug}`;
}

/** WhatsApp deep link with the title and the link (works on phones and WhatsApp Web). */
export function whatsappUrl(title: string, url: string) {
  return `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;
}
