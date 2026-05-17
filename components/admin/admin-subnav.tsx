import Link from "next/link";

export type AdminSubnavSection = "items" | "orders" | "studio-prints";

type AdminSubnavProps = {
  current: AdminSubnavSection;
};

const LINKS: { id: AdminSubnavSection; href: string; label: string }[] = [
  { id: "items", href: "/admin", label: "Item manager" },
  { id: "orders", href: "/admin/orders", label: "Orders" },
  { id: "studio-prints", href: "/admin/studio-prints", label: "Studio prints" }
];

export function AdminSubnav({ current }: AdminSubnavProps) {
  return (
    <nav className="admin-subnav" aria-label="Admin sections">
      <ul className="admin-subnav-list">
        {LINKS.map((link) => {
          const isCurrent = link.id === current;
          return (
            <li key={link.id}>
              <Link
                href={link.href}
                className={`admin-subnav-link ${isCurrent ? "is-current" : ""}`}
                aria-current={isCurrent ? "page" : undefined}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
