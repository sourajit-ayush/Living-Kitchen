import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // White text on tomato-600 passes AA at any size; the large Cook button uses tomato-500 (see CookButton).
  primary: "bg-tomato-600 text-white hover:bg-chilli-700 shadow-pill",
  secondary: "bg-surface text-ink border border-border hover:bg-cream-200",
  ghost: "text-ink hover:bg-cream-200/70",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-[15px] gap-2",
  lg: "h-14 px-6 text-lg gap-2.5",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-control font-medium whitespace-nowrap transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
});

/** Square icon-only button; always pass an aria-label. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { "aria-label": string; size?: "sm" | "md" }
>(function IconButton({ className = "", size = "md", type = "button", ...props }, ref) {
  const dim = size === "sm" ? "size-8" : "size-11";
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-walnut-700 transition-colors duration-150 hover:bg-cream-200 disabled:opacity-40 ${dim} ${className}`}
      {...props}
    />
  );
});
