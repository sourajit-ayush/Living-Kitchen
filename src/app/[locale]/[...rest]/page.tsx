import { notFound } from "next/navigation";

/** Any unknown address under a language renders that language's 404 (with the site's layout). */
export default function CatchAll() {
  notFound();
}
