"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import type { ProductView } from "@/lib/queries";
import type { TaxConfig } from "@/lib/profit";
import { readSaved, writeSaved } from "./DecisionFilters";
import { ReviewCard } from "./ReviewBoard";
import type { CartState } from "./Cart";

/** Retour à la page précédente (ou à Buy Decisions si la fiche a été ouverte directement). */
export function BackButton() {
  const router = useRouter();
  return (
    <button type="button" className="btn-ghost" onClick={() => (window.history.length > 1 ? router.back() : router.push("/decisions"))}>
      <ArrowLeft size={15} /> Retour
    </button>
  );
}

/** Ajoute une unité au panier de Buy Decisions (même panier, conservé dans ce navigateur). */
export function AddToCartButton({ productId }: { productId: string }) {
  const [qty, setQty] = useState(0);
  useEffect(() => setQty(((readSaved().cart ?? {}) as CartState)[productId]?.qty ?? 0), [productId]);
  const add = () => {
    const cart = { ...((readSaved().cart ?? {}) as CartState) };
    cart[productId] = { ...cart[productId], qty: (cart[productId]?.qty ?? 0) + 1 };
    writeSaved({ cart });
    setQty(cart[productId].qty);
  };
  return (
    <span className="flex items-center gap-2">
      <button type="button" className="btn-primary" onClick={add}>
        <ShoppingCart size={15} /> Ajouter au panier
      </button>
      {qty > 0 && (
        <Link href="/decisions" className="text-xs text-accent hover:underline">
          {qty} dans le panier →
        </Link>
      )}
    </span>
  );
}

/** Éditeur complet (identique à la Weekly Review), ouvert par défaut. */
export function LeadEditor({ product, tax }: { product: ProductView; tax: TaxConfig }) {
  return <ReviewCard product={product} tax={tax} onSaved={() => undefined} defaultOpen />;
}
